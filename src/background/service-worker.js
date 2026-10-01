import { DEFAULT_SETTINGS, MESSAGE, STORAGE } from '../config/constants.js';
import { GitHubApiError, GitHubClient } from '../github/github-client.js';
import { createRequestId } from '../utils/helpers.js';
import { authenticateWithGitHub } from './oauth.js';
import { createSubmissionService } from './submission-service.js';

const submissionService = createSubmissionService({
  storage: chrome.storage.local,
  clientFactory: (token) => new GitHubClient(token),
  onAuthExpired: clearAuthentication,
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(STORAGE.settings);
  if (!stored[STORAGE.settings]) {
    await chrome.storage.local.set({ [STORAGE.settings]: DEFAULT_SETTINGS });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  routeMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({
      success: false,
      error: error.message,
      type: 'INTERNAL_ERROR',
      requestId: message?.requestId,
    }));
  return true;
});

async function routeMessage(message, sender) {
  const startedAt = performance.now();
  const requestId = validRequestId(message?.requestId) ? message.requestId : createRequestId();
  let response;

  try {
    if (!message || typeof message.type !== 'string') throw new Error('Message type is required.');
    switch (message.type) {
      case MESSAGE.authStart:
        response = await startAuthentication();
        break;
      case MESSAGE.authLogout:
        await clearAuthentication();
        response = { success: true };
        break;
      case MESSAGE.authValidate:
        response = await validateAuthentication();
        break;
      case MESSAGE.repoList:
        response = { success: true, repositories: await authenticatedClient().then((client) => client.listRepositories()) };
        break;
      case MESSAGE.repoSelect:
        response = await selectRepository(message.payload);
        break;
      case MESSAGE.repoCreate:
        response = await createRepository(message.payload);
        break;
      case MESSAGE.settingsSave:
        response = await saveSettings(message.payload);
        break;
      case MESSAGE.statusGet:
        response = await getStatus();
        break;
      case MESSAGE.submissionAccepted:
        assertLeetCodeSender(sender);
        response = await submissionService.sync(message.payload, requestId);
        break;
      default:
        response = { success: false, type: 'UNKNOWN_MESSAGE', error: `Unknown message type: ${message.type}` };
    }
  } catch (error) {
    if (error instanceof GitHubApiError && error.type === 'AUTH_EXPIRED') await clearAuthentication();
    response = { success: false, type: error.type || 'REQUEST_FAILED', error: error.message };
  }

  response.requestId ||= requestId;
  console.info('[LeetSync]', JSON.stringify({
    requestId,
    type: message?.type,
    success: response.success,
    outcome: response.type || 'OK',
    durationMs: Math.round(performance.now() - startedAt),
  }));
  return response;
}

async function startAuthentication() {
  const { token } = await authenticateWithGitHub({
    identity: chrome.identity,
    sessionStorage: chrome.storage.session,
  });
  const client = new GitHubClient(token);
  const user = await client.getAuthenticatedUser();
  await chrome.storage.local.set({ [STORAGE.authToken]: token, [STORAGE.user]: user });
  await setBadge('');
  return { success: true, user };
}

async function validateAuthentication() {
  const stored = await chrome.storage.local.get(STORAGE.authToken);
  if (!stored[STORAGE.authToken]) return { success: true, valid: false };
  try {
    const user = await new GitHubClient(stored[STORAGE.authToken]).getAuthenticatedUser();
    await chrome.storage.local.set({ [STORAGE.user]: user });
    return { success: true, valid: true, user };
  } catch (error) {
    if (error instanceof GitHubApiError && error.type === 'AUTH_EXPIRED') {
      await clearAuthentication();
      return { success: true, valid: false };
    }
    throw error;
  }
}

async function authenticatedClient() {
  const stored = await chrome.storage.local.get(STORAGE.authToken);
  if (!stored[STORAGE.authToken]) {
    const error = new Error('Authenticate with GitHub first.');
    error.type = 'AUTH_REQUIRED';
    throw error;
  }
  return new GitHubClient(stored[STORAGE.authToken]);
}

async function selectRepository(payload) {
  if (!payload?.owner || !payload?.name) throw new Error('Repository owner and name are required.');
  const repository = await (await authenticatedClient()).getRepository(payload.owner, payload.name);
  await chrome.storage.local.set({ [STORAGE.repository]: repository });
  return { success: true, repository };
}

async function createRepository(payload) {
  const name = String(payload?.name || '').trim();
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) throw new Error('Enter a valid repository name.');
  const repository = await (await authenticatedClient()).createRepository(name, payload?.private);
  await chrome.storage.local.set({ [STORAGE.repository]: repository });
  return { success: true, repository };
}

async function saveSettings(payload) {
  const settings = {
    ...DEFAULT_SETTINGS,
    autoSync: payload?.autoSync !== false,
    generateReadme: payload?.generateReadme !== false,
    includePerformance: payload?.includePerformance !== false,
  };
  await chrome.storage.local.set({ [STORAGE.settings]: settings });
  return { success: true, settings };
}

async function getStatus() {
  const stored = await chrome.storage.local.get([
    STORAGE.authToken,
    STORAGE.user,
    STORAGE.repository,
    STORAGE.settings,
    STORAGE.history,
  ]);
  return {
    success: true,
    authenticated: Boolean(stored[STORAGE.authToken] && stored[STORAGE.user]),
    user: stored[STORAGE.user] || null,
    repository: stored[STORAGE.repository] || null,
    settings: { ...DEFAULT_SETTINGS, ...(stored[STORAGE.settings] || {}) },
    history: stored[STORAGE.history] || [],
  };
}

async function clearAuthentication() {
  await chrome.storage.local.remove([STORAGE.authToken, STORAGE.user, STORAGE.repository]);
  await setBadge('!');
}

async function setBadge(text) {
  await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  await chrome.action.setBadgeText({ text });
}

function assertLeetCodeSender(sender) {
  if (!sender?.url?.startsWith('https://leetcode.com/problems/')) {
    const error = new Error('Submission messages are accepted only from LeetCode problem pages.');
    error.type = 'INVALID_SENDER';
    throw error;
  }
}

function validRequestId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,100}$/.test(value);
}
