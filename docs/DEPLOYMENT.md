# Deployment and credentials

LeetSync has two deliverables:

1. a small OAuth service hosted on Vercel;
2. a Chrome extension built into `dist` and `leetsync-extension.zip`.

The extension does not use a database. The GitHub client secret exists only in Vercel and is never bundled into the extension.

## 1. Deploy the OAuth service once

1. Push the repository to GitHub.
2. Sign in to Vercel with GitHub.
3. Select **Add New Project** and import the LeetSync repository.
4. Choose **Other** as the framework preset.
5. Keep the root directory as the repository root.
6. Use `npm run build` as the build command.
7. Set the output directory to `dist`.
8. Deploy once to obtain the production address, such as `https://leetsync-assignment.vercel.app`.

The files under `api` expose these serverless routes:

```text
GET  /api/health
GET  /api/config
POST /api/github/token
```

The first deployment can report `configured: false` until the GitHub credentials are added.

The root address can return 404 because this project serves an OAuth API and extension assets. Check `/api/health` to verify the service.

## 2. Create the GitHub OAuth App

1. Sign in to GitHub.
2. Open the profile menu and select **Settings**.
3. Open **Developer settings**.
4. Select **OAuth Apps**.
5. Select **New OAuth App** or **Register a new application**.
6. Enter these values:

```text
Application name: LeetSync
Homepage URL: https://your-project.vercel.app
Authorization callback URL: https://gfajaonbokecoaehhioghldkimgdfdfe.chromiumapp.org/
```

7. Register the application.
8. Copy the displayed **Client ID**.
9. Select **Generate a new client secret**.
10. Copy the secret immediately and keep it private. GitHub will not show the complete value again.

The callback uses Chrome's identity redirect domain. The public key in `manifest.json` fixes the extension ID at `gfajaonbokecoaehhioghldkimgdfdfe`, so the callback remains the same for the author and reviewer.

## 3. Add Vercel environment variables

Open the Vercel project, then **Settings**, **Environment Variables**. Add each variable to Production, Preview, and Development:

```text
GITHUB_CLIENT_ID=<client ID copied from GitHub>
GITHUB_CLIENT_SECRET=<client secret copied from GitHub>
ALLOWED_EXTENSION_IDS=gfajaonbokecoaehhioghldkimgdfdfe
```

Do not add `PORT`; Vercel manages the function runtime. Do not add a personal access token; each extension user signs in through GitHub OAuth.

Redeploy the latest deployment after saving the variables. Verify:

```text
https://your-project.vercel.app/api/health
```

The JSON response must contain `"status":"ok"` and `"configured":true`.

## 4. Build the submitted extension

The OAuth URL is compiled into the extension at build time. In PowerShell, run from the repository root:

```powershell
$env:LEETSYNC_OAUTH_SERVER_URL = "https://your-project.vercel.app"
npm run verify
npm run package
Remove-Item Env:LEETSYNC_OAUTH_SERVER_URL
```

This produces:

```text
dist/                     unpacked extension for local testing
leetsync-extension.zip    archive for submission
```

The ZIP contains the public Vercel URL, not the GitHub client secret.

## 5. Run the final live test

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose `dist`.
4. Confirm the displayed ID is `gfajaonbokecoaehhioghldkimgdfdfe`.
5. Open LeetSync and select **Connect GitHub**.
6. Approve the requested `repo` and `read:user` permissions.
7. Select or create a disposable repository.
8. Submit an accepted LeetCode solution.
9. Confirm that the solution and optional problem README appear in GitHub.
10. Submit identical code again and confirm that no duplicate commit is created.

## 6. Submission checklist

Submit these items:

- GitHub repository URL;
- Vercel health URL ending in `/api/health`;
- `leetsync-extension.zip`, if file uploads are accepted;
- short installation note: unzip, open `chrome://extensions`, enable Developer mode, and load the extracted folder.

Before submission, confirm:

- `npm run verify` passes;
- `/api/health` reports `configured: true`;
- `.env` is not committed;
- the GitHub client secret is not present in source, `dist`, or the ZIP;
- the live GitHub connection and one LeetCode synchronization succeed.
