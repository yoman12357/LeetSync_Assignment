import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
for (const target of ['dist', 'coverage', 'tmp', 'leetsync-extension.zip']) {
  fs.rmSync(path.join(root, target), { recursive: true, force: true });
}
console.info('Removed generated project artifacts.');
