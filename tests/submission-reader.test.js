import assert from 'node:assert/strict';
import test from 'node:test';
import { readAcceptedSubmission, readLatestSubmissionId, submissionIdFromUrl } from '../src/content/submission-reader.js';

const submittedAt = Date.now();
const options = { submissionId: '123', problemSlug: 'two-sum', submittedAt, cookie: 'other=value; csrftoken=csrf-value' };
const details = {
  code: 'class Solution {\n  // complete code\n};', statusCode: 10,
  timestamp: Math.floor(submittedAt / 1000), lang: { name: 'cpp', verboseName: 'C++' },
  question: { title: 'Two Sum', titleSlug: 'two-sum', difficulty: 'Easy', content: '<p>Problem</p>' },
  runtimeDisplay: '0 ms', memoryDisplay: '12 MB',
};
const reply = (submissionDetails = details) => ({ data: { submissionDetails, question: { questionFrontendId: '1' } } });

test('recognizes only LeetCode problem submission detail URLs', () => {
  assert.equal(submissionIdFromUrl('https://leetcode.com/problems/two-sum/submissions/123/?envType=list'), '123');
  assert.equal(submissionIdFromUrl('https://leetcode.com/problems/two-sum/submissions/'), '');
  assert.equal(submissionIdFromUrl('https://leetcode.com/problems/two-sum/description/'), '');
  assert.equal(submissionIdFromUrl('https://example.com/problems/two-sum/submissions/123/'), '');
});

test('finds the new problem submission from the authenticated list when the URL has no ID', async () => {
  const result = await readLatestSubmissionId({ ...options, fetch: async (url, init) => {
    assert.equal(url, 'https://leetcode.com/api/submissions/two-sum/?offset=0&limit=10');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.cache, 'no-store');
    return new Response(JSON.stringify({ submissions_dump: [
      { id: 121, timestamp: Math.floor(submittedAt / 1000) - 60 },
      { id: 123, timestamp: Math.floor(submittedAt / 1000), status_display: 'Accepted' },
      { id: 122, timestamp: Math.floor(submittedAt / 1000), status_display: 'Accepted' },
    ] }));
  } });
  assert.equal(result, '123');
});

test('ignores old submissions and waits until recent judging completes', async () => {
  for (const entry of [
    { id: 123, timestamp: Math.floor(submittedAt / 1000) - 60, status_display: 'Accepted' },
    { id: 124, timestamp: Math.floor(submittedAt / 1000), status_display: 'Pending' },
  ]) {
    assert.equal(await readLatestSubmissionId({ ...options, fetch: async () => new Response(JSON.stringify({ submissions_dump: [entry] })) }), '');
  }
});

test('reports inaccessible or malformed submission lists', async () => {
  for (const response of [new Response('{}', { status: 403 }), new Response('{}')]) {
    await assert.rejects(readLatestSubmissionId({ ...options, fetch: async () => response }));
  }
});

test('default LeetCode fetch preserves the browser receiver for both readers', async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async function browserFetch(url) {
    assert.equal(this, globalThis);
    return new Response(JSON.stringify(url.includes('/api/submissions/')
      ? { submissions_dump: [{ id: 123, timestamp: Math.floor(submittedAt / 1000), status_display: 'Accepted' }] }
      : reply()));
  };
  assert.equal(await readLatestSubmissionId(options), '123');
  assert.equal((await readAcceptedSubmission(options)).code, details.code);
});

test('reads the judged source and public question number with same-origin session and CSRF', async () => {
  const result = await readAcceptedSubmission({
    ...options,
    fetch: async (url, init) => {
      assert.equal(url, 'https://leetcode.com/graphql/');
      assert.equal(init.credentials, 'same-origin');
      assert.equal(init.headers['x-csrftoken'], 'csrf-value');
      assert.deepEqual(JSON.parse(init.body).variables, { submissionId: 123, titleSlug: 'two-sum' });
      return new Response(JSON.stringify(reply()));
    },
  });
  assert.equal(result.code, details.code);
  assert.equal(result.language, 'cpp');
  assert.equal(result.problemId, '1');
  assert.equal(result.submissionId, '123');
});

for (const [label, change] of [
  ['rejected result', { statusCode: 11 }],
  ['unsupported final verdict', { statusCode: 16 }],
  ['old submission', { timestamp: Math.floor(submittedAt / 1000) - 60 }],
  ['different problem', { question: { titleSlug: 'three-sum' } }],
]) {
  test(`ignores ${label}`, async () => {
    const result = await readAcceptedSubmission({ ...options, fetch: async () => new Response(JSON.stringify(reply({ ...details, ...change }))) });
    assert.equal(result, null);
  });
}

test('reports HTTP, GraphQL, and missing-source errors without returning incomplete code', async () => {
  for (const response of [
    new Response('{}', { status: 403 }),
    new Response(JSON.stringify({ errors: [{ message: 'Authentication required' }] })),
    new Response(JSON.stringify(reply({ ...details, code: '' }))),
  ]) {
    await assert.rejects(readAcceptedSubmission({ ...options, fetch: async () => response }));
  }
});
