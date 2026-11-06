#!/usr/bin/env node
// Real application path: absent stages differ from unreadable directory entries.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url)),ex=join(here,'../examples');
const read=p=>JSON.parse(readFileSync(join(ex,p),'utf8'));
const creation=read('creation/收书人-creation.json'),script=read('script/收书人-script.json'),production=read('production.json');
const root=mkdtempSync(join(tmpdir(),'creation-discovery-'));
const write=(p,d)=>writeFileSync(p,JSON.stringify(d));
let count=0;
try {
  for(const name of ['script','outline','art','characters']) {
    const project=join(root,name);mkdirSync(project);mkdirSync(join(project,'creation'));
    const file=join(project,'creation/input.json'),prod=join(project,'production.json');write(file,creation);write(prod,production);
    const apply=()=>spawnSync(process.execPath,[join(here,'novel-creation.mjs'),'apply-profile',file,'--production',prod,'--confirm'],{encoding:'utf8',maxBuffer:4*1024*1024});
    let r=apply();assert.equal(r.status,0,r.stderr);count++;
    const stage=join(project,name),actual=join(project,'actual-stage');symlinkSync(actual,stage);
    r=apply();assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).applied,true);assert.match(r.stderr,/ENOENT/);count++;
    if(name==='script') {
      mkdirSync(actual);write(join(actual,'batch.json'),script);
      r=apply();assert.equal(r.status,0,r.stderr);assert.match(r.stderr,/script-contract/);count++;
      write(join(actual,'another.json'),script);r=apply();assert.equal(r.status,1);assert.match(r.stderr,/不唯一/);count++;
    }
  }
} finally {rmSync(root,{recursive:true,force:true});}
console.log(`✓ ${count} creation real application discovery cases passed`);
