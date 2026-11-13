// Run every existing deterministic skill and repository self-test, without a model.
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const suites = [];
for (const skill of readdirSync(join(repository, 'skills'), { withFileTypes: true })) {
  if (!skill.isDirectory()) continue;
  const scripts = join(repository, 'skills', skill.name, 'scripts');
  for (const file of readdirSync(scripts)) if (file.endsWith('selftest.mjs')) suites.push(join(scripts, file));
}
for (const file of readdirSync(join(repository, 'scripts'))) if (file.endsWith('-selftest.mjs')) suites.push(join(repository, 'scripts', file));
const failed = [];
for (const suite of suites.sort()) {
  console.log(`\nTEST ${suite}`);
  const result = spawnSync(process.execPath, [suite], { cwd: repository, stdio: 'inherit', timeout: 120_000 });
  if (result.error || result.status !== 0) {
    failed.push(suite);
    if (result.error) console.error(result.error.message);
  }
}
console.log(JSON.stringify({ suites: suites.length, passed: suites.length - failed.length, failed }, null, 2));
process.exitCode = failed.length ? 1 : 0;
