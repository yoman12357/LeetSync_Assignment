import { MESSAGE, STORAGE } from '../config/constants.js';
import { createRequestId } from '../utils/helpers.js';
import { extractSubmission, isAcceptedResult } from './extractor.js';

let captured = {};
let processing = false;
let pendingAccepted = false;
let lastAcceptedAt = 0;
let observerTimer;

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== 'leetsync-page') return;
  if (event.data.type === 'SUBMISSION_CAPTURED') {
    captured = { ...captured, ...event.data.payload };
  }
  if (event.data.type === 'SUBMISSION_ACCEPTED') {
    captured = {
      ...captured,
      ...event.data.payload,
      capturedAt: event.data.payload.code ? Date.now() : captured.capturedAt,
    };
    void synchronizeAcceptedSubmission();
  }
});

const observer = new MutationObserver(() => {
  clearTimeout(observerTimer);
  observerTimer = setTimeout(() => {
    if (isAcceptedResult(document) && Date.now() - lastAcceptedAt > 2000) {
      void synchronizeAcceptedSubmission();
    }
  }, 500);
});

function startObserver() {
  if (!document.documentElement) return setTimeout(startObserver, 50);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}
startObserver();

async function synchronizeAcceptedSubmission() {
  if (processing) {
    pendingAccepted = true;
    return;
  }
  processing = true;
  lastAcceptedAt = Date.now();
  const requestId = createRequestId();

  try {
    const stored = await chrome.storage.local.get(STORAGE.settings);
    if (stored[STORAGE.settings]?.autoSync === false) return;
    if (captured.capturedAt && Date.now() - captured.capturedAt > 120_000) captured = {};

    const payload = extractSubmission(document, window.location, captured);
    if (!payload.code || !payload.language) {
      showToast('Could not read the submitted code or language.', 'error', requestId);
      return;
    }

    const response = await sendMessage({ type: MESSAGE.submissionAccepted, payload, requestId });
    if (response?.success) {
      showToast(response.message, response.type === 'SKIPPED_DUPLICATE' ? 'info' : 'success', response.requestId);
    } else {
      showToast(response?.error || 'Synchronization failed.', 'error', response?.requestId || requestId);
    }
  } catch (error) {
    showToast(error.message || 'Synchronization failed.', 'error', requestId);
  } finally {
    processing = false;
    if (pendingAccepted) {
      pendingAccepted = false;
      void synchronizeAcceptedSubmission();
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

function showToast(message, type, requestId) {
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
  toast.append(content, close);
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('leetsync-toast--visible'));
  setTimeout(() => toast.remove(), type === 'error' ? 9000 : 6000);
}
