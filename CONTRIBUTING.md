# Contributing

## Development workflow

1. Install dependencies with `npm install`.
2. Make a focused change in the module that owns the behavior.
3. Add or update tests for the changed contract.
4. Run `npm run verify`.
5. Load `dist` as an unpacked extension for the relevant manual scenario.

Do not commit `.env`, OAuth credentials, `dist`, coverage output, or extension archives.

## Code conventions

- Use ES modules and `async`/`await`.
- Keep Chrome API calls at extension boundaries.
- Keep parsing, normalization, and decision logic in testable functions.
- Add comments only when a browser boundary or correctness rule is not clear from the code.
- Never log GitHub tokens, OAuth codes, or complete source submissions.
- Preserve request IDs across component boundaries.

## Debugging locations

- Popup: right-click the extension popup and select Inspect.
- Service worker: open `chrome://extensions` and inspect the LeetSync service worker.
- Content and page bridge: open DevTools on the active LeetCode tab.
- OAuth service: inspect structured logs in the terminal running `npm run server`.

## Pull request checklist

- Lint passes.
- Automated tests pass.
- The extension builds and manifest validation passes.
- OAuth secrets are absent from the changes.
- Documentation matches any changed input, output, route, permission, or failure behavior.
