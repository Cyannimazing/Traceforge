import { NextRequest, NextResponse } from 'next/server';
import { investigationService } from '@/lib/investigation-server';
import { parseScanRequest } from '@/lib/scan-request';
import type { ScanEvent } from '@/lib/investigation-types';
export const runtime='nodejs';
export const maxDuration=120;

export async function GET(request: NextRequest) {
  const {chain,token,error,options}=parseScanRequest(request.nextUrl);
  if(error)return NextResponse.json({error},{status:400});
  const cancellation=new AbortController();
  const signal=AbortSignal.any([request.signal,cancellation.signal,AbortSignal.timeout(110_000)]);
  const encoder=new TextEncoder();
  let closed=false;
  const stream=new ReadableStream<Uint8Array>({
    async start(controller){
      const send=(event:ScanEvent)=>{if(!closed&&!signal.aborted)controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));};
      try{
        const report=await investigationService.scan(chain,token,{...options,signal,onEvent:send});
        send({type:'report',report});
      }catch{
        if(!signal.aborted)send({type:'error',message:'Unable to complete this scan. Provider capacity or availability may be limited. Please retry.'});
      }finally{
        if(!closed){closed=true;controller.close();}
      }
    },
    cancel(){closed=true;cancellation.abort();},
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'}});
}
