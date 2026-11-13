// Developer packaging: the assembled product has no runtime dependency on the repository root.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const product = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(product, '../..');
const marker = join(product, '.pi/assembled.json');
const targets = ['skills', 'agents'].map(name => join(product, '.pi', name));
if (targets.some(existsSync) && !existsSync(marker)) throw new Error('Refusing to replace unmarked .pi skills/agents.');
// Only generated, marked resource trees are replaced; authored extensions are never touched.
for (const target of targets) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
}
const skillNames = readdirSync(join(repository, 'skills'), { withFileTypes: true })
  .filter(entry => entry.isDirectory() && entry.name.startsWith('mint-')).map(entry => entry.name).sort();
if (skillNames.length !== 8) throw new Error('Expected the eight canonical mint skills.');
for (const name of skillNames) cpSync(join(repository, 'skills', name), join(product, '.pi/skills', name), { recursive: true });
cpSync(join(product, 'canvas-skill'), join(product, '.pi/skills/scenemint-canvas'), { recursive: true });
for (const role of ['mint-video-prompt-writer', 'mint-video-prompt-reviewer']) {
  cpSync(join(repository, 'agents/pi', `${role}.md`), join(product, '.pi/agents', `${role}.md`));
}
const files = {};
function hashTree(root, prefix) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Packaged resources cannot be symlinks: ${entry.name}`);
    const key = `${prefix}/${entry.name}`, path = join(root, entry.name);
    if (entry.isDirectory()) hashTree(path, key);
    else files[key] = createHash('sha256').update(readFileSync(path)).digest('hex');
  }
}
for (const name of ['skills', 'agents']) hashTree(join(product, '.pi', name), name);
writeFileSync(marker, JSON.stringify({ skills: [...skillNames, 'scenemint-canvas'], files }, null, 2) + '\n');
console.log(`Assembled ${skillNames.length} creative skills, canvas guidance, and two roles.`);
