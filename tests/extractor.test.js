import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractStats,
  normalizeLanguage,
  parseTitle,
  problemIdentity,
} from '../src/content/extractor.js';

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
