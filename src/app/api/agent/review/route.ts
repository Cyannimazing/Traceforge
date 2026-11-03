import {LLM_REVIEW_ENABLED} from '@/lib/features';
import {NextRequest,NextResponse} from 'next/server';
import {CHAINS,validateToken,type Chain} from '@/lib/analysis';
import {cryptoReviewer} from '@/lib/crypto-agent-server';
import {investigationService} from '@/lib/investigation-server';
import {createHash} from 'node:crypto';
import {agentReportIdentity} from '@/lib/agent-report-identity';
import {validAgentOrigin} from '@/lib/agent-request-origin';
export const runtime='nodejs';
export const maxDuration=30;
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:NextRequest){
 if(!LLM_REVIEW_ENABLED)return json({status:'disabled'},503);
 if(!validAgentOrigin(request.headers.get('origin'),request.headers.get('host'),request.nextUrl.protocol))return json({status:'unavailable'},403);
 if(!process.env.GEMINI_API_KEY?.trim())return json({status:'not_configured'});
 try{
  if(Number(request.headers.get('content-length'))>1024)return json({status:'unsupported'},413);
  const raw=await request.text();if(raw.length>1024)return json({status:'unsupported'},413);
  const input=JSON.parse(raw);
  if(!input||typeof input.chain!=='string'||!Object.hasOwn(CHAINS,input.chain)||typeof input.token!=='string'||validateToken(input.chain,input.token)||typeof input.capturedAt!=='string')return json({status:'unsupported'},400);
  const report=investigationService.cachedReport(input.chain as Chain,input.token);
  if(!report||report.investigation.coverage.fetchedAt!==input.capturedAt||typeof input.reportRevision!=='string'||createHash('sha256').update(agentReportIdentity(report)).digest('hex')!==input.reportRevision)return json({status:'stale'},409);
  return json(await cryptoReviewer.review(report));
 }catch{return json({status:'unavailable'},400);}
}
