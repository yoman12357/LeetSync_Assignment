# LeetSync

LeetSync is a Chrome Manifest V3 extension that detects accepted LeetCode submissions and stores the submitted source in a GitHub repository selected by the user.

The implementation includes GitHub OAuth, repository selection and creation, main-world network capture, duplicate prevention, SHA-based file updates, optional problem READMEs, performance headers, request tracing, and automated tests.

## Requirements

- Node.js 20 or newer
- Google Chrome or another Chromium browser with Manifest V3 support
- A GitHub account
- A GitHub OAuth App

For the complete hosted setup and submission checklist, follow [Deployment and credentials](docs/DEPLOYMENT.md).

## Local setup

### 1. Install and build

```bash
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, select Load unpacked, and choose the generated `dist` directory.

The committed public manifest key keeps the development extension ID stable as `gfajaonbokecoaehhioghldkimgdfdfe`, including when a reviewer loads `dist` from another directory.

### 2. Register the OAuth App

Open the LeetSync popup and copy the displayed callback URL:

```text
https://gfajaonbokecoaehhioghldkimgdfdfe.chromiumapp.org/
```

Create a GitHub OAuth App in GitHub Developer Settings and use that exact value as its Authorization callback URL. Copy the Client ID and Client Secret.

### 3. Configure the OAuth service

Copy `.env.example` to `.env` and set:

```dotenv
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
ALLOWED_EXTENSION_IDS=gfajaonbokecoaehhioghldkimgdfdfe
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

LeetSync loads across LeetCode so navigation from the problem list is supported. It captures the full source from the Submit request and matches its submission ID to the Accepted response. If network capture misses a submission, it finds the new submission in your authenticated submission list or a submission detail URL, then reads the full judged source from LeetCode. Run Code test results and previously viewed submissions do not trigger synchronization. After rebuilding or reloading the extension, refresh the LeetCode tab before submitting.

The popup displays the extension version and links to the selected repository. New synchronization entries and success notifications link directly to the saved file. "Already saved" means the file exists in GitHub with identical content. Problem folders such as `0002-add-two-numbers` are created at the repository root.

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
- OAuth requests include the configured extension ID; when an Origin header is present, it must match an allowed extension origin.
- Tokens, authorization codes, and submitted source are excluded from application logs.

`chrome.storage.local` is extension-scoped persistence, not encrypted secret storage. A production extension should consider a short-lived GitHub App token design when stronger token lifecycle control is required.

Extension IDs and Origin headers are routing checks, not proof of identity. GitHub verifies the authorization code, PKCE verifier, client credentials, and callback during the token exchange.

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
- [Deployment and credentials](docs/DEPLOYMENT.md)
- [Project requirements](docs/PROJECT_SPECIFICATION.md)
- [External references and credits](docs/REFERENCES.md)
- [Submission and demo checklist](docs/SUBMISSION.md)

## Submission

Repository: [LeetSync_Assignment](https://github.com/yoman12357/LeetSync_Assignment).

Hosted OAuth service: [production health endpoint](https://leetsyncassignment.vercel.app/api/health). The root address is not a web application: LeetSync is opened from the browser's extension toolbar.

To build against that service in PowerShell:

```powershell
$env:LEETSYNC_OAUTH_SERVER_URL = "https://leetsyncassignment.vercel.app"
npm run verify
npm run package
Remove-Item Env:LEETSYNC_OAUTH_SERVER_URL
```

Load `dist` using **Load unpacked**, or unzip `leetsync-extension.zip` and load the extracted folder. Refresh existing LeetCode tabs after reloading the extension.

The demonstration will be added as [`demo.mp4`](demo.mp4) in this repository's root. A live accepted-submission test and the recording remain required even when automated tests pass.

## Known boundaries

- LeetCode can change DOM structure or network payloads. Capture rules are isolated in `page-bridge.js` and `extractor.js` so they can be updated without changing GitHub synchronization.
- Automated tests use deterministic fixtures and mock GitHub responses. A real GitHub account and a live LeetCode submission are still required for the final manual acceptance test.
- The checked-in manifest permits the local OAuth service at `http://localhost:3000`. For deployment, set `LEETSYNC_OAUTH_SERVER_URL` during the build; the build adds that origin to the generated manifest.
- Concurrent protection is process-local plus GitHub SHA validation. A distributed backend would require a shared queue or lock.

## License

MIT. See [LICENSE](LICENSE).
