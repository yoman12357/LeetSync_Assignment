# File Guide

This guide states what enters and leaves every maintained project file. Generated dependencies and build artifacts are listed separately because they are not source files.

## Root files

### `.gitattributes`

- Input: files added to Git on any operating system.
- Output: consistent LF text files and binary handling for PNG assets.
- Responsibility: prevents platform-specific line-ending noise without altering binary icons.

### `.env.example`

- Input: none at runtime; it is copied manually to `.env`.
- Output: documents the OAuth client ID, client secret, allowed extension IDs, server port, and optional deployed OAuth URL.
- Responsibility: configuration template. It contains no usable credential.

### `.eslintrc.cjs`

- Input: JavaScript files selected by the lint command.
- Output: ESLint environment, parser, ignore, console, and unused-variable rules.
- Responsibility: deterministic static-analysis policy for browser and Node modules.

### `.gitignore`

- Input: paths considered by Git.
- Output: excludes dependencies, secrets, build output, archives, logs, coverage, editor files, and temporary files.
- Responsibility: prevents local or generated data from entering commits.

### `manifest.json`

- Input: read by `scripts/build.js`, then by Chrome from `dist`.
- Output: stable extension ID, permissions, host permissions, background entry, page scripts, popup, and icon declarations.
- Responsibility: defines the Manifest V3 extension boundary. Its public key keeps the development ID stable for OAuth; it references generated bundle names rather than source paths.

### `package.json`

- Input: npm commands and dependency resolution.
- Output: scripts, Node version, package metadata, and development dependencies.
- Responsibility: single command surface for install, test, build, validation, packaging, cleanup, and server startup.

### `package-lock.json`

- Input: dependency decisions produced by npm.
- Output: exact dependency graph and integrity hashes.
- Responsibility: repeatable installation. It should change only through npm.

### `README.md`

- Input: actual project behavior and setup requirements.
- Output: user-facing installation, configuration, operation, security, tracing, commands, and limitations.
- Responsibility: primary handoff document for mentors and contributors.

### `CONTRIBUTING.md`

- Input: development workflow and code policy.
- Output: contribution, debugging, and review instructions.
- Responsibility: keeps changes consistent with component boundaries and secret-handling rules.

### `LICENSE`

- Input: none.
- Output: MIT license terms.
- Responsibility: states reuse and distribution rights.

## Extension configuration and shared logic

### `src/config/constants.js`

- Input: optional build-time `globalThis.__LEETSYNC_OAUTH_SERVER_URL__` replacement.
- Output: frozen GitHub endpoints, message names, storage keys, default settings, language maps, retry policy, and limits.
- Responsibility: keeps names and policy values consistent across extension modules.

### `src/utils/helpers.js`

- Input: strings, source code, language labels, timestamps, problem metadata, OAuth verifier, and HTTP status information.
- Output: request IDs, PKCE challenge, normalized paths and code, SHA-256 fingerprints, UTF-8 Base64, commit messages, bounded maps, generated README text, error classification, and backoff durations.
- Responsibility: pure reusable transformations. It performs no Chrome storage or network calls.

### `src/github/github-client.js`

- Input: GitHub access token, REST endpoint arguments, file contents, SHA values, and an injectable `fetch` implementation.
- Output: normalized user, repository, and file results or a typed `GitHubApiError`.
- Responsibility: owns GitHub REST headers, pagination, Base64 conversion, transient retries, permissions, and status classification.

## Background worker

### `src/background/oauth.js`

- Input: `chrome.identity`, session storage, OAuth service configuration, GitHub callback URL, code, state, and PKCE verifier.
- Output: a validated access token and request ID, or an authentication error.
- Responsibility: performs the browser half of OAuth without exposing the client secret. Pending state expires after ten minutes.

### `src/background/submission-service.js`

- Input: validated submission payload, request ID, extension storage, selected repository, settings, and an authenticated GitHub client.
- Output: created, updated, duplicate, or failed synchronization response; bounded fingerprint and history updates.
- Responsibility: owns synchronization decisions, per-problem serialization, content comparison, SHA conflict recovery, optional README writes, and expired-token notification.

