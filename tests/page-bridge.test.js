import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../src/content/page-bridge.js', import.meta.url), 'utf8');
const submitUrl = '/problems/add-two-numbers/submit/';
const checkUrl = (id) => `/submissions/detail/${id}/check/`;
const accepted = { state: 'SUCCESS', status_msg: 'Accepted', status_runtime: '0 ms' };
const submission = { typed_code: 'class Solution {\n  // Entire submitted source\n};', lang: 'cpp' };

function harness() {
  const events = [];
  const replies = new Map();
  class FakeXHR {
    listeners = [];
    open(_method, url) { this.url = url; }
    addEventListener(_type, listener) { this.listeners.push(listener); }
    send() {
      const reply = replies.get(this.url);
      if (this.responseType === 'json') this.response = reply;
      else this.responseText = JSON.stringify(reply);
      for (const listener of this.listeners) listener();
      this.listeners = [];
    }
  }
  const window = {
    location: { origin: 'https://leetcode.com', href: 'https://leetcode.com/problems/add-two-numbers/' },
    postMessage(event, origin) { assert.equal(origin, this.location.origin); events.push(event); },
    async fetch(input) {
      assert.equal(this, window);
      const url = input instanceof Request ? input.url : String(input);
      const path = new URL(url, this.location.href).pathname;
      const reply = replies.get(path);
      return new Response(typeof reply === 'string' ? reply : JSON.stringify(reply));
    },
  };
  vm.runInNewContext(source, { window, XMLHttpRequest: FakeXHR, Request, URL });
  return { window, events, replies, FakeXHR };
}

for (const inputType of ['string', 'Request', 'URL']) {
  test(`preserves submitted code and language when ${inputType} fetch results omit them`, async () => {
    const { window, events, replies } = harness();
    replies.set(submitUrl, { submission_id: 101 });
    replies.set(checkUrl(101), accepted);
    const url = `https://leetcode.com${submitUrl}`;
    const init = { method: 'POST', body: JSON.stringify(submission) };
    const input = inputType === 'Request' ? new Request(url, init) : inputType === 'URL' ? new URL(url) : url;
    const response = await window.fetch(input, inputType === 'Request' ? undefined : init);
    assert.deepEqual(await response.json(), { submission_id: 101 });
    await window.fetch(checkUrl(101));
    await window.fetch(checkUrl(101));
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'SUBMISSION_ACCEPTED');
    assert.equal(events[0].payload.code, submission.typed_code);
    assert.equal(events[0].payload.language, 'cpp');
    assert.equal(events[0].payload.problemSlug, 'add-two-numbers');
    assert.equal(events[0].payload.submissionId, '101');
    assert.equal(events[0].payload.stats.runtime, '0 ms');
  });
}

test('ignores accepted test runs and results for uncaptured submissions', async () => {
  const { window, events, replies } = harness();
  replies.set('/problems/add-two-numbers/interpret_solution/', { interpret_id: 55 });
  replies.set(checkUrl(55), accepted);
  await window.fetch('/problems/add-two-numbers/interpret_solution/', { method: 'POST', body: JSON.stringify(submission) });
  await window.fetch(checkUrl(55));
  assert.equal(events.length, 0);
});

test('matches overlapping submissions to their own results and ignores rejected results', async () => {
  const { window, events, replies } = harness();
  for (const id of [101, 102, 103]) {
    replies.set(submitUrl, { submission_id: id });
    await window.fetch(submitUrl, { method: 'POST', body: JSON.stringify({ ...submission, typed_code: `code ${id}` }) });
  }
  replies.set(checkUrl(101), { state: 'PENDING' });
  await window.fetch(checkUrl(101));
  replies.set(checkUrl(102), accepted);
  await window.fetch(checkUrl(102));
  replies.set(checkUrl(103), { state: 'SUCCESS', status_msg: 'Wrong Answer' });
  await window.fetch(checkUrl(103));
  replies.set(checkUrl(103), accepted);
  await window.fetch(checkUrl(103));
  replies.set(checkUrl(101), accepted);
  await window.fetch(checkUrl(101));
  assert.deepEqual(events.map((event) => event.payload.code), ['code 102', 'code 101']);
});

for (const responseType of ['', 'json']) {
  test(`captures XHR submissions with ${responseType || 'text'} responses`, () => {
    const { events, replies, FakeXHR } = harness();
    replies.set(submitUrl, { submission_id: 101 });
    replies.set(checkUrl(101), accepted);
    const request = new FakeXHR();
    request.responseType = responseType;
    request.open('POST', submitUrl);
    request.send(JSON.stringify(submission));
    const check = new FakeXHR();
    check.responseType = responseType;
    check.open('GET', checkUrl(101));
    check.send();
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.code, submission.typed_code);
    assert.equal(events[0].payload.language, 'cpp');
  });
}

test('does not break page fetches when responses are not JSON', async () => {
  const { window, events, replies } = harness();
  replies.set(submitUrl, '<html>Request failed</html>');
  const response = await window.fetch(submitUrl, { method: 'POST', body: JSON.stringify(submission) });
  assert.equal(await response.text(), '<html>Request failed</html>');
  assert.equal(events.length, 0);
});
