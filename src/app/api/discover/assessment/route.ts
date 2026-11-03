import {NextResponse} from 'next/server';
import {validateToken,type Chain} from '@/lib/analysis';
import {independentInvestigationService} from '@/lib/investigation-server';
import {feedItem} from '@/lib/report-feed';
export const runtime='nodejs';
export async function GET(request:Request){
 const url=new URL(request.url),chain=url.searchParams.get('chain')||'',token=url.searchParams.get('token')||'';
 if(validateToken(chain,token))return NextResponse.json({error:'Invalid token.'},{status:400});
 const report=independentInvestigationService.cachedReport(chain as Chain,token);
 return NextResponse.json({item:report?feedItem(report):null,storedOnly:true},{headers:{'Cache-Control':'no-store'}});
}
