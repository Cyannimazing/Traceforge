import {NextRequest,NextResponse} from 'next/server';
import {validateToken} from '@/lib/analysis';
import {historyMutationAllowed} from '@/lib/history-request';
import {solanaArchive} from '@/lib/solana-archive-server';
import {solanaArchiveConfigurationStatus} from '@/lib/solana-history-archive';
export const runtime='nodejs';
export const maxDuration=60;
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:NextRequest){
 const token=(request.nextUrl.searchParams.get('token')||'').trim(),error=validateToken('solana',token);
 if(error)return json({error},400);
 const unavailable=solanaArchiveConfigurationStatus(token,process.env.SOLANA_RPC_URL||'');
 if(unavailable)return json({progress:unavailable});
 try{return json({progress:solanaArchive().status(token)});}catch{return json({error:'Saved history is temporarily unavailable.'},503);}
}
export async function POST(request:NextRequest){
 if(!historyMutationAllowed(request))return json({error:'Open TraceForge to continue this investigation.'},403);
 const token=(request.nextUrl.searchParams.get('token')||'').trim(),error=validateToken('solana',token);
 if(error)return json({error},400);
 const unavailable=solanaArchiveConfigurationStatus(token,process.env.SOLANA_RPC_URL||'');
 if(unavailable)return json({progress:unavailable});
 try{return json({progress:await solanaArchive().advance(token,{pages:4,signal:AbortSignal.any([request.signal,AbortSignal.timeout(48_000)])})});}
 catch{return json({error:'This history batch could not finish. Saved pages are preserved; retry to resume.'},503);}
}
