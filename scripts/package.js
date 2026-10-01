import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const archive = path.join(root, 'leetsync-extension.zip');

await import('./build.js');
fs.rmSync(archive, { force: true });

if (process.platform === 'win32') {
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    '$ErrorActionPreference = "Stop"; Compress-Archive -Path (Join-Path $env:LEETSYNC_DIST "*") -DestinationPath $env:LEETSYNC_ARCHIVE -Force',
  ], {
    stdio: 'inherit',
    env: { ...process.env, LEETSYNC_DIST: dist, LEETSYNC_ARCHIVE: archive },
  });
} else {
  execFileSync('zip', ['-r', archive, '.'], { cwd: dist, stdio: 'inherit' });
}

if (!fs.existsSync(archive)) throw new Error('Extension archive was not created.');
console.info(`Created ${archive}`);
