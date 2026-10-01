# Testing and Verification

## Automated verification

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
| Extractor | Problem URL, numbered titles, language labels, runtime and memory parsing |
| GitHub client | Auth headers, push-permission filtering, missing files, content decoding, SHA updates, retries, 401 classification |
| OAuth service | Origin rejection, config route, input validation, request ID propagation, PKCE forwarding, secret forwarding |
| Submission service | New file and README, identical-content no-op, stale-SHA recovery, history tracing, expired-token handling |
| Build validation | Every manifest asset exists, source text contains no corrupted encoding or emoji characters |

## Manual acceptance procedure

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

## Debugging a failed manual case

Use the request ID displayed in the LeetCode notification or popup history:

1. Search the service-worker console for that ID.
2. If authentication failed, search the OAuth service JSON logs for the same ID.
3. Check the response outcome before inspecting selectors or GitHub permissions.
4. Never paste access tokens or authorization codes into issue reports.

## External limitations

The automated suite does not call live GitHub or LeetCode services. This keeps it repeatable and prevents tests from writing to a real repository. Final acceptance therefore includes the controlled manual workflow above.
