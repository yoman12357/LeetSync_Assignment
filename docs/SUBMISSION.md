# Submission and demonstration

## Reviewer entry point

1. Follow the README's hosted build commands, or [DEPLOYMENT.md](DEPLOYMENT.md) to configure a separate OAuth service.
2. Load `dist` from `chrome://extensions` or `edge://extensions` using Developer mode and Load unpacked.
3. Open LeetSync from the toolbar, connect GitHub, and select a disposable writable repository.
4. Sign in to LeetCode, submit an accepted solution, and inspect the saved GitHub file.
5. Run `npm run verify`. Tests mock external services and do not write to a live repository.

## Evaluation evidence

| Criterion | Evidence | What still requires the author |
| --- | --- | --- |
| Effort and development practice | Focused modules, genuine commit history, lint and tests | Explain development decisions; do not fabricate or backdate history. |
| Documentation | README, diagrams, file guide, deployment and testing guides | Verify a fresh installation and the current hosted service. |
| External-source understanding | [REFERENCES.md](REFERENCES.md), inline LeetHub credit | Explain the query-field reference and credit any additional material used. |
| Features beyond basic sync | Full-source recovery, identical-content no-op, SHA conflict recovery, request IDs, direct file links | Show their purpose without claiming unique invention. |
| Working submission | Automated tests and live acceptance procedure | Record root `demo.mp4` using a real accepted submission. |
| Delivery | OAuth health link and packaged/unpacked extension | Share the repository and installation instructions; the API URL alone is not the extension. |

## Suggested recording: 4-6 minutes

Save the recording as `demo.mp4` in the project root.

1. Show the loaded extension and version. Open the popup from the toolbar, not the Vercel root address.
2. Connect GitHub and select a disposable repository. Do not display client secrets, access tokens, or authorization codes.
3. Submit your own accepted LeetCode solution. Show the notification and the GitHub file with the complete source, optional README, and performance header.
4. Submit identical source again and show that it does not create a duplicate commit. Change the solution and show an update.
5. Show that Run Code or a rejected submission does not write a solution to GitHub.
6. Run `npm run verify`, then explain the architecture and trace one request through page bridge, content script, service worker, GitHub client, and response/history.
7. Explain why OAuth needs a server-side secret, why the token never reaches the LeetCode page, and why SHA-based writes handle conflicting updates.

The tests cannot replace this live demonstration. Record the actual outcome, including any known limitations, and confirm the video plays before committing it.

## Explain these without memorizing lines

- Why are page bridge, content script, and background worker separate?
- Why must the submission ID match the accepted result?
- Why is reading the full judged source safer than scraping visible editor lines?
- How do OAuth state and PKCE protect different parts of the flow?
- Which values are public, and which credentials stay on the server?
- Why does GitHub require the current file SHA for updates?
- What survives service-worker suspension, and what locking is only process-local?
- How does the same request ID connect UI feedback, worker logs, OAuth logs, and history?

## Final handoff

- Add `demo.mp4` and verify its README link on GitHub. Keep ordinary Git uploads under 100 MB, or document a hosted video/Git LFS alternative.
- Verify `/api/health` reports `configured: true`, then complete the live acceptance procedure in [TESTING.md](TESTING.md).
- Rotate any OAuth secret that was previously exposed in a screenshot or message. Redeploy after changing Vercel environment variables.
- Keep `.env`, archives, dependencies, build output, and logs out of commits.
- Share the repository, recording, hosted health URL, and ZIP or build instructions.
