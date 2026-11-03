import {after,NextRequest,NextResponse} from 'next/server';
import {historyRunner} from '@/lib/history-server';
import {historyView} from '@/lib/history-runner';
import {historyMutationAllowed,parseHistoryRequest} from '@/lib/history-request';
export const runtime='nodejs';
export const maxDuration=300;
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:NextRequest){
 let input:ReturnType<typeof parseHistoryRequest>;try{input=parseHistoryRequest(request.nextUrl);}catch(error){return json({error:(error as Error).message},400);}
 try{const job=historyRunner().find(input.chain,input.token);return json({job:job?historyView(job):null});}
 catch{return json({error:'Saved history could not be read. No checkpoints were replaced.'},503);}
}
export async function POST(request:NextRequest){
 if(!historyMutationAllowed(request))return json({error:'Open TraceForge to change a historical scan.'},403);
 let input:ReturnType<typeof parseHistoryRequest>,action:string,expanded=false;
 try{input=parseHistoryRequest(request.nextUrl);const body=await request.json();action=body?.action;expanded=body?.expanded===true;if(!['start','pause','resume','apply'].includes(action))throw Error('Choose start, pause, resume or apply.');}
 catch(error){return json({error:error instanceof Error?error.message:'Invalid history request.'},400);}
 try{
  const runner=historyRunner(),existing=runner.find(input.chain,input.token);
  if(action==='apply'){
   if(!existing?.counts.complete)return json({error:'No complete verified pool window is ready to apply yet.'},409);
   // Only verified result evidence crosses the server boundary. Checkpoints stay
   // server-side. The browser merges into its latest report, including refreshed
   // holdings, rather than replacing it with an older server-cache snapshot.
   const history={...existing,pools:existing.pools.map(pool=>({...pool,checkpoint:null,result:pool.status==='complete'&&pool.result?{...pool.result as object,checkpoint:undefined}:null}))};
   return json({job:historyView(existing),history});
  }
  if(action!=='start'&&!existing)return json({error:'No saved historical scan exists for this token.'},404);
  const job=action==='start'?await runner.start(input.chain,input.token,expanded,request.signal):action==='pause'?runner.pause(existing!.id):runner.resume(existing!.id);
  if(action!=='pause')after(()=>runner.wait(job.id));
  return json({job:historyView(job)});
 }catch(error){
  const cooldown=error instanceof Error&&error.message.includes('cooldown');
  return json({error:cooldown?'The provider cooldown is still active. Resume after the displayed retry time.':'History work could not finish. Saved checkpoints are preserved. Retry or check the server provider configuration.'},cooldown?429:503);
 }
}