### `src/background/service-worker.js`

- Input: runtime messages from the popup and content script, sender metadata, Chrome storage, and GitHub/OAuth results.
- Output: correlated runtime responses, badge state, persisted account and repository state, and structured console logs.
- Responsibility: trusted extension coordinator. It validates message types and rejects submission messages not sent from LeetCode problem pages.

## LeetCode integration

### `src/content/page-bridge.js`

- Input: LeetCode page-level `fetch` and `XMLHttpRequest` calls to submit and check endpoints.
- Output: sanitized `window.postMessage` events containing captured code, language, result, and performance fields.
- Responsibility: runs in the page's main world because isolated content scripts cannot observe page-owned network functions. It has no Chrome extension access.

### `src/content/extractor.js`

- Input: a document, current URL, page title, and optional data captured by the bridge.
- Output: structured submission metadata, normalized language, parsed title, stats, difficulty, and description.
- Responsibility: isolates LeetCode selectors and parsing rules so markup changes have a small repair surface.

### `src/content/content.js`

- Input: bridge window messages, DOM mutations, Chrome settings, and service-worker responses.
- Output: correlated `SUBMISSION_ACCEPTED` runtime messages and visible status notifications.
- Responsibility: joins trusted extension messaging with untrusted page data. It performs no GitHub operation and never receives the access token.

### `src/content/toast.css`

- Input: toast type classes created by `content.js`.
- Output: fixed, accessible notification styling on LeetCode pages.
- Responsibility: keeps notification presentation separate from observation and synchronization logic.

## Popup

### `src/popup/popup.html`

- Input: popup CSS and generated popup JavaScript bundle.
- Output: semantic controls for OAuth, callback copying, repository management, settings, history, and loading state.
- Responsibility: static popup structure. It contains no inline script or remote asset.

### `src/popup/popup.css`

- Input: classes and states toggled by `popup.js`.
- Output: compact dark popup layout, control states, loading overlay, and activity presentation.
- Responsibility: presentation only.

### `src/popup/popup.js`

- Input: user actions and correlated service-worker responses.
- Output: runtime requests, safe DOM updates, copied callback URL, selected repository, persisted settings, and visible errors.
- Responsibility: popup controller. It never calls GitHub directly and never reads the token.

## OAuth service

### `server/oauth-server.js`

- Input: environment configuration and HTTP requests for health, public OAuth config, CORS preflight, and code exchange.
- Output: JSON responses with `X-Request-Id`, GitHub token exchange requests, and structured completion logs.
- Responsibility: protects the client secret, checks extension IDs and origins, validates matching redirect URIs and body-size limits, and exchanges authorization codes with GitHub. It supports streamed local requests and parsed Vercel bodies, and exports both a reusable request handler and a local HTTP server wrapper.

### `api/health.js`

- Input: Vercel request for `/api/health` and server environment variables.
- Output: configuration health JSON and request trace.
- Responsibility: exposes the shared OAuth handler as a Vercel function.

### `api/config.js`

- Input: allowed extension request for `/api/config`.
- Output: public GitHub OAuth client ID.
- Responsibility: provides the extension-safe portion of OAuth configuration through Vercel.

### `api/github/token.js`

- Input: allowed extension origin, authorization code, PKCE verifier, and redirect URI.
- Output: GitHub access token response or a classified error.
- Responsibility: exposes the secret-bearing token exchange through a Vercel function.

## Build and maintenance scripts

### `scripts/build.js`

- Input: source entry points, manifest, CSS, HTML, icons, and optional `LEETSYNC_OAUTH_SERVER_URL`.
- Output: bundled unpacked extension under `dist`, including the required OAuth host permission.
- Responsibility: converts modular source into browser-loadable service-worker, content, bridge, and popup bundles.

### `scripts/package.js`

