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
const reply = (submissionDetails = details) => ({ data: {
  submissionDetails, question: { questionFrontendId: '1' },
} });

function fixture({ body = reply(), verdict = 'Accepted', checkBody, checkStatus = 200, sourceStatus = 200, headers = {} } = {}) {
  return async (url) => url.endsWith('/check/')
    ? new Response(JSON.stringify(checkBody || { state: 'SUCCESS', status_msg: verdict }), { status: checkStatus })
    : new Response(JSON.stringify(body), { status: sourceStatus, headers });
}

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
    { id: 123, timestamp: Math.floor(submittedAt / 1000) - 2, status_display: 'Accepted' },
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
    if (url.endsWith('/check/')) return new Response(JSON.stringify({ state: 'SUCCESS', status_msg: 'Accepted' }));
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
      assert.equal(init.credentials, 'same-origin');
      assert.equal(init.cache, 'no-store');
      if (url.endsWith('/check/')) {
        assert.equal(url, 'https://leetcode.com/submissions/detail/123/check/');
        return new Response(JSON.stringify({ state: 'SUCCESS', status_msg: 'Accepted', submission_id: 123 }));
      }
      assert.equal(url, 'https://leetcode.com/graphql/');
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

for (const [statusCode, verdict] of [[11, 'Wrong Answer'], [16, 'Internal Error'], [99, 'Unknown Error']]) {
  test(`reports verdict ${verdict} without returning source`, async () => {
    const result = await readAcceptedSubmission({ ...options, fetch: fixture({ body: reply({ ...details, statusCode }), verdict }) });
    assert.deepEqual(result, { rejected: true, verdict });
  });
}

test('accepts the exact named Accepted verdict even when the detail code is 16', async () => {
  const body = reply({ ...details, statusCode: 16 });
  const result = await readAcceptedSubmission({ ...options, submissionId: '2161838030', fetch: fixture({ body }) });
  assert.equal(result.code, details.code);
  assert.equal(result.submissionId, '2161838030');
});

test('does not use an Accepted verdict belonging to another submission', async () => {
  await assert.rejects(readAcceptedSubmission({ ...options, fetch: fixture({
    checkBody: { state: 'SUCCESS', status_msg: 'Accepted', submission_id: 122 },
  }) }), /different submission/);
});

test('waits for pending named verdicts and refuses unverifiable verdict responses', async () => {
  for (const state of ['PENDING', 'STARTED']) {
    assert.deepEqual(await readAcceptedSubmission({ ...options, fetch: fixture({ checkBody: { state } }) }), { pending: true });
  }
  await assert.rejects(readAcceptedSubmission({ ...options, fetch: fixture({ checkBody: { state: 'SUCCESS' } }) }), /incomplete submission verdict/);
  await assert.rejects(readAcceptedSubmission({ ...options, fetch: fixture({ checkStatus: 403 }) }), /could not verify the submission verdict/);
});

for (const [label, change] of [
  ['old submission', { timestamp: Math.floor(submittedAt / 1000) - 60 }],
  ['previous submission from two seconds ago', { timestamp: Math.floor(submittedAt / 1000) - 2 }],
  ['different problem', { question: { titleSlug: 'three-sum' } }],
]) {
  test(`ignores ${label}`, async () => {
    const result = await readAcceptedSubmission({ ...options, fetch: fixture({ body: reply({ ...details, ...change }) }) });
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

test('uses the server clock so an accepted submission is not rejected by local clock skew', async () => {
  for (const offset of [-180_000, 180_000]) {
    const serverTime = Math.floor((Date.now() + offset) / 1000) * 1000;
    const headers = { date: new Date(serverTime).toUTCString() };
    const submission = { ...details, timestamp: serverTime / 1000 };
    const source = await readAcceptedSubmission({ ...options, fetch: fixture({ body: reply(submission), headers }) });
    assert.equal(source.code, details.code);
    const id = await readLatestSubmissionId({ ...options, fetch: async () => new Response(JSON.stringify({
      submissions_dump: [{ id: 123, timestamp: serverTime / 1000, status_display: 'Accepted' }],
    }), { headers }) });
    assert.equal(id, '123');
  }
});
