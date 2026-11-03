import {createPoolLaunch} from '../src/lib/pool-launch';
import {createEvidenceClock,clockReferenceTime} from '../src/lib/evidence-clock';
async function main(){
 const clock=await createEvidenceClock()();
 const events:unknown[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  const url=new URL(String(input)),body=typeof init?.body==='string'?JSON.parse(init.body):undefined;
  const response=await fetch(input,init),data=await response.clone().json().catch(()=>({}));
  const event={host:url.hostname,path:url.pathname,method:body?.method||url.searchParams.get('action')||'metadata',status:response.status,retryAfter:response.headers.get('retry-after'),rpcCode:data?.error?.code,message:data?.error?.message||data?.message};
  events.push(event);console.log(JSON.stringify(event));return response;
 };
 const result=await createPoolLaunch({fetcher})('ethereum','0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2','0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852',{validationTime:clockReferenceTime(clock,Date.now())});
 console.log(JSON.stringify({status:result.status,progress:result.progress,reasons:result.reasons,proof:result.proof,events:events.length}));
}
void main();