- Input: the build script and generated `dist` directory.
- Output: `leetsync-extension.zip`.
- Responsibility: creates a distributable archive without changing maintained source.

### `scripts/clean.js`

- Input: known generated paths only.
- Output: removal of `dist`, coverage, temporary artifacts, and extension archive.
- Responsibility: returns the workspace to source-only form.

### `scripts/validate-project.js`

- Input: generated manifest, referenced build assets, and maintained text files.
- Output: a passing summary or an assertion identifying a missing asset, emoji, or corrupted text.
- Responsibility: catches packaging and repository-hygiene mistakes after the build.

## Tests

### `tests/helpers.test.js`

- Input: representative paths, languages, source text, Unicode, verifier, stats, and storage entries.
- Output: assertions for shared transformation and security helpers.
- Responsibility: protects utility contracts used across the extension.

### `tests/extractor.test.js`

- Input: representative LeetCode URLs, titles, language labels, and result text.
- Output: parsing assertions.
- Responsibility: detects regressions in selector-independent extraction rules.

### `tests/github-client.test.js`

- Input: mocked HTTP responses for users, repositories, files, failures, and retries.
- Output: assertions for request headers, normalized results, write payloads, and typed failures.
- Responsibility: verifies GitHub behavior without changing a real repository.

### `tests/oauth-server.test.js`

- Input: an ephemeral local server, allowed and rejected origins, malformed requests, and a mocked GitHub exchange.
- Output: route status, request-ID, validation, and forwarded-field assertions.
- Responsibility: verifies the complete local HTTP request/response boundary.

### `tests/oauth.test.js`

- Input: mocked Chrome identity, session storage, config response, and token response.
- Output: assertions for both extension-ID headers, request tracing, callback state, PKCE, and session cleanup.
- Responsibility: verifies the browser half of the OAuth flow before deployment.

### `tests/submission-service.test.js`

- Input: in-memory extension storage and mocked GitHub file operations.
- Output: assertions for create, duplicate, conflict, history, fingerprint, README, and expired-token flows.
- Responsibility: verifies the central synchronization state machine independently of Chrome.

## Documentation

### `docs/PROJECT_SPECIFICATION.md`

- Input: recruitment requirements and completed scope.
- Output: mandatory behavior, optional behavior, and acceptance criteria.

### `docs/ARCHITECTURE.md`

- Input: implemented component and data boundaries.
- Output: architecture, OAuth, synchronization, route, message, correctness, and security diagrams.

### `docs/TESTING.md`

- Input: automated suites and live acceptance scenarios.
- Output: verification commands, coverage matrix, manual procedure, and trace-based debugging method.

### `docs/FILE_GUIDE.md`

- Input: the maintained repository inventory.
- Output: this input, output, and responsibility map.

### `docs/DEPLOYMENT.md`

- Input: fixed extension ID, Vercel route layout, and GitHub OAuth requirements.
- Output: credential creation, deployment, packaging, live-test, and submission instructions.
- Responsibility: provides a reproducible handoff without exposing secrets.

## Assets

### `assets/icons/icon16.svg`

- Input: vector logo geometry and color.
- Output: editable source artwork.
- Responsibility: source for future icon exports; it is not referenced directly by the manifest.

### `assets/icons/icon16.png`

- Input: exported icon artwork.
- Output: Chrome toolbar icon at 16 pixels.

### `assets/icons/icon48.png`

- Input: exported icon artwork.
- Output: Chrome extension-management icon at 48 pixels.

### `assets/icons/icon128.png`

- Input: exported icon artwork.
- Output: Chrome installation and store icon at 128 pixels.

## Generated and local-only paths

- `.env`: local credentials; ignored and never packaged.
- `node_modules/`: installed dependencies; recreated by `npm install`.
- `dist/`: unpacked extension; recreated by `npm run build`.
- `coverage/`: test coverage output; recreated by `npm run test:coverage`.
- `leetsync-extension.zip`: distribution archive; recreated by `npm run package`.
