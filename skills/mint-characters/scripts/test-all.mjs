#!/usr/bin/env node
// Discover every stage-owned suite, including future additions.
import {readdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const dir=dirname(fileURLToPath(import.meta.url));
const suites=readdirSync(dir).filter(f=>f.endsWith('selftest.mjs')).sort();
for(const file of suites) {
  console.log(`\n=== ${file} ===`);
  const result=spawnSync(process.execPath,[join(dir,file)],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
}
console.log(`\n${suites.length} stage suites passed; no model/network/media generation performed.`);
