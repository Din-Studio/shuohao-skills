// Verify the assembled artifact without access to canonical repository skill paths.
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.npm_execpath) throw new Error('Run through pnpm verify:package to use the pinned package manager.');
const pnpm = process.env.npm_execpath;
const jsEntry = /\.[cm]?js$/.test(pnpm);
const directory = mkdtempSync(join(tmpdir(), 'mint-package-'));
const runPnpm = (args, timeout) => execFileSync(jsEntry ? process.execPath : pnpm, jsEntry ? [pnpm, ...args] : args,
  { cwd: directory, stdio: 'inherit', timeout });
try {
  cpSync(root, directory, { recursive: true, filter: path => !['node_modules', '.git'].includes(basename(path)) });
  runPnpm(['install', '--frozen-lockfile', '--ignore-scripts'], 180_000);
  runPnpm(['typecheck'], 60_000);
  runPnpm(['test'], 120_000);
  console.log('Independent assembled-package verification passed.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
