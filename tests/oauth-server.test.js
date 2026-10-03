import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { createOauthHandler, createOauthServer } from '../server/oauth-server.js';

const extensionId = 'a'.repeat(32);
const origin = `chrome-extension://${extensionId}`;

test('OAuth routes enforce origin, validate input, and trace successful exchanges', async (context) => {
  let forwarded;
  const server = createOauthServer({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    allowedExtensionIds: [extensionId],
    logger: { info() {} },
    fetch: async (_url, options) => {
      forwarded = JSON.parse(options.body);
      return jsonResponse({ access_token: 'token-value', token_type: 'bearer', scope: 'repo read:user' });
    },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${baseUrl}/health`, { headers: { 'X-Request-Id': 'request-health-1' } });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).configured, true);

  const deployedHealth = await fetch(`${baseUrl}/api/health`, { headers: { 'X-Request-Id': 'request-health-2' } });
  assert.equal(deployedHealth.status, 200);
  assert.equal((await deployedHealth.json()).configured, true);

  const preflight = await fetch(`${baseUrl}/api/github/token`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);

  const rejected = await fetch(`${baseUrl}/api/config`);
  assert.equal(rejected.status, 403);

  const config = await fetch(`${baseUrl}/api/config`, { headers: { Origin: origin, 'X-Request-Id': 'request-config-1' } });
  assert.equal(config.status, 200);
  assert.equal((await config.json()).clientId, 'client-id');
  assert.equal(config.headers.get('x-request-id'), 'request-config-1');

  const invalid = await fetch(`${baseUrl}/api/github/token`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'short' }),
  });
  assert.equal(invalid.status, 400);

  const response = await fetch(`${baseUrl}/api/github/token`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Request-Id': 'request-token-1' },
    body: JSON.stringify({
      code: 'authorization_code_12345',
      codeVerifier: 'v'.repeat(48),
      redirectUri: `https://${extensionId}.chromiumapp.org/`,
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.accessToken, 'token-value');
  assert.equal(body.requestId, 'request-token-1');
  assert.equal(forwarded.code_verifier, 'v'.repeat(48));
  assert.equal(forwarded.client_secret, 'client-secret');

  const missing = await fetch(`${baseUrl}/missing`, { headers: { Origin: origin } });
  assert.equal(missing.status, 404);
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('background requests without Origin accept only allowed IDs and matching callbacks', async (context) => {
  const secondId = 'b'.repeat(32);
  let exchanges = 0;
  const server = createOauthServer({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    allowedExtensionIds: [extensionId, secondId],
    logger: { info() {} },
    fetch: async () => {
      exchanges++;
      return jsonResponse({ access_token: 'token-value' });
    },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-LeetSync-Extension-Id': extensionId };

  const config = await fetch(`${baseUrl}/api/config`, { headers });
  assert.equal(config.status, 200);
  assert.equal((await config.json()).clientId, 'client-id');
  assert.equal(config.headers.get('access-control-allow-origin'), null);

  for (const rejectedHeaders of [
    {},
    { 'X-LeetSync-Extension-Id': 'c'.repeat(32) },
    { ...headers, Origin: 'https://example.com' },
    { ...headers, Origin: `chrome-extension://${secondId}` },
  ]) {
    const rejected = await fetch(`${baseUrl}/api/config`, { headers: rejectedHeaders });
    assert.equal(rejected.status, 403);
  }

  const exchangeBody = {
    code: 'authorization_code_12345',
    codeVerifier: 'v'.repeat(48),
    redirectUri: `https://${extensionId}.chromiumapp.org/`,
  };
  const response = await fetch(`${baseUrl}/api/github/token`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(exchangeBody),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).accessToken, 'token-value');

  const mismatch = await fetch(`${baseUrl}/api/github/token`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...exchangeBody, redirectUri: `https://${secondId}.chromiumapp.org/` }),
  });
  assert.equal(mismatch.status, 400);
  assert.equal(exchanges, 1);
});

test('Vercel-style parsed request bodies complete the OAuth exchange', async (context) => {
  let exchanges = 0;
  const handler = createOauthHandler({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    allowedExtensionIds: [extensionId],
    logger: { info() {} },
    fetch: async () => {
      exchanges++;
      return jsonResponse({ access_token: 'vercel-token' });
    },
  });
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    request.body = JSON.parse(Buffer.concat(chunks).toString());
    await handler(request, response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => server.close());
  const endpoint = `http://127.0.0.1:${server.address().port}/api/github/token`;
  const headers = { 'Content-Type': 'application/json', 'X-LeetSync-Extension-Id': extensionId };
  const body = {
    code: 'authorization_code_12345',
    codeVerifier: 'v'.repeat(48),
    redirectUri: `https://${extensionId}.chromiumapp.org/`,
  };
  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).accessToken, 'vercel-token');

  const oversized = await fetch(endpoint, {
    method: 'POST', headers, body: JSON.stringify({ ...body, padding: 'x'.repeat(17000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal(exchanges, 1);
});
