(() => {
  const SOURCE = 'leetsync-page';
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const submissions = new Map();

  function publish(type, payload) {
    window.postMessage({ source: SOURCE, type, payload }, window.location.origin);
  }

  function readJson(value) {
    if (typeof value !== 'string') return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function requestPath(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.origin === window.location.origin ? parsed.pathname : '';
    } catch { return ''; }
  }

  function captureRequest(url, method, body) {
    if (String(method).toUpperCase() !== 'POST') return null;
    const path = requestPath(url);
    const restSlug = path.match(/(?:^\/api)?\/problems\/([a-z0-9-]+)\/submit\/?$/i)?.[1];
    if (restSlug) {
      const data = readJson(body);
      if (!data) return null;
      return {
        code: typeof data.typed_code === 'string' ? data.typed_code : '',
        language: typeof data.lang === 'string' ? data.lang : '',
        problemSlug: restSlug,
        capturedAt: Date.now(),
      };
    }
    if (path === '/graphql' || path === '/graphql/') {
      const data = readJson(body);
      if (!data) return null;
      const query = data.query || data.operationName || '';
      const opName = data.operationName || '';
      if ((/mutation\b/.test(query) && /submit/i.test(query)) || /submit/i.test(opName)) {
        const vars = data.variables || {};
        const slug = vars.titleSlug || vars.questionSlug || vars.slug || '';
        return {
          code: typeof vars.typed_code === 'string' ? vars.typed_code : '',
          language: typeof vars.lang === 'string' ? vars.lang : '',
          problemSlug: slug,
          capturedAt: Date.now(),
        };
      }
    }
    return null;
  }

  function captureResponse(url, body, request) {
    const path = requestPath(url);
    const data = typeof body === 'string' ? readJson(body) : body;
    if (request && data?.submission_id != null) {
      const submissionId = String(data.submission_id);
      submissions.set(submissionId, { ...request, submissionId });
      if (submissions.size > 20) submissions.delete(submissions.keys().next().value);
      return;
    }
    const submissionId = path.match(/\/submissions\/(?:detail\/)?([^/]+)\/check\/?$/)?.[1];
    const captured = submissions.get(submissionId);
    if (!captured || data?.state !== 'SUCCESS') return;
    submissions.delete(submissionId);
    if (data.status_msg !== 'Accepted') return;
    publish('SUBMISSION_ACCEPTED', {
      ...captured,
      stats: {
        runtime: data.status_runtime || null,
        memory: data.status_memory || null,
      },
      acceptedAt: Date.now(),
    });
  }

  window.fetch = async function leetSyncFetch(input, init) {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method || input?.method || 'GET';
    const path = requestPath(url);
    let request;
    if (init?.body) request = captureRequest(url, method, init.body);
    else if (input instanceof Request && (path.includes('/submit/') || path.includes('/graphql'))) {
      try { request = captureRequest(url, method, await input.clone().text()); } catch { /* Body is unavailable. */ }
    }

    const response = await originalFetch.apply(this, arguments);
    if (request || path.includes('/check/')) {
      // Register the ID before the page can start polling its result.
      try { captureResponse(url, await response.clone().json(), request); } catch { /* Response is not JSON. */ }
    }
    if (path.includes('/graphql') && method.toUpperCase() === 'POST') {
      try {
        const clone = response.clone();
        const gqlBody = await clone.json();
        const submissionIdFromGql = gqlBody?.data?.submitCode?.submission_id
          ?? gqlBody?.data?.submit?.submissionId
          ?? gqlBody?.data?.submissionCreateOrUpdate?.submission_id
          ?? gqlBody?.data?.submitCode?.submissionId;
        if (submissionIdFromGql != null) {
          if (request) {
            captureResponse(url, { submission_id: submissionIdFromGql }, request);
          }
        }
        const checkData = gqlBody?.data?.submissionDetails || gqlBody?.data?.submissionStatus;
        if (checkData?.state === 'SUCCESS' || checkData?.statusCode === 10) {
          const sid = String(checkData.submissionId || checkData.id || '');
          const captured = submissions.get(sid);
          if (captured) {
            submissions.delete(sid);
            if (checkData.status_msg === 'Accepted' || checkData.statusCode === 10) {
              publish('SUBMISSION_ACCEPTED', {
                ...captured,
                stats: {
                  runtime: checkData.runtimeDisplay || checkData.status_runtime || null,
                  memory: checkData.memoryDisplay || checkData.status_memory || null,
                },
                acceptedAt: Date.now(),
              });
            }
          }
        }
      } catch { /* Response is not JSON. */ }
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
      const captured = captureRequest(request.url, request.method, body);
      this.addEventListener('load', () => {
        try {
          const response = this.responseType === 'json' ? this.response : this.responseText;
          captureResponse(request.url, response, captured);
        } catch { /* Response is not JSON or text. */ }
      }, { once: true });
    }
    return originalSend.apply(this, arguments);
  };
})();
