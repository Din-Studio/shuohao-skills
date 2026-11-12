#!/usr/bin/env node
// Automatic upstream discovery must not hide an unreadable directory entry.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {findProduction} from './novel-art.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const root=mkdtempSync(join(tmpdir(),'novel-art-upstream-'));
try {
  const stage=join(root,'art');mkdirSync(stage);
  const production=join(root,'production.json'),target=join(root,'actual.json');
  symlinkSync(target,production);
  assert.equal(findProduction(stage,1),production,'dangling entry must be found, not skipped');
  const file=join(stage,'input.json');
  writeFileSync(file,readFileSync(join(here,'../examples/雨棚留言-art.json')));
  const args=['validate',file];
  const result=spawnSync(process.execPath,[join(here,'novel-art.mjs'),...args],{encoding:'utf8'});
  assert.equal(result.status,1,result.stdout);assert.match(result.stderr,/ENOENT/);
  writeFileSync(target,'{}');
  assert.equal(findProduction(stage,1),production,'valid symlink remains supported');
  rmSync(production);assert.equal(findProduction(stage,1),null,'true absence remains distinct');
} finally {rmSync(root,{recursive:true,force:true});}
console.log('✓ novel-art automatic unreadable-upstream regression passed');
