import assert from 'node:assert/strict';
import test from 'node:test';
import { createSubmissionService } from '../src/background/submission-service.js';
import { GitHubApiError } from '../src/github/github-client.js';
import { STORAGE } from '../src/config/constants.js';

const submission = {
  problemSlug: 'two-sum',
  problemId: '1',
  title: 'Two Sum',
  language: 'python3',
  code: 'class Solution:\n    pass',
  stats: null,
  description: 'Return the matching indices.',
  difficulty: 'Easy',
  url: 'https://leetcode.com/problems/two-sum/',
};

test('creates a new solution, README, fingerprint, and traceable history', async () => {
  const storage = memoryStorage(configuredState());
  const writes = [];
  const client = {
    getFile: async () => ({ exists: false, content: null, sha: null }),
    putFile: async (...args) => {
      writes.push(args);
      return { path: args[2], sha: 'new-sha' };
    },
  };
  const service = createSubmissionService({ storage, clientFactory: () => client });
  const result = await service.sync(submission, 'request-create');

  assert.equal(result.success, true);
  assert.equal(result.action, 'create');
  assert.equal(writes.length, 2);
  assert.equal(writes[0][2], '0001-two-sum/solution.py');
  assert.equal(writes[1][2], '0001-two-sum/README.md');
  assert.equal(storage.state[STORAGE.history][0].requestId, 'request-create');
  assert.equal(Object.keys(storage.state[STORAGE.fingerprints]).length, 1);
});

test('treats identical GitHub content as an idempotent no-op', async () => {
  const storage = memoryStorage(configuredState());
  let writes = 0;
  const client = {
    getFile: async (owner, repository, path) => path.endsWith('.py')
      ? { exists: true, content: submission.code, sha: 'sha' }
      : { exists: false, content: null, sha: null },
    putFile: async () => { writes += 1; },
  };
  storage.state[STORAGE.settings].includePerformance = false;
  const result = await createSubmissionService({ storage, clientFactory: () => client }).sync(submission, 'request-duplicate');
  assert.equal(result.type, 'SKIPPED_DUPLICATE');
  assert.equal(writes, 0);
});

test('recovers once from a stale SHA conflict', async () => {
  const storage = memoryStorage(configuredState());
  storage.state[STORAGE.settings].generateReadme = false;
  let reads = 0;
  let writes = 0;
  const client = {
    getFile: async () => ({ exists: true, content: reads++ ? 'changed elsewhere' : 'old code', sha: reads === 1 ? 'old-sha' : 'fresh-sha' }),
    putFile: async (_owner, _repository, _path, _content, _message, sha) => {
      writes += 1;
      if (writes === 1) throw new GitHubApiError({ type: 'CONFLICT', message: 'Conflict', retryable: true }, 409);
      return { sha, path: '0001-two-sum/solution.py' };
    },
  };
  const result = await createSubmissionService({ storage, clientFactory: () => client }).sync(submission, 'request-conflict');
  assert.equal(result.success, true);
  assert.equal(writes, 2);
  assert.equal(result.result.sha, 'fresh-sha');
});

test('clears authentication after GitHub reports an expired token', async () => {
  const storage = memoryStorage(configuredState());
  let cleared = false;
  const client = {
    getFile: async () => { throw new GitHubApiError({ type: 'AUTH_EXPIRED', message: 'Expired', retryable: false }, 401); },
  };
  const result = await createSubmissionService({
    storage,
    clientFactory: () => client,
    onAuthExpired: async () => { cleared = true; },
  }).sync(submission, 'request-expired');
  assert.equal(result.type, 'AUTH_EXPIRED');
  assert.equal(cleared, true);
});

function configuredState() {
  return {
    [STORAGE.authToken]: 'token',
    [STORAGE.repository]: { owner: 'owner', name: 'solutions' },
    [STORAGE.settings]: { autoSync: true, generateReadme: true, includePerformance: true, commitPrefix: 'LeetSync' },
    [STORAGE.fingerprints]: {},
    [STORAGE.history]: [],
  };
}

function memoryStorage(initial) {
  return {
    state: structuredClone(initial),
    async get(keys) {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested.map((key) => [key, this.state[key]]));
    },
    async set(values) { Object.assign(this.state, values); },
  };
}
