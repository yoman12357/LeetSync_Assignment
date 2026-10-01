import http from 'node:http';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const BODY_LIMIT = 16 * 1024;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;

export function createOauthServer(options = {}) {
  const config = {
    clientId: options.clientId ?? process.env.GITHUB_CLIENT_ID ?? '',
    clientSecret: options.clientSecret ?? process.env.GITHUB_CLIENT_SECRET ?? '',
    allowedExtensionIds: options.allowedExtensionIds ?? parseAllowedIds(process.env.ALLOWED_EXTENSION_IDS),
    fetch: options.fetch ?? globalThis.fetch,
    logger: options.logger ?? console,
  };

  return http.createServer(async (request, response) => {
    const startedAt = performance.now();
    const requestId = validRequestId(request.headers['x-request-id']) ? request.headers['x-request-id'] : crypto.randomUUID();
    let status = 500;
    let outcome = 'INTERNAL_ERROR';
    let cors = null;

    try {
      const origin = request.headers.origin || '';
      cors = corsHeaders(origin, config.allowedExtensionIds);
      if (request.method === 'OPTIONS') {
        if (!cors) {
          status = 403;
          outcome = 'ORIGIN_REJECTED';
          return send(response, status, { error: 'Origin is not allowed.', requestId });
        }
        response.writeHead(204, cors);
        response.end();
        status = 204;
        outcome = 'PREFLIGHT';
        return;
      }

      if (request.method === 'GET' && request.url === '/health') {
        status = 200;
        outcome = 'HEALTHY';
        return send(response, status, { status: 'ok', configured: Boolean(config.clientId && config.clientSecret && config.allowedExtensionIds.length), requestId }, cors);
      }

      if (request.method === 'GET' && request.url === '/api/config') {
        if (!cors) {
          status = 403;
          outcome = 'ORIGIN_REJECTED';
          return send(response, status, { error: 'Extension origin is not allowed.', requestId });
        }
        if (!config.clientId) {
          status = 503;
          outcome = 'NOT_CONFIGURED';
          return send(response, status, { error: 'GITHUB_CLIENT_ID is not configured.', requestId }, cors);
        }
        status = 200;
        outcome = 'CONFIG_RETURNED';
        return send(response, status, { clientId: config.clientId, requestId }, cors);
      }

      if (request.method === 'POST' && request.url === '/api/github/token') {
        if (!cors) {
          status = 403;
          outcome = 'ORIGIN_REJECTED';
          return send(response, status, { error: 'Extension origin is not allowed.', requestId });
        }
        if (!config.clientId || !config.clientSecret) {
          status = 503;
          outcome = 'NOT_CONFIGURED';
          return send(response, status, { error: 'GitHub OAuth credentials are not configured.', requestId }, cors);
        }
        const body = await readJson(request);
        validateExchangeRequest(body, config.allowedExtensionIds);
        const githubResponse = await config.fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          signal: AbortSignal.timeout(10_000),
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code: body.code,
            code_verifier: body.codeVerifier,
            redirect_uri: body.redirectUri,
          }),
        });
        const token = await githubResponse.json();
        if (!githubResponse.ok || !token.access_token) {
          status = 400;
          outcome = 'GITHUB_REJECTED';
          return send(response, status, { error: token.error_description || token.error || 'GitHub rejected the token exchange.', requestId }, cors);
        }
        status = 200;
        outcome = 'TOKEN_ISSUED';
        return send(response, status, { accessToken: token.access_token, tokenType: token.token_type, scope: token.scope, requestId }, cors);
      }

      status = 404;
      outcome = 'NOT_FOUND';
      return send(response, status, { error: 'Route not found.', requestId }, cors);
    } catch (error) {
      status = error.status || 500;
      outcome = error.type || 'INTERNAL_ERROR';
      return send(response, status, { error: status === 500 ? 'OAuth service failed unexpectedly.' : error.message, requestId }, cors || {});
    } finally {
      config.logger.info(JSON.stringify({
        requestId,
        method: request.method,
        path: request.url,
        status,
        outcome,
        durationMs: Math.round(performance.now() - startedAt),
      }));
    }
  });
}

function validateExchangeRequest(body, allowedIds) {
  if (!body || typeof body !== 'object') throw httpError(400, 'INVALID_BODY', 'A JSON request body is required.');
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(body.code || '')) throw httpError(400, 'INVALID_CODE', 'Authorization code is invalid.');
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(body.codeVerifier || '')) throw httpError(400, 'INVALID_VERIFIER', 'PKCE verifier is invalid.');
  let redirect;
  try { redirect = new URL(body.redirectUri); } catch { throw httpError(400, 'INVALID_REDIRECT', 'Redirect URI is invalid.'); }
  const match = redirect.hostname.match(/^([a-p]{32})\.chromiumapp\.org$/);
  if (redirect.protocol !== 'https:' || !match || (allowedIds.length && !allowedIds.includes(match[1]))) {
    throw httpError(400, 'INVALID_REDIRECT', 'Redirect URI does not belong to an allowed extension.');
  }
}

function corsHeaders(origin, allowedIds) {
  const match = origin.match(/^chrome-extension:\/\/([a-p]{32})$/);
  if (!match || !allowedIds.length || !allowedIds.includes(match[1])) return null;
  return {
    'Access-Control-Allow-Headers': 'Content-Type, X-Request-Id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Expose-Headers': 'X-Request-Id',
    Vary: 'Origin',
  };
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      if (body.length > BODY_LIMIT) return;
      body += chunk;
      if (Buffer.byteLength(body) > BODY_LIMIT) reject(httpError(413, 'BODY_TOO_LARGE', 'Request body is too large.'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { reject(httpError(400, 'INVALID_JSON', 'Request body must be valid JSON.')); }
    });
    request.on('error', reject);
  });
}

function send(response, status, body, extraHeaders = {}) {
  if (response.headersSent) return;
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Request-Id': body.requestId,
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function httpError(status, type, message) {
  return Object.assign(new Error(message), { status, type });
}

function parseAllowedIds(value = '') {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function validRequestId(value) {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

export function startOauthServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 3000);
  const server = createOauthServer(options);
  server.listen(port, () => {
    console.info(`LeetSync OAuth service listening on http://localhost:${port}`);
  });
  return server;
}

function loadLocalEnvironment() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[2].startsWith('#') || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadLocalEnvironment();
  startOauthServer();
}
