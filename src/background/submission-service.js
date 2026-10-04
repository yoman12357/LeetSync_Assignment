import { DEFAULT_SETTINGS, LIMITS, STORAGE } from '../config/constants.js';
import { GitHubApiError } from '../github/github-client.js';
import {
  addBoundedEntry,
  buildCommitMessage,
  createFingerprint,
  getFileExtension,
  getLanguageName,
  normalizeCode,
  normalizeProblemPath,
  performanceHeader,
  problemReadme,
} from '../utils/helpers.js';

export function createSubmissionService({ storage, clientFactory, onAuthExpired = async () => {} }) {
  const queues = new Map();

  return {
    sync(payload, requestId) {
      const queueKey = `${payload?.problemSlug || 'unknown'}:${payload?.language || 'unknown'}`;
      const previous = queues.get(queueKey) || Promise.resolve();
      const current = previous.catch(() => {}).then(() => processSubmission({ storage, clientFactory, onAuthExpired }, payload, requestId));
      queues.set(queueKey, current);
      const cleanup = () => {
        if (queues.get(queueKey) === current) queues.delete(queueKey);
      };
      current.then(cleanup, cleanup);
      return current;
    },
  };
}

async function processSubmission(dependencies, payload, requestId) {
  validateSubmission(payload);
  const stored = await dependencies.storage.get([
    STORAGE.authToken,
    STORAGE.repository,
    STORAGE.settings,
    STORAGE.fingerprints,
    STORAGE.history,
  ]);
  const token = stored[STORAGE.authToken];
  const repository = stored[STORAGE.repository];
  if (!token) return failure('AUTH_REQUIRED', 'Authenticate with GitHub before synchronizing.', requestId);
  if (!repository) return failure('REPOSITORY_REQUIRED', 'Select a GitHub repository before synchronizing.', requestId);

  const settings = { ...DEFAULT_SETTINGS, ...(stored[STORAGE.settings] || {}) };
  if (!settings.autoSync) return failure('AUTO_SYNC_DISABLED', 'Automatic synchronization is disabled.', requestId);
  const extension = getFileExtension(payload.language);
  if (!extension) return failure('UNSUPPORTED_LANGUAGE', `Unsupported language: ${payload.language}`, requestId);

  const source = normalizeCode(payload.code);
  if (!source) return failure('INVALID_SOURCE', 'The submitted source code is empty.', requestId);
  if (new TextEncoder().encode(source).byteLength > LIMITS.sourceBytes) {
    return failure('SOURCE_TOO_LARGE', 'The submitted source code is too large to synchronize.', requestId);
  }

  const folder = normalizeProblemPath(payload.problemSlug, payload.problemId);
  const solutionPath = `${folder}/solution.${extension}`;
  const readmePath = `${folder}/README.md`;
  const decoratedSource = settings.includePerformance
    ? `${performanceHeader(extension, payload.stats)}${source}`
    : source;
  const fingerprint = await createFingerprint(payload.problemSlug, extension, source);
  const client = dependencies.clientFactory(token);

  try {
    const existing = await client.getFile(repository.owner, repository.name, solutionPath);
    const destination = {
      repository: `${repository.owner}/${repository.name}`,
      path: solutionPath,
      url: existing.url || `https://github.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/blob/${encodeURIComponent(repository.defaultBranch || 'main')}/${solutionPath.split('/').map(encodeURIComponent).join('/')}`,
    };
    if (existing.exists && normalizeCode(existing.content) === normalizeCode(decoratedSource)) {
      await storeSuccess(dependencies.storage, stored, fingerprint, payload, 'skipped', requestId, destination);
      return { success: true, type: 'SKIPPED_DUPLICATE', message: `Already saved in ${destination.repository}: ${solutionPath}`, requestId, ...destination };
    }

    const action = existing.exists ? 'update' : 'create';
    const message = buildCommitMessage(
      settings.commitPrefix,
      payload.problemId,
      payload.title,
      getLanguageName(extension),
      action,
    );
    const result = await putWithConflictRecovery(client, repository, solutionPath, decoratedSource, message, existing);
    destination.url = result.url || destination.url;
    const warnings = [];

    if (settings.generateReadme) {
      try {
        await syncReadme(client, repository, readmePath, payload, message);
      } catch (error) {
        warnings.push(`Solution saved, but README synchronization failed: ${error.message}`);
      }
    }

    await storeSuccess(dependencies.storage, stored, fingerprint, payload, action === 'create' ? 'created' : 'updated', requestId, destination);
    return {
      success: true,
      type: 'SYNC_SUCCESS',
      action,
      message: `${payload.title} was ${action === 'create' ? 'added to' : 'updated in'} GitHub.`,
      requestId,
      result,
      warnings,
      ...destination,
    };
  } catch (error) {
    if (error instanceof GitHubApiError && error.type === 'AUTH_EXPIRED') await dependencies.onAuthExpired();
    return failure(error.type || 'SYNC_FAILED', error.message, requestId);
  }
}

async function putWithConflictRecovery(client, repository, path, content, message, existing) {
  try {
    return await client.putFile(repository.owner, repository.name, path, content, message, existing.sha);
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.type !== 'CONFLICT') throw error;
    const fresh = await client.getFile(repository.owner, repository.name, path);
    if (fresh.exists && normalizeCode(fresh.content) === normalizeCode(content)) {
      return { path, sha: fresh.sha, url: fresh.url, duplicateAfterConflict: true };
    }
    return client.putFile(repository.owner, repository.name, path, content, message, fresh.sha);
  }
}

async function syncReadme(client, repository, path, payload, message) {
  const content = problemReadme(payload);
  const existing = await client.getFile(repository.owner, repository.name, path);
  if (existing.exists && normalizeCode(existing.content) === normalizeCode(content)) return;
  await client.putFile(repository.owner, repository.name, path, content, message, existing.sha);
}

async function storeSuccess(storage, stored, fingerprint, payload, action, requestId, destination) {
  const timestamp = Date.now();
  const fingerprints = addBoundedEntry(stored[STORAGE.fingerprints], fingerprint, timestamp);
  const history = [{
    action,
    title: payload.title,
    language: payload.language,
    problemSlug: payload.problemSlug,
    problemId: payload.problemId,
    ...destination,
    requestId,
    timestamp,
  }, ...(stored[STORAGE.history] || [])].slice(0, LIMITS.history);
  await storage.set({ [STORAGE.fingerprints]: fingerprints, [STORAGE.history]: history });
}

function validateSubmission(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Submission payload is missing.');
  if (!/^\d+$/.test(payload.submissionId || '')) {
    const error = new Error('This tab is using an older LeetSync script. Refresh the LeetCode tab and submit again.');
    error.type = 'PAGE_RELOAD_REQUIRED';
    throw error;
  }
  for (const field of ['problemSlug', 'problemId', 'title', 'language', 'code']) {
    if (typeof payload[field] !== 'string' || !payload[field].trim()) throw new Error(`Submission field is invalid: ${field}`);
  }
  if (!/^https:\/\/leetcode\.com\/problems\/[a-z0-9-]+\/?/.test(payload.url || '')) {
    throw new Error('Submission URL is not a supported LeetCode problem URL.');
  }
}

function failure(type, message, requestId) {
  return { success: false, type, message, error: message, requestId };
}
