import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractSubmission,
  extractStats,
  normalizeLanguage,
  parseTitle,
  problemIdentity,
} from '../src/content/extractor.js';

function documentFixture() {
  return {
    title: '2. Add Two Numbers - LeetCode',
    body: { innerText: 'Accepted Runtime: 0 ms' },
    querySelector: () => null,
    querySelectorAll: (selector) => selector.includes('.view-line') ? [{ textContent: 'only the visible part of the code' }] : [],
  };
}

test('extracts the complete submitted source without relying on editor rendering or a two-minute cutoff', () => {
  const captured = {
    problemSlug: 'add-two-numbers',
    code: 'class Solution {\n  // Complete source\n};',
    language: 'cpp',
    capturedAt: Date.now() - 180_000,
  };
  const result = extractSubmission(documentFixture(), { href: 'https://leetcode.com/problems/add-two-numbers/' }, captured);
  assert.equal(result.code, captured.code);
  assert.equal(result.language, 'cpp');
  assert.equal(result.problemId, '2');
});

test('does not use partial editor text or source captured for a different problem', () => {
  const location = { href: 'https://leetcode.com/problems/add-two-numbers/' };
  assert.equal(extractSubmission(documentFixture(), location).code, '');
  assert.equal(extractSubmission(documentFixture(), location, {
    problemSlug: 'two-sum', code: 'other problem', language: 'cpp',
  }).code, '');
});

test('extracts a stable problem identity from a LeetCode URL', () => {
  assert.deepEqual(problemIdentity('https://leetcode.com/problems/two-sum/description/', '1. Two Sum - LeetCode'), {
    slug: 'two-sum',
    title: '1. Two Sum',
  });
});

test('parses numbered and unnumbered titles', () => {
  assert.deepEqual(parseTitle('1. Two Sum'), { id: '1', title: 'Two Sum' });
  assert.deepEqual(parseTitle('Two Sum'), { id: '', title: 'Two Sum' });
});

test('normalizes LeetCode language labels', () => {
  assert.equal(normalizeLanguage('Python3'), 'python3');
  assert.equal(normalizeLanguage('C++ (GCC 13)'), 'c++');
  assert.equal(normalizeLanguage('Unknown'), '');
});

test('extracts runtime and memory without scanning unrelated units', () => {
  assert.deepEqual(extractStats('Runtime 4 ms Memory 17.2 MB'), { runtime: '4 ms', memory: '17.2 MB' });
  assert.equal(extractStats('Accepted'), null);
});
