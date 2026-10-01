import { GITHUB, STORAGE } from '../config/constants.js';
import {
  createPkceChallenge,
  createRandomString,
  createRequestId,
} from '../utils/helpers.js';

const OAUTH_TIMEOUT_MS = 10 * 60 * 1000;

export async function authenticateWithGitHub({ identity, sessionStorage, fetch: request = fetch }) {
  const requestId = createRequestId();
  const redirectUri = identity.getRedirectURL();
  const config = await fetchOauthConfig(request, requestId);
  const state = createRandomString();
  const verifier = createRandomString(48);
  const challenge = await createPkceChallenge(verifier);

  await sessionStorage.set({
    [STORAGE.oauthPending]: { state, verifier, requestId, expiresAt: Date.now() + OAUTH_TIMEOUT_MS },
  });

  const authorizationUrl = new URL(GITHUB.authorizeUrl);
  authorizationUrl.searchParams.set('client_id', config.clientId);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('scope', GITHUB.scopes);
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('code_challenge', challenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');

  const callbackUrl = await launchAuthFlow(identity, authorizationUrl.toString());
  const callback = new URL(callbackUrl);
  const pending = (await sessionStorage.get(STORAGE.oauthPending))[STORAGE.oauthPending];
  await sessionStorage.remove(STORAGE.oauthPending);

  if (!pending || pending.expiresAt < Date.now() || callback.searchParams.get('state') !== pending.state) {
    throw new Error('GitHub authentication state is invalid or expired.');
  }
  const oauthError = callback.searchParams.get('error_description') || callback.searchParams.get('error');
  if (oauthError) throw new Error(oauthError);
  const code = callback.searchParams.get('code');
  if (!code) throw new Error('GitHub did not return an authorization code.');

  const response = await request(`${GITHUB.oauthServerUrl}/api/github/token`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': pending.requestId },
    body: JSON.stringify({ code, codeVerifier: pending.verifier, redirectUri }),
  });
  const body = await readJson(response);
  if (!response.ok || !body.accessToken) {
    throw new Error(body.error || 'The OAuth service could not complete authentication.');
  }
  return { token: body.accessToken, requestId: body.requestId || pending.requestId };
}

async function fetchOauthConfig(request, requestId) {
  let response;
  try {
    response = await request(`${GITHUB.oauthServerUrl}/api/config`, {
      headers: { 'X-Request-Id': requestId },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new Error(`OAuth service is unavailable at ${GITHUB.oauthServerUrl}. Start it with npm run server.`);
  }
  const body = await readJson(response);
  if (!response.ok || !body.clientId) throw new Error(body.error || 'OAuth service is not configured.');
  return body;
}

function launchAuthFlow(identity, url) {
  return new Promise((resolve, reject) => {
    identity.launchWebAuthFlow({ url, interactive: true }, (callbackUrl) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (!callbackUrl) reject(new Error('GitHub authentication was cancelled.'));
      else resolve(callbackUrl);
    });
  });
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
