import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/content/content.js', import.meta.url))],
  bundle: true,
  format: 'iife',
  write: false,
  logLevel: 'silent',
});

function harness({ autoSync = true, fetch: request, check = async () => new Response(JSON.stringify({ state: 'SUCCESS', status_msg: 'Accepted' })) } = {}) {
  const messages = [];
  const notices = [];
  const listeners = new Map();
  const documentListeners = new Map();
  const timers = [];
  let timeOffset = 0;
  function element() {
    return { children: [], setAttribute() {}, append(...items) { this.children.push(...items); }, appendChild() {}, addEventListener() {}, remove() {}, classList: { add() {} } };
  }
  const document = {
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    title: '2. Add Two Numbers - LeetCode',
    body: { ...element(), innerText: 'Accepted', appendChild(toast) { notices.push(toast); } },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: element,
  };
  const window = {
    location: { href: 'https://leetcode.com/problems/add-two-numbers/', origin: 'https://leetcode.com' },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const chrome = {
    storage: { local: { async get() { return { leetsync_settings: { autoSync } }; } } },
    runtime: {
      sendMessage(message, callback) { messages.push(message); callback({ success: true, message: 'Synced' }); },
    },
  };
  vm.runInNewContext(bundled.outputFiles[0].text, {
    window, document, chrome, URL, crypto: globalThis.crypto,
    Date: class extends Date { static now() { return Date.now() + timeOffset; } },
    fetch: (url, init) => url.endsWith('/check/') ? check(url, init) : request(url, init), AbortSignal,
    setTimeout(callback, delay) { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout(timer) { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); },
    requestAnimationFrame(callback) { callback(); },
  });
  async function publish(payload, overrides = {}) {
    listeners.get('message')({
      source: window, origin: window.location.origin,
      data: { source: 'leetsync-page', type: 'SUBMISSION_ACCEPTED', payload },
      ...overrides,
    });
    await new Promise((resolve) => setImmediate(resolve));
  }
  async function submit() {
    documentListeners.get('click')({ target: { closest: () => ({ matches: () => true, getAttribute: () => null, querySelectorAll: () => [] }) } });
    await new Promise((resolve) => setImmediate(resolve));
  }
  async function recover() {
    const index = timers.findIndex((timer) => timer.delay === 1000);
    if (index >= 0) timers.splice(index, 1)[0].callback();
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { messages, notices, timers, chrome, publish, submit, recover, window, documentListeners,
    advanceTime(milliseconds) { timeOffset += milliseconds; },
  };
}

const captured = {
  submissionId: '101', problemSlug: 'add-two-numbers', language: 'cpp',
  code: 'class Solution {\n  // complete source\n};', capturedAt: Date.now() - 180_000,
};

test('sends the full accepted submission to the worker even after two minutes', async () => {
  const { messages, publish } = harness();
  await publish(captured);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'SUBMISSION_ACCEPTED');
  assert.equal(messages[0].payload.code, captured.code);
  assert.equal(messages[0].payload.language, 'cpp');
  assert.equal(messages[0].payload.submissionId, '101');
});

test('ignores results without a submission ID and results from a previous problem', async () => {
  const { messages, publish } = harness();
  await publish({ ...captured, submissionId: undefined });
  await publish({ ...captured, problemSlug: 'two-sum' });
  assert.equal(messages.length, 0);
});

test('keeps overlapping accepted submissions separate', async () => {
  const { messages, publish } = harness();
  await Promise.all([
    publish(captured),
    publish({ ...captured, submissionId: '102', code: 'different submitted code' }),
  ]);
  assert.deepEqual(messages.map((message) => message.payload.code), [captured.code, 'different submitted code']);
});

test('respects disabled auto sync and rejects messages from other origins', async () => {
  const disabled = harness({ autoSync: false });
  await disabled.publish(captured);
  assert.equal(disabled.messages.length, 0);
  const enabled = harness();
  await enabled.publish(captured, { origin: 'https://example.com' });
  await enabled.publish(captured, { source: {} });
  assert.equal(enabled.messages.length, 0);
});

function acceptedDetails() {
  return {
    data: {
      submissionDetails: {
        statusCode: 10, code: captured.code, timestamp: Math.floor(Date.now() / 1000),
        lang: { name: 'cpp' }, question: { titleSlug: 'add-two-numbers', title: 'Add Two Numbers' },
      },
      question: { questionFrontendId: '2' },
    },
  };
}

test('recovers full judged source after Submit when the network bridge misses the request', async () => {
  const context = harness({ fetch: async () => new Response(JSON.stringify(acceptedDetails())) });
  await context.submit();
  context.window.location.href = 'https://leetcode.com/problems/add-two-numbers/submissions/101/';
  await context.recover();
  assert.equal(context.messages.length, 1);
  assert.equal(context.messages[0].payload.code, captured.code);
  assert.equal(context.messages[0].payload.problemId, '2');
  await context.publish(captured);
  assert.equal(context.messages.length, 1);
});

test('does not recover an old viewed result or react to Run Code', async () => {
  let requests = 0;
  const context = harness({ fetch: async () => {
    requests++;
    return new Response(JSON.stringify({ submissions_dump: [{ id: 100, timestamp: Math.floor(Date.now() / 1000) - 60 }] }));
  } });
  context.window.location.href = 'https://leetcode.com/problems/add-two-numbers/submissions/100/';
  context.documentListeners.get('click')({ target: { closest: () => ({ matches: () => false, textContent: 'Run', getAttribute: () => null, querySelectorAll: () => [] }) } });
  await context.recover();
  assert.equal(requests, 0);
  await context.submit();
  await context.recover();
  assert.equal(requests, 1);
  assert.equal(context.messages.length, 0);
});

test('does not issue recovery requests after a matching network sync', async () => {
  let requests = 0;
  const context = harness({ fetch: async () => { requests++; return new Response('{}'); } });
  await context.submit();
  await context.publish(captured);
  context.window.location.href = 'https://leetcode.com/problems/add-two-numbers/submissions/101/';
  await context.recover();
  assert.equal(requests, 0);
  assert.equal(context.messages.length, 1);
});

test('does not sync a previous problem after navigation during a recovery request', async () => {
  let complete;
  const context = harness({ fetch: () => new Promise((resolve) => { complete = resolve; }) });
  await context.submit();
  context.window.location.href = 'https://leetcode.com/problems/add-two-numbers/submissions/101/';
  await context.recover();
  context.window.location.href = 'https://leetcode.com/problems/two-sum/';
  complete(new Response(JSON.stringify(acceptedDetails())));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.messages.length, 0);
});

