import { LANGUAGE_EXTENSIONS, LANGUAGE_NAMES, LIMITS } from '../config/constants.js';

export function createRequestId() {
  return crypto.randomUUID();
}

export function createRandomString(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return toBase64Url(value);
}

export async function createPkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function normalizeProblemPath(slug, problemId) {
  const id = String(problemId || '0').replace(/\D/g, '').padStart(4, '0');
  const cleanSlug = String(slug || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleanSlug) throw new Error('Problem slug is missing');
  return `${id}-${cleanSlug}`;
}

export function getFileExtension(language) {
  return LANGUAGE_EXTENSIONS[String(language || '').toLowerCase().trim()] || null;
}

export function getLanguageName(extension) {
  return LANGUAGE_NAMES[extension] || String(extension).toUpperCase();
}

export function normalizeCode(code) {
  const lines = String(code || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd());
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  return lines.join('\n');
}

export async function createFingerprint(slug, extension, code) {
  const input = `${slug}\u0000${extension}\u0000${normalizeCode(code)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toBase64Url(new Uint8Array(digest));
}

export function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function buildCommitMessage(prefix, problemId, title, languageName, action) {
  const verb = action === 'update' ? 'Update' : 'Add';
  return `${prefix}: ${verb} ${problemId}. ${title} (${languageName})`;
}

export function addBoundedEntry(entries, key, value, maximum = LIMITS.fingerprints) {
  const next = { ...(entries || {}), [key]: value };
  const overflow = Object.keys(next).length - maximum;
  if (overflow > 0) {
    Object.entries(next)
      .sort((left, right) => left[1] - right[1])
      .slice(0, overflow)
      .forEach(([oldestKey]) => delete next[oldestKey]);
  }
  return next;
}

export function performanceHeader(extension, stats) {
  if (!stats || (!stats.runtime && !stats.memory)) return '';
  const parts = [stats.runtime && `Runtime: ${stats.runtime}`, stats.memory && `Memory: ${stats.memory}`].filter(Boolean);
  const prefix = ['py', 'rb', 'sh', 'r', 'pl'].includes(extension)
    ? '#'
    : ['sql', 'lua'].includes(extension) ? '--' : '//';
  return `${parts.map((part) => `${prefix} ${part}`).join('\n')}\n\n`;
}

export function problemReadme(problem) {
  const lines = [`# ${problem.id}. ${problem.title}`, ''];
  if (problem.difficulty) lines.push(`Difficulty: ${problem.difficulty}`, '');
  if (problem.url) lines.push(`[Open on LeetCode](${problem.url})`, '');
  if (problem.description) lines.push('## Description', '', problem.description, '');
  if (problem.stats?.runtime || problem.stats?.memory) {
    lines.push('## Submission', '');
    if (problem.stats.runtime) lines.push(`- Runtime: ${problem.stats.runtime}`);
    if (problem.stats.memory) lines.push(`- Memory: ${problem.stats.memory}`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function classifyGitHubError(status, body, headers = new Headers()) {
  const message = body?.message || `GitHub request failed with status ${status}`;
  if (status === 401) return { type: 'AUTH_EXPIRED', message: 'GitHub authorization is invalid or expired.', retryable: false };
  if (status === 403 && (headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(message))) {
    return { type: 'RATE_LIMIT', message: 'GitHub API rate limit reached.', retryable: true };
  }
  if (status === 403) return { type: 'PERMISSION', message: 'GitHub denied access to this repository.', retryable: false };
  if (status === 404) return { type: 'NOT_FOUND', message: 'GitHub resource was not found.', retryable: false };
  if (status === 409) return { type: 'CONFLICT', message: 'The GitHub file changed during synchronization.', retryable: true };
  if (status === 422) return { type: 'VALIDATION', message, retryable: false };
  if (status >= 500) return { type: 'SERVER_ERROR', message: 'GitHub is temporarily unavailable.', retryable: true };
  return { type: 'GITHUB_ERROR', message, retryable: false };
}

export function backoffDelay(attempt, random = Math.random) {
  return Math.min(400 * (2 ** attempt) + Math.floor(random() * 200), 4000);
}
