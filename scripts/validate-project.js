import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const manifestPath = path.join(dist, 'manifest.json');
assert.ok(fs.existsSync(manifestPath), 'Run npm run build before validation.');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const referenced = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...Object.values(manifest.icons),
  ...manifest.content_scripts.flatMap((entry) => [...(entry.js || []), ...(entry.css || [])]),
];

for (const relativePath of new Set(referenced)) {
  assert.ok(fs.existsSync(path.join(dist, relativePath)), `Manifest references a missing file: ${relativePath}`);
}

const sourceFiles = listFiles(root).filter((file) => /\.(js|html|css|json|md)$/.test(file));
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(text), `Emoji found in ${path.relative(root, file)}`);
  assert.ok(!/\u00e2|\u00f0\u0178|\u00c3\u2014/.test(text), `Corrupted text found in ${path.relative(root, file)}`);
}

console.info(`Validated ${new Set(referenced).size} manifest assets and ${sourceFiles.length} project files.`);

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) return [];
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}
