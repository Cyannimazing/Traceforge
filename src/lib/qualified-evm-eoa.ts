import type {Report} from './analysis';
import type {WalletActivitySnapshot} from './wallet-activity';

export type QualifiedEoaCode={kind:'eoa'|'delegated-eoa';code:string;blockRef:string;observedAt:string};
/** A provider's contract flag does not distinguish EIP-7702 EOAs. Only a
 * fresh independently read code/nonce pair at the rechecked finalized anchor
 * can qualify that distinction. Missing or contradictory proof changes nothing. */
export function qualifiedEvmEoas(activity:WalletActivitySnapshot|undefined,sources:Report['sources'],capturedAt:string):Map<string,QualifiedEoaCode>{
 const qualified=new Map<string,QualifiedEoaCode>(),captured=Date.parse(capturedAt);
 const fresh=(at:string|undefined)=>{const n=Date.parse(at||'');return Number.isFinite(captured)&&Number.isFinite(n)&&n>=captured-600000&&n<=captured+120000;};
 if(!activity||activity.source!=='EVM RPC wallet activity'||activity.failure||activity.finality!=='finalized'||!fresh(activity.observedAt)||!/^0x[0-9a-f]+:0x[0-9a-f]{64}$/i.test(activity.blockRef||'')||!Number.isFinite(Date.parse(activity.blockTimestamp||''))||Date.parse(activity.blockTimestamp!)<captured-3600000||Date.parse(activity.blockTimestamp!)>captured+120000||!sources.some(s=>s.name===activity.source&&s.status==='available'&&s.fetchedAt===activity.observedAt&&fresh(s.fetchedAt)))return qualified;
 const duplicates=new Set<string>(),seen=new Set<string>();
 for(const row of activity.wallets){const address=row.address.toLowerCase();if(seen.has(address))duplicates.add(address);seen.add(address);}
 for(const row of activity.wallets){const address=row.address.toLowerCase(),code=row.codeProof?.code,kind=row.accountKind;
  // Finalized code may predate the holder's safe snapshot. Empty code with a
  // zero nonce can be an account not yet deployed at that earlier block. A
  // positive EOA nonce prevents later ordinary contract creation (EIP-684);
  // accepted EIP-7702 authorizations also increment the authority nonce.
  if(duplicates.has(address)||!/^0x[0-9a-f]{40}$/i.test(address)||/^0x0{40}$/.test(address)||row.exact!==true||row.basis!=='evm-account-nonce'||!Number.isSafeInteger(row.count)||row.count!<=0||!fresh(row.observedAt||activity.observedAt)||row.codeProof?.blockRef!==activity.blockRef)continue;
  const valid=kind==='eoa'&&code==='0x'||kind==='delegated-eoa'&&typeof code==='string'&&/^0xef0100[0-9a-f]{40}$/i.test(code)&&!/^0xef01000{40}$/i.test(code);
  if(valid)qualified.set(address,{kind:kind as QualifiedEoaCode['kind'],code:code!,blockRef:activity.blockRef!,observedAt:row.observedAt||activity.observedAt});
 }
 return qualified;
}
