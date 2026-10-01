(() => {
  const SOURCE = 'leetsync-page';
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  function publish(type, payload) {
    window.postMessage({ source: SOURCE, type, payload }, window.location.origin);
  }

  function readJson(value) {
    if (typeof value !== 'string') return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function captureRequest(url, method, body) {
    if (!String(url).includes('/submit/') || String(method).toUpperCase() !== 'POST') return;
    const data = readJson(body);
    if (!data) return;
    const problemSlug = String(url).match(/\/problems\/([a-z0-9-]+)\/submit\//i)?.[1] || '';
    publish('SUBMISSION_CAPTURED', {
      code: typeof data.typed_code === 'string' ? data.typed_code : '',
      language: typeof data.lang === 'string' ? data.lang : '',
      problemSlug,
      capturedAt: Date.now(),
    });
  }

  function captureResponse(url, body) {
    if (!String(url).includes('/check/')) return;
    const data = typeof body === 'string' ? readJson(body) : body;
    if (data?.state !== 'SUCCESS' || data?.status_msg !== 'Accepted') return;
    publish('SUBMISSION_ACCEPTED', {
      code: typeof data.typed_code === 'string' ? data.typed_code : '',
      language: typeof data.lang === 'string' ? data.lang : '',
      stats: {
        runtime: data.status_runtime || null,
        memory: data.status_memory || null,
      },
      acceptedAt: Date.now(),
    });
  }

  window.fetch = async function leetSyncFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const method = init?.method || input?.method || 'GET';
    if (init?.body) captureRequest(url, method, init.body);
    else if (input instanceof Request && String(url).includes('/submit/')) {
      input.clone().text().then((body) => captureRequest(url, method, body)).catch(() => {});
    }

    const response = await originalFetch.apply(this, arguments);
    if (String(url).includes('/check/')) {
      response.clone().json().then((body) => captureResponse(url, body)).catch(() => {});
    }
    return response;
  };

  XMLHttpRequest.prototype.open = function leetSyncOpen(method, url) {
    this.__leetSyncRequest = { method, url };
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function leetSyncSend(body) {
    const request = this.__leetSyncRequest;
    if (request) {
      captureRequest(request.url, request.method, body);
      this.addEventListener('load', () => {
        try { captureResponse(request.url, this.responseText); } catch { /* Response is not text. */ }
      }, { once: true });
    }
    return originalSend.apply(this, arguments);
  };
})();
