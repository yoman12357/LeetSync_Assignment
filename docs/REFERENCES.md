# References and credits

## Integration reference

[LeetHub 2.0, arunbhardwaj and contributors](https://github.com/arunbhardwaj/LeetHub-2.0) is referenced for LeetCode GraphQL query fields used to read complete judged source and metadata. The specific reference is [scripts/leetcode/versions.js](https://github.com/arunbhardwaj/LeetHub-2.0/blob/main/scripts/leetcode/versions.js); the corresponding LeetSync file is `src/content/submission-reader.js`, which also contains an inline source link.

This is a reference for an undocumented LeetCode integration, not an official LeetCode API contract. LeetCode can change fields or authentication requirements, so this integration needs a live acceptance test in addition to mocked tests.

## Upstream technology and documentation

| Source and maintainers | Used for |
| --- | --- |
| [Chrome extension documentation, Google](https://developer.chrome.com/docs/extensions/) | Manifest V3, isolated content scripts, main-world capture, and service-worker lifecycle. |
| [Chrome Identity API, Google](https://developer.chrome.com/docs/extensions/reference/api/identity) | `launchWebAuthFlow` and the fixed extension callback URL. |
| [Chrome Storage API, Google](https://developer.chrome.com/docs/extensions/reference/api/storage) | Extension-local settings/history and session-scoped pending OAuth state. |
| [GitHub OAuth documentation, GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) | Authorization-code exchange and GitHub OAuth configuration. |
| [GitHub repository contents API, GitHub](https://docs.github.com/en/rest/repos/contents) | Reading file contents, comparing source, and supplying the current SHA on updates. |
| [RFC 7636, Sakimura, Bradley, and Agarwal](https://www.rfc-editor.org/rfc/rfc7636) | PKCE verifier and S256 challenge used by the OAuth client. |
| [esbuild, Evan Wallace and contributors](https://github.com/evanw/esbuild) | Bundling extension entry points without exposing server credentials. |
| [ESLint contributors](https://github.com/eslint/eslint) | Static checks for unused variables and accidental debug logging. |
| [Node.js contributors](https://nodejs.org/api/test.html) | Built-in test runner and deterministic integration fixtures. |
| [Vercel documentation, Vercel](https://vercel.com/docs/functions) | Deploying the shared OAuth handler through `api` entry points. |
| [Recruitment task repository, WebClub NITK](https://github.com/WebClub-NITK/GDGxIris-Recruitments-2026/tree/main/Standalone%20Tasks) | Assignment requirements and acceptance criteria. |

LeetCode problem statements and submitted solutions belong to their respective rights holders/authors. Generated problem READMEs link back to the problem; use your own solutions and respect LeetCode's terms when choosing what to publish.

For any additional borrowed snippet, document its URL, developer, affected file, and license before submission. Do not invent sources or claim a star action was performed. Star the repositories you personally referred to from your GitHub account.
