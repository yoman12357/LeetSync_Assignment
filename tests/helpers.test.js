import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addBoundedEntry,
  buildCommitMessage,
  createFingerprint,
  createPkceChallenge,
  decodeBase64,
  encodeBase64,
  getFileExtension,
  normalizeCode,
  normalizeProblemPath,
  performanceHeader,
  problemReadme,
} from '../src/utils/helpers.js';

test('normalizes problem folders and supported languages', () => {
  assert.equal(normalizeProblemPath('Two Sum', '1'), '0001-two-sum');
  assert.equal(getFileExtension('Python3'), 'py');
  assert.equal(getFileExtension('C++'), 'cpp');
  assert.equal(getFileExtension('unknown'), null);
});

test('normalizes code without changing meaningful indentation', () => {
  assert.equal(normalizeCode('  if (true) {  \r\n    run();\r\n  }\r\n\r\n\r\n'), '  if (true) {\n    run();\n  }');
});

test('encodes and decodes Unicode content', () => {
  const value = 'const value = "日本語";';
  assert.equal(decodeBase64(encodeBase64(value)), value);
});

test('creates stable SHA-256 fingerprints', async () => {
  const first = await createFingerprint('two-sum', 'py', 'print(1)  ');
  const second = await createFingerprint('two-sum', 'py', 'print(1)');
  const changed = await createFingerprint('two-sum', 'py', 'print(2)');
  assert.equal(first, second);
  assert.notEqual(first, changed);
});

test('creates a valid PKCE challenge', async () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert.equal(await createPkceChallenge(verifier), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('bounds fingerprint storage by oldest timestamp', () => {
  const result = addBoundedEntry({ old: 1, recent: 2 }, 'new', 3, 2);
  assert.deepEqual(result, { recent: 2, new: 3 });
});

test('formats generated content without decorative symbols', () => {
  assert.equal(buildCommitMessage('LeetSync', '1', 'Two Sum', 'C++', 'create'), 'LeetSync: Add 1. Two Sum (C++)');
  assert.match(performanceHeader('py', { runtime: '4 ms' }), /^# Runtime: 4 ms/);
  const readme = problemReadme({ id: '1', title: 'Two Sum', difficulty: 'Easy', url: 'https://leetcode.com/problems/two-sum/' });
  assert.match(readme, /^# 1\. Two Sum/);
  assert.match(readme, /Difficulty: Easy/);
});
