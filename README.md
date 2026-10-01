# LeetSync

LeetSync is a Chrome Manifest V3 extension that detects accepted LeetCode submissions and stores the submitted source in a GitHub repository selected by the user.

The implementation includes GitHub OAuth, repository selection and creation, LeetCode page observation, main-world network capture, duplicate prevention, SHA-based file updates, optional problem READMEs, performance headers, request tracing, and automated tests.

## Requirements

- Node.js 20 or newer
- Google Chrome or another Chromium browser with Manifest V3 support
- A GitHub account
- A GitHub OAuth App

## Local setup

### 1. Install and build

```bash
npm install
npm run build
```

Open `chrome://extensions`, enable Developer mode, select Load unpacked, and choose the generated `dist` directory.

### 2. Register the OAuth App

Open the LeetSync popup and copy the displayed callback URL. It has this form:

```text
https://<extension-id>.chromiumapp.org/
```

Create a GitHub OAuth App in GitHub Developer Settings and use that exact value as its Authorization callback URL. Copy the Client ID and Client Secret.

### 3. Configure the OAuth service

Copy `.env.example` to `.env` and set:

```dotenv
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
ALLOWED_EXTENSION_IDS=the_extension_id_from_chrome
PORT=3000
```

`ALLOWED_EXTENSION_IDS` accepts a comma-separated list when several development builds need access.

Start the service:

```bash
npm run server
```

Verify it at `http://localhost:3000/health`, open the extension popup, and select Connect GitHub.

### 4. Select a repository

Select any repository for which the connected account has push permission, or create one from the popup. LeetSync validates write access before saving the selection.

### 5. Use the extension

Open a URL under `https://leetcode.com/problems/`, submit a solution, and wait for an Accepted result. The content script sends the captured submission to the background worker. A notification reports whether the solution was created, updated, skipped as identical, or rejected.

## Commands

```bash
npm run lint          # Static analysis
npm test              # Automated tests
npm run test:coverage # Node test coverage report
npm run build         # Build the unpacked extension in dist
npm run validate      # Validate manifest assets and text policy
npm run verify        # Lint, test, build, and validate
npm run package       # Build and create leetsync-extension.zip
npm run clean         # Remove generated artifacts
npm run server        # Start the OAuth exchange service
```

## Repository output

```text
leetcode-solutions/
|-- 0001-two-sum/
|   |-- solution.cpp
|   `-- README.md
`-- 0121-best-time-to-buy-and-sell-stock/
    |-- solution.py
    `-- README.md
```

LeetSync does not overwrite the repository's root README.

## Correctness and security

- The GitHub client secret exists only in the OAuth service environment.
- OAuth requests use an unpredictable state value and PKCE S256.
- Pending OAuth state is stored in `chrome.storage.session`, so a service-worker suspension does not silently bypass validation.
- The GitHub token is kept in extension-scoped local storage and is never sent to the LeetCode page.
- Submission messages are accepted only from `https://leetcode.com/problems/*` senders.
- File contents are read before every write. Identical content is a no-op; updates include the current GitHub SHA.
- Writes to the same problem and language are serialized inside the active service worker.
- A stale SHA conflict triggers one fresh read and one safe retry.
- A GitHub 401 clears authentication state and requires login again.
- OAuth service CORS accepts only configured Chrome extension IDs.
- Tokens, authorization codes, and submitted source are excluded from application logs.

`chrome.storage.local` is extension-scoped persistence, not encrypted secret storage. A production extension should consider a short-lived GitHub App token design when stronger token lifecycle control is required.

## Request tracing

Popup and content-script actions generate a request ID. The service worker returns the same ID, writes it to structured logs, and stores it in synchronization history. OAuth requests forward it in `X-Request-Id`; the OAuth service returns it in both the response header and body.

Example service log:

```json
{"requestId":"request-token-1","method":"POST","path":"/api/github/token","status":200,"outcome":"TOKEN_ISSUED","durationMs":84}
```

## Documentation

- [Architecture and request flows](docs/ARCHITECTURE.md)
- [File-by-file guide](docs/FILE_GUIDE.md)
- [Testing and manual verification](docs/TESTING.md)
- [Project requirements](docs/PROJECT_SPECIFICATION.md)

## Known boundaries

- LeetCode can change DOM structure or network payloads. Capture rules are isolated in `page-bridge.js` and `extractor.js` so they can be updated without changing GitHub synchronization.
- Automated tests use deterministic fixtures and mock GitHub responses. A real GitHub account and a live LeetCode submission are still required for the final manual acceptance test.
- The checked-in manifest permits the local OAuth service at `http://localhost:3000`. For deployment, set `LEETSYNC_OAUTH_SERVER_URL` during the build; the build adds that origin to the generated manifest.
- Concurrent protection is process-local plus GitHub SHA validation. A distributed backend would require a shared queue or lock.

## License

MIT. See [LICENSE](LICENSE).
