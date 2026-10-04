import { MESSAGE, STORAGE } from '../config/constants.js';
import { createRequestId } from '../utils/helpers.js';
import { extractSubmission } from './extractor.js';
import { readAcceptedSubmission, readLatestSubmissionId, submissionIdFromUrl } from './submission-reader.js';

const handledSubmissions = new Set();
let pendingSubmission;

document.addEventListener('click', (event) => {
  const button = event.target?.closest?.('button, [role="button"]');
  if (!button) return;
  if (button.matches('[data-e2e-locator="console-submit-button"], [data-cy="submit-code-btn"]')) {
    void watchSubmission();
    return;
  }
  // Keep fallback matching narrow so opening Submissions does not start a sync.
  const text = button.textContent?.trim();
  if (text === 'Submit') {
    void watchSubmission();
    return;
  }
  const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
  if (ariaLabel === 'submit' || ariaLabel === 'submit code') {
    void watchSubmission();
    return;
  }
  const children = button.querySelectorAll('span, div, p');
  for (const child of children) {
    if (child.textContent?.trim() === 'Submit' && child.children.length === 0) {
      void watchSubmission();
      return;
    }
  }
}, true);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
    void watchSubmission();
  }
}, true);

async function watchSubmission() {
  const problemSlug = new URL(window.location.href).pathname.match(/^\/problems\/([a-z0-9-]+)/)?.[1];
  if (!problemSlug) return;
  const pending = {
    problemSlug, submittedAt: Date.now(), initialId: submissionIdFromUrl(window.location.href),
    requestId: createRequestId(),
  };
  pendingSubmission = pending;
  try {
    const stored = await chrome.storage.local.get(STORAGE.settings);
    if (stored[STORAGE.settings]?.autoSync === false || pendingSubmission !== pending) return;
    showToast('Waiting for your submission result...', 'info', pending.requestId);
    setTimeout(() => void recoverSubmission(pending), 1000);
  } catch (error) {
    showToast(error.message || 'Reload LeetSync and refresh this tab.', 'error', pending.requestId);
  }
}

async function recoverSubmission(pending) {
  if (pendingSubmission !== pending) return;
  const location = new URL(window.location.href);
  if (location.pathname.split('/')[2] !== pending.problemSlug) return;
  if (Date.now() - pending.submittedAt >= 300_000) {
    pendingSubmission = undefined;
    showToast('LeetSync could not detect the submission. Refresh this tab and submit again.', 'error', pending.requestId);
    return;
  }
  let submissionId = submissionIdFromUrl(location.href);
  if (!submissionId || submissionId === pending.initialId) {
    try {
      submissionId = await readLatestSubmissionId(pending);
      if (pendingSubmission !== pending) return;
    } catch (error) {
      pending.retries = (pending.retries || 0) + 1;
      if (pending.retries >= 3) {
        pendingSubmission = undefined;
        showToast(error.message, 'error', pending.requestId);
        return;
      }
    }
  }
  if (submissionId && submissionId !== pending.initialId) {
    if (handledSubmissions.has(submissionId)) {
      pendingSubmission = undefined;
      return;
    }
    try {
      const payload = await readAcceptedSubmission({ ...pending, submissionId, cookie: document.cookie || '' });
      if (pendingSubmission !== pending) return;
      if (payload?.pending) {
        setTimeout(() => void recoverSubmission(pending), 1000);
        return;
      }
      pendingSubmission = undefined;
      if (payload) {
        await synchronizeAcceptedSubmission(payload);
      } else {
        showToast('Submission was not accepted — only accepted solutions are synced to GitHub.', 'info', pending.requestId);
      }
    } catch (error) {
      if (pendingSubmission !== pending) return;
      pending.retries = (pending.retries || 0) + 1;
      if (pending.retries < 3) {
        setTimeout(() => void recoverSubmission(pending), 1000);
        return;
      }
      pendingSubmission = undefined;
      if (!handledSubmissions.has(submissionId)) showToast(error.message, 'error', pending.requestId);
    }
  } else {
    setTimeout(() => void recoverSubmission(pending), 1000);
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== 'leetsync-page') return;
  if (event.data.type === 'SUBMISSION_ACCEPTED') {
    void synchronizeAcceptedSubmission(event.data.payload);
  }
});

async function synchronizeAcceptedSubmission(captured) {
  const requestId = createRequestId();

  try {
    const stored = await chrome.storage.local.get(STORAGE.settings);
    if (stored[STORAGE.settings]?.autoSync === false) return;
    if (!captured?.submissionId || captured.problemSlug !== new URL(window.location.href).pathname.split('/')[2]) {
      return;
    }
    if (handledSubmissions.has(captured.submissionId)) return;

    const payload = extractSubmission(document, window.location, captured);
    payload.submissionId = captured.submissionId;
    for (const field of ['problemId', 'title', 'description', 'difficulty']) {
      if (captured[field]) payload[field] = captured[field];
    }
    if (!payload.code || !payload.language) {
      showToast('Could not read the submitted code or language.', 'error', requestId);
      return;
    }
    handledSubmissions.add(captured.submissionId);
    if (handledSubmissions.size > 20) handledSubmissions.delete(handledSubmissions.values().next().value);
    if (pendingSubmission?.problemSlug === captured.problemSlug && captured.capturedAt >= pendingSubmission.submittedAt - 1000) {
      pendingSubmission = undefined;
    }

    const response = await sendMessage({ type: MESSAGE.submissionAccepted, payload, requestId });
    if (response?.success) {
      showToast(response.message, response.type === 'SKIPPED_DUPLICATE' ? 'info' : 'success', response.requestId, response.url);
    } else {
      showToast(response?.error || 'Synchronization failed.', 'error', response?.requestId || requestId);
    }
  } catch (error) {
    if (/context invalidated|Extension context/i.test(error.message)) {
      showToast('LeetSync was updated. Please refresh this page (F5) and submit again.', 'error', requestId);
    } else {
      showToast(error.message || 'Synchronization failed.', 'error', requestId);
    }
  }
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function showToast(message, type, requestId, url) {
  document.getElementById('leetsync-toast')?.remove();
  const toast = document.createElement('aside');
  toast.id = 'leetsync-toast';
  toast.className = `leetsync-toast leetsync-toast--${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const content = document.createElement('div');
  const title = document.createElement('strong');
  const text = document.createElement('span');
  const trace = document.createElement('small');
  const close = document.createElement('button');
  title.textContent = 'LeetSync';
  text.textContent = message;
  trace.textContent = `Request ${requestId}`;
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.textContent = 'Close';
  close.addEventListener('click', () => toast.remove());
  content.append(title, text, trace);
  if (url?.startsWith('https://github.com/')) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open saved solution';
    content.append(link);
  }
  toast.append(content, close);
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('leetsync-toast--visible'));
  setTimeout(() => toast.remove(), type === 'error' ? 9000 : 6000);
}
