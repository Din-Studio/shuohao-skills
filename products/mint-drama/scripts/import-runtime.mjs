// Developer-only import of an explicitly selected, local runtime reference.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2] && resolve(process.argv[2]);
if (!source || !existsSync(join(source, 'src/canvas-cli-tool.ts'))) {
  throw new Error('Pass the app-agent directory of the approved local mint-agent checkout.');
}
const entries = [
  ['vendor/canvas-cli', 'vendor/canvas-cli'],
  ['contracts/vendor/app-web/canvas-protocol', 'contracts/vendor/app-web/canvas-protocol'],
  ['src/canvas-cli-tool.ts', 'runtime/canvas-cli-tool.ts'],
  ['src/workspace-file-guard.ts', 'runtime/workspace-file-guard.ts'],
  ['src/launch-config.ts', 'runtime/launch-config.ts'],
];
const revision = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['-C', source, 'status', '--porcelain', '--', ...entries.map(([path]) => path)], { encoding: 'utf8' });
if (dirty.trim()) throw new Error('Runtime source files must be committed before importing.');
const files = {};
function record(directory, relative = '') {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const name = join(relative, item.name);
    const full = join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error(`Runtime sources must not contain symlinks: ${name}`);
    if (item.isDirectory()) record(full, name);
    else files[name.replaceAll('\\', '/')] = createHash('sha256').update(readFileSync(full)).digest('hex');
  }
}
for (const [from, to] of entries) {
  const target = join(root, to);
  if (existsSync(target)) throw new Error(`Inspect and remove the previous snapshot before importing: ${to}`);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(source, from), target, { recursive: true });
}
for (const directory of ['runtime', 'vendor', 'contracts']) record(join(root, directory), directory);
writeFileSync(join(root, 'runtime-source.json'), JSON.stringify({ repository: 'mint-agent', revision, entries, files }, null, 2) + '\n');
console.log(`Imported ${Object.keys(files).length} runtime files at ${revision}`);
