# Project Specification

## Objective

When a LeetCode submission reaches Accepted, capture its problem identity, language, and source code, then create or update the corresponding file in a user-selected GitHub repository.

## Mandatory behavior

- Authenticate through GitHub OAuth 2.0 using `chrome.identity`.
- Keep the OAuth client secret outside the extension.
- Select or create a writable target repository.
- Observe LeetCode problem pages without interfering with normal page behavior.
- Detect only successful Accepted submissions.
- Extract the problem number, slug, title, language, and submitted source.
- Create or update files through the GitHub Contents API.
- Avoid repeated commits for identical code.
- Replace an existing solution when its content changes.
- Handle revoked authorization, network failures, stale SHAs, unsupported languages, and incomplete extraction.

## Implemented optional behavior

- Generate a problem README beside the solution.
- Include runtime and memory in a language-appropriate source header.

Both features can be disabled in the popup.

## Acceptance criteria

- Login fails safely when the OAuth service is missing or misconfigured.
- OAuth callback state and PKCE are validated.
- Repository selection checks current push permission.
- Rejected or pending LeetCode submissions do not synchronize.
- The first accepted solution creates a solution file.
- Identical content creates no additional GitHub write.
- Changed content updates using the current SHA.
- A stale SHA is refreshed and retried at most once.
- A revoked token clears local authentication state.
- Rapid duplicate events for one problem are serialized.
- Every extension response and OAuth route response contains a request ID.
- No credentials, build output, or generated archive are tracked as source.
