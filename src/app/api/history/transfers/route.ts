import {NextRequest,NextResponse} from 'next/server';
import {validateToken} from '@/lib/analysis';
import {historyMutationAllowed} from '@/lib/history-request';
import {evmTransferArchive} from '@/lib/evm-transfer-archive-server';
export const runtime='nodejs';export const maxDuration=60;
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
function input(request:NextRequest){
 const chain=request.nextUrl.searchParams.get('chain'),token=(request.nextUrl.searchParams.get('token')||'').trim().toLowerCase();
 if(chain!=='ethereum'&&chain!=='base')return {error:'Continuous ERC20 index pagination supports configured Ethereum and Base only. No compatible BNB Chain archive is configured.',status:501} as const;
 const error=validateToken(chain,token);return error?{error,status:400} as const:{chain,token} as const;
}
export async function GET(request:NextRequest){
 const value=input(request);if('error' in value)return json({supported:false,error:value.error},value.status);
 try{const archive=evmTransferArchive();if(!archive.configured(value.chain))return json({supported:false,error:'Configure an authorized Alchemy endpoint for this chain to continue its transfer index.'},501);return json({supported:true,progress:archive.status(value.chain,value.token)});}
 catch{return json({error:'Saved transfer history is temporarily unavailable.'},503);}
}
export async function POST(request:NextRequest){
 if(!historyMutationAllowed(request))return json({error:'Open TraceForge to continue this investigation.'},403);
 const value=input(request);if('error' in value)return json({supported:false,error:value.error},value.status);
 let update=false;try{const text=await request.text();if(text.length>256)throw Error();const action=text.trim()?JSON.parse(text).action:undefined;if(action!==undefined&&action!=='advance'&&action!=='update')throw Error();update=action==='update';}catch{return json({error:'Choose advance or update for the transfer archive.'},400);}
 try{const archive=evmTransferArchive();if(!archive.configured(value.chain))return json({supported:false,error:'Configure an authorized Alchemy endpoint for this chain to continue its transfer index.'},501);return json({supported:true,progress:await archive.advance(value.chain,value.token,{pages:4,update,signal:AbortSignal.any([request.signal,AbortSignal.timeout(48000)])})});}
 catch{return json({error:'The transfer-history batch stopped. Saved pages and cursors are preserved.'},503);}
}
