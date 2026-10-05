# Testing and Verification

## Automated verification

Local verification on 5 October 2026: `npm run verify` passed all 76 tests, lint, production build, and manifest/text validation. `npm run package` also succeeded with the production OAuth URL. These are local results, not a claim that remote CI or every live-account scenario passed.

Run:

```bash
npm run verify
```

This performs:

1. ESLint checks across extension, server, scripts, and tests.
2. Node tests with deterministic concurrency.
3. An esbuild production bundle.
4. Manifest-reference, text-corruption, and no-emoji validation.

## Automated test matrix

| Area | Verified behavior |
|---|---|
| Helpers | Paths, languages, indentation, UTF-8 Base64, SHA-256 fingerprint, PKCE, bounded storage, generated text |
| Extractor | Problem URL, numbered titles, language labels, runtime and memory parsing, complete source without editor-text fallback |
| Page bridge | Fetch string/Request/URL inputs, XHR text/JSON responses, matching submission IDs, overlapping submissions, ignored test runs, repeated polls, non-JSON responses |
| Content script | Complete accepted source, long-running submissions, overlapping results, previous-problem rejection, disabled sync, window-message origin checks, recovery without bridge capture, recovery deduplication |
| Submission reader | Same-origin list/GraphQL/exact-ID check reads, named verdicts, pending judging, server-clock alignment, browser fetch receiver, CSRF header, complete source, rejection of old/failed/unrelated results |
| GitHub client | Browser fetch receiver, auth headers, push-permission filtering, missing files, content decoding, SHA updates, retries, 401 classification |
| OAuth service | Origin rejection, background requests without Origin, allowed IDs, matching callbacks, parsed Vercel bodies, body-size limits, request tracing, PKCE forwarding |
| OAuth client | Extension ID headers on both requests, PKCE challenge, callback state, and pending-state cleanup |
| Submission service | New file and README, identical-content no-op with destination link, stale-SHA recovery, history tracing, rejection of outdated content scripts, expired-token handling |
| Build validation | Every manifest asset exists, source text contains no corrupted encoding or emoji characters |

## Manual acceptance procedure

The GitHub Actions workflow runs `npm run verify` on pushes and pull requests without OAuth credentials. A successful local run does not imply the remote workflow or live integration has already been checked.

1. Run `npm run verify`.
2. Load `dist` as an unpacked extension.
3. Configure the GitHub OAuth App and `.env` as described in the README.
4. Start `npm run server` and verify `/health` reports `configured: true`.
5. Authenticate and select a new test repository.
6. Submit an accepted LeetCode solution and verify the expected path and commit.
7. Submit the exact code again and verify no new GitHub commit appears.
8. Change the code, submit again, and verify an update commit appears.
9. Revoke the OAuth token in GitHub settings and submit again; verify the popup returns to disconnected state.
10. Trigger repeated DOM mutations around an Accepted result and verify the repository is not spammed.
11. Use Run Code with passing test cases and verify there is no synchronization notification or GitHub commit.
12. Scroll the editor so only part of the solution is visible, Submit, and verify the entire submitted source is stored.
13. Start on the LeetCode problem list, navigate into a problem without refreshing, Submit, and verify synchronization.
14. Verify Submit shows a waiting notification. If network capture is missed, verify a new submission detail URL triggers recovery and saves the complete judged source only once.
15. Repeat with a submission whose result leaves the browser URL unchanged; verify recovery through the per-problem submission list.
16. Verify new history entries provide a working file link and identical source is labeled Already saved. Verify the popup version matches the rebuilt manifest.
17. Verify waiting remains visible until replaced by a final verdict or saving progress. If the worker never replies, verify an explicit timeout instructs you to inspect history before retrying.
18. Reload the extension with an existing LeetCode tab open. Verify the stale tab shows refresh instructions once, then refresh it and submit with the new content script.

For the hosted acceptance path, follow [DEPLOYMENT.md](DEPLOYMENT.md) and verify `/api/health` before loading the production build.

## Debugging a failed manual case

Use the request ID displayed in the LeetCode notification or popup history:

1. Search the service-worker console for that ID.
2. If authentication failed, search the OAuth service JSON logs for the same ID.
3. Check the response outcome before inspecting selectors or GitHub permissions.
4. Never paste access tokens or authorization codes into issue reports.

## External limitations

The automated suite does not call live GitHub or LeetCode services. This keeps it repeatable and prevents tests from writing to a real repository. Final acceptance therefore includes the controlled manual workflow above.
