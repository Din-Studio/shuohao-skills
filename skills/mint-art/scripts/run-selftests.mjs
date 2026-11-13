#!/usr/bin/env node
// Run every local *selftest.mjs file. No sibling scripts, dependencies or network.
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const tests=readdirSync(here).filter(name=>/(?:^|-)selftest\.mjs$/.test(name)).sort();
console.log(`mint-art 全部阶段测试：Node ${process.version}；${tests.length} 个脚本`);
let failed=0;
for(const name of tests){
  console.log(`\n=== ${name} ===`);
  const result=spawnSync(process.execPath,[join(here,name)],{cwd:join(here,'..'),encoding:'utf8',maxBuffer:16*1024*1024});
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  if(result.error||result.status!==0){failed++;console.error(result.error??`${name}: exit ${result.status}`);}
}
console.log(`\n${tests.length-failed}/${tests.length} 个测试脚本通过；不代表语义、图片或联合制作审核通过。`);
if(failed)process.exitCode=1;
