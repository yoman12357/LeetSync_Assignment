import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'dist');
const oauthServerUrl = process.env.LEETSYNC_OAUTH_SERVER_URL || 'http://localhost:3000';

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

await Promise.all([
  bundle('src/background/service-worker.js', 'background.js', 'esm'),
  bundle('src/content/content.js', 'content.js', 'iife'),
  bundle('src/content/page-bridge.js', 'page-bridge.js', 'iife'),
  bundle('src/popup/popup.js', 'popup.js', 'iife'),
]);

copy('src/popup/popup.html', 'popup.html');
copy('src/popup/popup.css', 'popup.css');
copy('src/content/toast.css', 'toast.css');
copyDirectory('assets', 'assets');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const oauthPermission = `${new URL(oauthServerUrl).origin}/*`;
if (!manifest.host_permissions.includes(oauthPermission)) manifest.host_permissions.push(oauthPermission);
fs.writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.info(`Built extension in ${output}`);

function bundle(entry, outfile, format) {
  return build({
    absWorkingDir: root,
    entryPoints: [entry],
    outfile: path.join(output, outfile),
    bundle: true,
    format,
    platform: 'browser',
    target: ['chrome120'],
    define: {
      'globalThis.__LEETSYNC_OAUTH_SERVER_URL__': JSON.stringify(oauthServerUrl),
    },
    logLevel: 'silent',
  });
}

function copy(source, destination) {
  fs.copyFileSync(path.join(root, source), path.join(output, destination));
}

function copyDirectory(source, destination) {
  fs.cpSync(path.join(root, source), path.join(output, destination), { recursive: true });
}
