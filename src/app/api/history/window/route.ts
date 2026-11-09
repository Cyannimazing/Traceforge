import {NextRequest,NextResponse} from 'next/server';
import {validateToken} from '@/lib/analysis';
import {historyMutationAllowed} from '@/lib/history-request';
import {transferWindowStore} from '@/lib/transfer-window-server';
import type {WindowChain} from '@/lib/transfer-window-types';
export const runtime='nodejs';export const maxDuration=60;
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
const CHAINS=['ethereum','base','robinhood','bsc'];
function input(request:NextRequest){
 const chain=request.nextUrl.searchParams.get('chain'),token=(request.nextUrl.searchParams.get('token')||'').trim().toLowerCase();
 if(!chain||!CHAINS.includes(chain))return {error:'The transfer window supports Ethereum, Base, Robinhood Chain and BNB Chain.',status:400} as const;
 const error=validateToken(chain as WindowChain,token);return error?{error,status:400} as const:{chain:chain as WindowChain,token} as const;
}
/** Window progress only: summary counts, never transfer rows or candidate lists. */
export async function GET(request:NextRequest){
 const value=input(request);if('error' in value)return json({error:value.error},value.status);
 try{return json({window:transferWindowStore().status(value.chain,value.token).summary});}catch{return json({error:'Transfer window progress is temporarily unavailable.'},503);}
}
export async function POST(request:NextRequest){
 if(!historyMutationAllowed(request))return json({error:'Open TraceForge to continue this investigation.'},403);
 const value=input(request);if('error' in value)return json({error:value.error},value.status);
 try{const result=await transferWindowStore().advance(value.chain,value.token,{pages:30,signal:request.signal,deadlineMs:45000});return json({window:result.summary});}
 catch{return json({error:'The transfer window batch stopped. Saved progress is preserved.'},503);}
}
