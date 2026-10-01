import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHubApiError, GitHubClient } from '../src/github/github-client.js';

test('sends authenticated GitHub headers', async () => {
  let request;
  const client = clientWith(async (url, options) => {
    request = { url, options };
    return jsonResponse({ login: 'aryan', name: 'Aryan' });
  });
  const user = await client.getAuthenticatedUser();
  assert.equal(user.login, 'aryan');
  assert.equal(request.options.headers.Authorization, 'Bearer test-token');
  assert.equal(request.options.headers['X-GitHub-Api-Version'], '2022-11-28');
});

test('lists only repositories with push permission', async () => {
  const client = clientWith(async () => jsonResponse([
    repository(1, 'writeable', true),
    repository(2, 'readonly', false),
  ]));
  const repositories = await client.listRepositories();
  assert.deepEqual(repositories.map((item) => item.name), ['writeable']);
});

test('returns a missing result for an absent file', async () => {
  const client = clientWith(async () => jsonResponse({ message: 'Not Found' }, 404));
  assert.deepEqual(await client.getFile('owner', 'repo', '0001-two-sum/solution.py'), {
    exists: false,
    content: null,
    sha: null,
  });
});

test('decodes file content and supplies SHA when updating', async () => {
  const calls = [];
  const client = clientWith(async (_url, options = {}) => {
    calls.push(options);
    if (!options.method) return jsonResponse({ type: 'file', content: btoa('print(1)'), sha: 'old-sha' });
    return jsonResponse({ content: { path: 'solution.py', sha: 'new-sha', html_url: 'https://github.com/file' }, commit: { sha: 'commit-sha' } }, 200);
  });
  const file = await client.getFile('owner', 'repo', 'solution.py');
  assert.equal(file.content, 'print(1)');
  const result = await client.putFile('owner', 'repo', 'solution.py', 'print(2)', 'Update', file.sha);
  assert.equal(result.sha, 'new-sha');
  assert.equal(JSON.parse(calls[1].body).sha, 'old-sha');
});

test('retries server failures and exposes authentication failures', async () => {
  let attempts = 0;
  const client = clientWith(async () => {
    attempts += 1;
    return attempts === 1 ? jsonResponse({ message: 'Temporary' }, 500) : jsonResponse({ login: 'aryan' });
  });
  assert.equal((await client.getAuthenticatedUser()).login, 'aryan');
  assert.equal(attempts, 2);

  const invalid = clientWith(async () => jsonResponse({ message: 'Bad credentials' }, 401));
  await assert.rejects(() => invalid.getAuthenticatedUser(), (error) => error instanceof GitHubApiError && error.type === 'AUTH_EXPIRED');
});

test('retries network failures and reports a typed terminal error', async () => {
  let attempts = 0;
  const recovered = clientWith(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('offline');
    return jsonResponse({ login: 'aryan' });
  });
  assert.equal((await recovered.getAuthenticatedUser()).login, 'aryan');
  assert.equal(attempts, 2);

  const unavailable = clientWith(async () => { throw new Error('offline'); });
  await assert.rejects(() => unavailable.getAuthenticatedUser(), (error) => error instanceof GitHubApiError && error.type === 'NETWORK');
});

function clientWith(fetch) {
  return new GitHubClient('test-token', { fetch, sleep: async () => {} });
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function repository(id, name, push) {
  return {
    id,
    name,
    full_name: `owner/${name}`,
    owner: { login: 'owner' },
    private: false,
    html_url: `https://github.com/owner/${name}`,
    permissions: { push },
  };
}
