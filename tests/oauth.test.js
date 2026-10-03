import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateWithGitHub } from '../src/background/oauth.js';

test('OAuth client identifies the extension on config and token requests', async (context) => {
  const extensionId = 'a'.repeat(32);
  const redirectUri = `https://${extensionId}.chromiumapp.org/`;
  const originalChrome = globalThis.chrome;
  globalThis.chrome = { runtime: {} };
  context.after(() => {
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
  });
  const stored = {};
  const requests = [];
  const result = await authenticateWithGitHub({
    identity: {
      getRedirectURL: () => redirectUri,
      launchWebAuthFlow: ({ url }, callback) => {
        const authorization = new URL(url);
        assert.equal(authorization.searchParams.get('redirect_uri'), redirectUri);
        assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
        callback(`${redirectUri}?code=authorization_code_12345&state=${authorization.searchParams.get('state')}`);
      },
    },
    sessionStorage: {
      async set(value) { Object.assign(stored, value); },
      async get(key) { return { [key]: stored[key] }; },
      async remove(key) { delete stored[key]; },
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return Response.json(url.endsWith('/api/config')
        ? { clientId: 'client-id' }
        : { accessToken: 'test-token' });
    },
  });
  assert.equal(result.token, 'test-token');
  assert.equal(requests.length, 2);
  for (const { options } of requests) {
    assert.equal(options.headers['X-LeetSync-Extension-Id'], extensionId);
    assert.equal(options.headers['X-Request-Id'], result.requestId);
  }
  assert.equal(JSON.parse(requests[1].options.body).redirectUri, redirectUri);
  assert.deepEqual(stored, {});
});
