import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifiedEvmEoas} from '../src/lib/qualified-evm-eoa';
import type {WalletActivitySnapshot} from '../src/lib/wallet-activity';
import type {Report} from '../src/lib/analysis';
const at='2026-11-04T09:00:00Z',address='0x'+'1'.repeat(40),ref='0x20:0x'+'a'.repeat(64);
function snapshot():WalletActivitySnapshot{return {source:'EVM RPC wallet activity',observedAt:at,blockRef:ref,blockTimestamp:at,finality:'finalized',truncated:false,wallets:[{address,count:19,exact:true,fresh:null,basis:'evm-account-nonce',reason:'',accountKind:'delegated-eoa',codeProof:{code:'0xef0100'+'2'.repeat(40),blockRef:ref}}]};}
const source=():Report['sources']=>[{name:'EVM RPC wallet activity',status:'available',fetchedAt:at,detail:''}];
test('canonical EOA qualification requires current bound source, complete bytecode and unambiguous account proof',()=>{
 assert.equal(qualifiedEvmEoas(snapshot(),source(),at).get(address)?.kind,'delegated-eoa');
 for(const mode of ['no-source','unavailable','wrong-stamp','bad-ref','duplicate','not-exact','negative-nonce','zero-nonce','old-anchor','zero-delegate','kind-code-mismatch','failed-snapshot'] as const){const s=snapshot(),sources=source(),w=s.wallets[0];if(mode==='no-source')sources.length=0;if(mode==='unavailable')sources[0].status='unavailable';if(mode==='wrong-stamp')sources[0].fetchedAt='2026-11-04T09:00:01Z';if(mode==='bad-ref')s.blockRef=w.codeProof!.blockRef='not-a-block';if(mode==='duplicate')s.wallets.push({...w});if(mode==='not-exact')w.exact=false;if(mode==='negative-nonce')w.count=-1;if(mode==='zero-nonce'){w.count=0;w.accountKind='eoa';w.codeProof!.code='0x';}if(mode==='old-anchor')s.blockTimestamp='2026-11-04T07:59:59Z';if(mode==='zero-delegate')w.codeProof!.code='0xef0100'+'0'.repeat(40);if(mode==='kind-code-mismatch')w.accountKind='eoa';if(mode==='failed-snapshot')s.failure='unavailable';assert.equal(qualifiedEvmEoas(s,sources,at).size,0,mode);}
});
