#!/usr/bin/env node
// v3 read paths: absent stages differ from damaged or ambiguous entries.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,symlinkSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url)),ex=join(here,'../examples');
const read=p=>JSON.parse(readFileSync(join(ex,p),'utf8'));
const creation=read('creation/收书人-creation.json'),script=read('script/收书人-script.json'),production=read('production.json');
script.provenance.documents.forEach(d=>d.path=join(ex,'收书人-原剧本.txt'));
const root=mkdtempSync(join(tmpdir(),'creation-discovery-'));
const write=(p,d)=>writeFileSync(p,JSON.stringify(d));
let count=0;
try {
  for(const name of ['script','outline','art','characters']) {
    const project=join(root,name);mkdirSync(project);mkdirSync(join(project,'creation'));
    const file=join(project,'creation/input.json'),prod=join(project,'production.json');write(file,creation);write(prod,production);
    const run=(...extra)=>spawnSync(process.execPath,[join(here,'mint-creation.mjs'),'render',file,'--md',...extra],{encoding:'utf8',maxBuffer:4*1024*1024});
    let r=run();assert.equal(r.status,0,r.stderr);count++;
    const stage=join(project,name),actual=join(project,'actual-stage');symlinkSync(actual,stage);
    r=run();assert.equal(r.status,1);assert.match(r.stderr,/ENOENT/);count++;
    if(name==='script') {
      mkdirSync(actual);const batch=join(actual,'batch.json');write(batch,script);
      r=run();assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/script v4/);count++;
      write(join(actual,'another.json'),script);r=run();assert.equal(r.status,1);assert.match(r.stderr,/不唯一/);count++;
      r=run('--script',batch);assert.equal(r.status,0,r.stderr);count++;
      writeFileSync(batch,'{');r=run('--script',batch);assert.equal(r.status,1);count++;
      write(batch,script);rmSync(join(actual,'another.json'));
      if(process.getuid?.()!==0){chmodSync(batch,0);try{assert.equal(run().status,1);count++;}finally{chmodSync(batch,0o600);}}
      write(join(actual,'ignored.backup.json'),script);write(join(actual,'.hidden.json'),script);write(join(actual,'manifest.json'),{});write(join(actual,'batch.json.migration.json'),{});write(join(actual,'batch.v2-backup.json'),{});
      assert.equal(run().status,0);count++;
    }
  }
  console.log(`✓ ${count} creation v3 upstream discovery cases passed`);
}finally{rmSync(root,{recursive:true,force:true});}