test('waits for judging to finish when the detail URL appears before Accepted', async () => {
  let requests = 0;
  const context = harness({
    fetch: async () => new Response(JSON.stringify(acceptedDetails())),
    check: async () => new Response(JSON.stringify(++requests === 1 ? { state: 'STARTED' } : { state: 'SUCCESS', status_msg: 'Accepted' })),
  });
  await context.submit();
  context.window.location.href = 'https://leetcode.com/problems/add-two-numbers/submissions/101/';
  await context.recover();
  assert.equal(context.messages.length, 0);
  await context.recover();
  assert.equal(context.messages.length, 1);
});

test('recovers a valid source when the network event contains incomplete source fields', async () => {
  const context = harness({ fetch: async () => new Response(JSON.stringify(acceptedDetails())) });
  await context.submit();
  await context.publish({ ...captured, code: '' });
  assert.equal(context.messages.length, 0);
  context.window.location.href = 'https://leetcode.com/problems/add-two-numbers/submissions/101/';
  await context.recover();
  assert.equal(context.messages.length, 1);
  assert.equal(context.messages[0].payload.code, captured.code);
});

test('recovers a new accepted problem even when the result keeps the original URL', async () => {
  const requests = [];
  const context = harness({ fetch: async (url) => {
    requests.push(url);
    if (url.includes('/api/submissions/')) {
      return new Response(JSON.stringify({ submissions_dump: [{ id: 101, timestamp: Math.floor(Date.now() / 1000), status_display: 'Accepted' }] }));
    }
    return new Response(JSON.stringify(acceptedDetails()));
  } });
  await context.submit();
  await context.recover();
  assert.equal(requests.length, 2);
  assert.equal(context.messages.length, 1);
  assert.equal(context.messages[0].payload.submissionId, '101');
  assert.equal(context.messages[0].payload.code, captured.code);
});

test('invalidated storage gives refresh instructions once and stops pending recovery', async () => {
  let requests = 0;
  const context = harness({ fetch: async () => { requests++; return new Response('{}'); } });
  await context.submit();
  context.chrome.storage.local.get = async () => { throw new Error('Extension context invalidated.'); };
  await context.publish(captured);
  await context.recover();
  await context.submit();
  await context.publish(captured);
  assert.equal(requests, 0);
  assert.equal(context.messages.length, 0);
  assert.equal(context.notices.length, 2);
  assert.match(context.notices[1].children[0].children[1].textContent, /Refresh this LeetCode tab \(F5\)/);
});

test('invalidated Submit storage does not display the raw Chrome error', async () => {
  const context = harness();
  context.chrome.storage.local.get = async () => { throw new Error('Extension context invalidated.'); };
  await context.submit();
  await context.submit();
  assert.equal(context.notices.length, 1);
  assert.match(context.notices[0].children[0].children[1].textContent, /Refresh this LeetCode tab/);
});

