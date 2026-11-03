import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LaunchProofStore} from '../src/lib/launch-proof-store';
import type {CurveTimingProof} from '../src/lib/investigation-types';
const proof:CurveTimingProof={verified:true,scope:'selected-launchpad',protocol:'four-meme-v2',chain:'bsc',token:'0x'+'1'.repeat(40),manager:'0x5c952063c7fc8610ffdb798152d69f0b9550762b',firstPurchaseAt:'2026-11-03T13:41:48Z',firstPurchaseTransaction:'0x'+'2'.repeat(64),windowEndAt:'2026-11-03T13:42:48Z',creation:{transaction:'0x'+'3'.repeat(64),blockNumber:100,blockHash:'0x'+'4'.repeat(64)},through:{blockNumber:200,blockHash:'0x'+'5'.repeat(64),timestamp:'2026-11-03T13:43:00Z'},eligibleTradeIds:['fourmeme:'+'0x'+'2'.repeat(64)+':1'],verifiedAt:'2026-11-03T14:00:00Z',source:'BSC RPC Four.Meme curve receipts'};
test('launch anchors survive restart and report expiry without persisting wallet classifications',()=>{
 const dir=mkdtempSync(join(tmpdir(),'launch-proof-')),path=join(dir,'proofs.sqlite');
 try{const first=new LaunchProofStore(path);first.set(proof);first.close();const next=new LaunchProofStore(path);const saved=next.get('bsc',proof.token);assert.deepEqual(saved,proof);assert.equal(next.get('base',proof.token),null);next.delete('bsc',proof.token);assert.equal(next.get('bsc',proof.token),null);next.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
test('malformed, foreign-source and unverified anchors are never persisted',()=>{
 const dir=mkdtempSync(join(tmpdir(),'launch-proof-'));const store=new LaunchProofStore(join(dir,'proofs.sqlite'));
 try{for(const change of [{verified:false},{source:'Swarm'},{manager:'0x'+'6'.repeat(40)},{through:{...proof.through,blockNumber:99}},{windowEndAt:'2026-11-03T13:44:00Z'}]){store.set({...proof,...change} as CurveTimingProof);assert.equal(store.get('bsc',proof.token),null);}}finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
