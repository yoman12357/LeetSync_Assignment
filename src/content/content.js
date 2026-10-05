import { MESSAGE, STORAGE } from '../config/constants.js';
import { createRequestId } from '../utils/helpers.js';
import { extractSubmission } from './extractor.js';
import { readAcceptedSubmission, readLatestSubmissionId, submissionIdFromUrl } from './submission-reader.js';

const handledSubmissions = new Set();
let pendingSubmission;
let contextInvalidated = false;

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
  if (contextInvalidated) return;
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
    showToast('Waiting for your submission result...', 'info', pending.requestId, undefined, true);
    setTimeout(() => void recoverSubmission(pending), 1000);
  } catch (error) {
    showExtensionError(error, pending.requestId);
  }
}

async function recoverSubmission(pending) {
  if (contextInvalidated || pendingSubmission !== pending) return;
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
      if (!payload || payload.pending) {
        setTimeout(() => void recoverSubmission(pending), 1000);
        return;
      }
      pendingSubmission = undefined;
      if (payload.rejected) {
        showToast(`LeetCode verdict: ${payload.verdict}. Nothing was sent to GitHub.`, 'info', pending.requestId);
      } else {
        await synchronizeAcceptedSubmission(payload);
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
  if (contextInvalidated) return;
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

    showToast('Accepted. Saving your solution to GitHub...', 'info', requestId, undefined, true);
    const response = await sendMessage({ type: MESSAGE.submissionAccepted, payload, requestId });
    if (response?.success) {
      showToast(response.message, response.type === 'SKIPPED_DUPLICATE' ? 'info' : 'success', response.requestId, response.url);
    } else {
      showToast(response?.error || 'Synchronization failed.', 'error', response?.requestId || requestId);
    }
  } catch (error) {
    showExtensionError(error, requestId);
  }
}

function showExtensionError(error, requestId) {
  const message = error?.message || 'Synchronization failed.';
  if (/extension context invalidated/i.test(message)) {
    pendingSubmission = undefined;
    if (contextInvalidated) return;
    contextInvalidated = true;
    showToast('LeetSync was reloaded. Refresh this LeetCode tab (F5), then submit again.', 'error', requestId);
    return;
  }
  showToast(message, 'error', requestId);
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('LeetSync did not receive a GitHub result within two minutes. Check the popup history before retrying.')), 120_000);
    try {
      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeout);
        try {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

function showToast(message, type, requestId, url, persistent = false) {
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
  if (!persistent) setTimeout(() => toast.remove(), type === 'error' ? 9000 : 6000);
}