test('invalidated runtime messaging is handled for synchronous and callback failures', async () => {
  for (const callbackFailure of [false, true]) {
    const context = harness();
    context.chrome.runtime.sendMessage = (_message, callback) => {
      if (!callbackFailure) throw new Error('Extension context invalidated.');
      Object.defineProperty(context.chrome.runtime, 'lastError', {
        get() { throw new Error('Extension context invalidated.'); },
      });
      callback();
    };
    await context.publish(captured);
    await context.publish({ ...captured, submissionId: '102' });
    assert.equal(context.notices.length, 2);
    assert.match(context.notices[1].children[0].children[1].textContent, /Refresh this LeetCode tab/);
  }
});

test('recovery retries an unrelated result instead of falsely reporting rejection', async () => {
  let requests = 0;
  const context = harness({ fetch: async () => {
    const body = acceptedDetails();
    if (++requests === 1) body.data.submissionDetails.question.titleSlug = 'two-sum';
    return new Response(JSON.stringify(body));
  } });
  await context.submit();
  context.window.location.href = 'https://leetcode.com/problems/add-two-numbers/submissions/101/';
  await context.recover();
  assert.equal(context.messages.length, 0);
  assert.equal(context.notices.length, 1);
  await context.recover();
  assert.equal(context.messages.length, 1);
});

test('recovery displays the actual rejected verdict and does not send code', async () => {
  const context = harness({
    fetch: async () => new Response(JSON.stringify(acceptedDetails())),
    check: async () => new Response(JSON.stringify({ state: 'SUCCESS', status_msg: 'Wrong Answer' })),
  });
  await context.submit();
  context.window.location.href = 'https://leetcode.com/problems/add-two-numbers/submissions/101/';
  await context.recover();
  assert.equal(context.messages.length, 0);
  assert.equal(context.notices.length, 2);
  assert.match(context.notices[1].children[0].children[1].textContent, /LeetCode verdict: Wrong Answer/);
});

test('an Accepted named verdict with detail code 16 syncs rather than reporting Internal Error', async () => {
  const context = harness({ fetch: async () => {
    const body = acceptedDetails();
    body.data.submissionDetails.statusCode = 16;
    return new Response(JSON.stringify(body));
  } });
  await context.submit();
  context.window.location.href = 'https://leetcode.com/problems/add-two-numbers/submissions/101/';
  await context.recover();
  assert.equal(context.messages.length, 1);
  assert.equal(context.messages[0].payload.code, captured.code);
  assert.equal(context.notices.at(-1).children[0].children[1].textContent, 'Synced');
});

test('waiting stays visible until a final result replaces it', async () => {
  const context = harness({
    fetch: async () => new Response(JSON.stringify(acceptedDetails())),
    check: async () => new Response(JSON.stringify({ state: 'STARTED' })),
  });
  await context.submit();
  assert.equal(context.timers.some(timer => timer.delay === 6000), false);
  context.window.location.href = 'https://leetcode.com/problems/add-two-numbers/submissions/101/';
  await context.recover();
  assert.equal(context.notices.length, 1);
  assert.match(context.notices[0].children[0].children[1].textContent, /Waiting/);
});

test('GitHub progress is followed by the actual success notification', async () => {
  const context = harness();
  let complete;
  context.chrome.runtime.sendMessage = (_message, callback) => { complete = callback; };
  await context.publish(captured);
  assert.match(context.notices.at(-1).children[0].children[1].textContent, /Saving your solution to GitHub/);
  assert.equal(context.timers.some(timer => timer.delay === 6000), false);
  complete({ success: true, message: 'Solution saved', requestId: 'request-complete' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.notices.at(-1).children[0].children[1].textContent, 'Solution saved');
  assert.equal(context.timers.some(timer => timer.delay === 120_000), false);
});

test('a missing worker reply produces a timeout message instead of silent waiting', async () => {
  const context = harness();
  context.chrome.runtime.sendMessage = () => {};
  await context.publish(captured);
  const timeout = context.timers.find(timer => timer.delay === 120_000);
  assert.ok(timeout);
  timeout.callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(context.notices.at(-1).children[0].children[1].textContent, /Check the popup history before retrying/);
});

test('an unreadable verdict produces an error after retries instead of endless waiting', async () => {
  const context = harness({
    fetch: async () => new Response(JSON.stringify(acceptedDetails())),
    check: async () => new Response(JSON.stringify({ state: 'SUCCESS' })),
  });
  await context.submit();
  context.window.location.href = 'https://leetcode.com/problems/add-two-numbers/submissions/101/';
  await context.recover();
  await context.recover();
  await context.recover();
  assert.equal(context.messages.length, 0);
  assert.match(context.notices.at(-1).children[0].children[1].textContent, /incomplete submission verdict/);
});

test('a permanently pending submission ends with an explicit detection timeout', async () => {
  const context = harness();
  await context.submit();
  context.advanceTime(300_000);
  await context.recover();
  assert.equal(context.messages.length, 0);
  assert.match(context.notices.at(-1).children[0].children[1].textContent, /could not detect the submission/);
});
