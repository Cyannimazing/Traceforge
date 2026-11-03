import {NextRequest,NextResponse} from 'next/server';
import {createNetworkResolver,NetworkResolutionError} from '@/lib/network-resolver';
export const runtime='nodejs';
export const maxDuration=15;
const resolveNetwork=createNetworkResolver({rpcUrls:{ethereum:process.env.ETHEREUM_RPC_URL,base:process.env.BASE_RPC_URL,bsc:process.env.BSC_RPC_URL}});
export async function GET(request:NextRequest){
 const token=request.nextUrl.searchParams.get('token')||'';
 if(token.length>160)return NextResponse.json({error:'Paste a token address, not a URL.'},{status:400});
 try{return NextResponse.json(await resolveNetwork(token,{signal:request.signal}),{headers:{'Cache-Control':'no-store'}});}
 catch(error){return NextResponse.json({error:error instanceof NetworkResolutionError?error.message:'Network lookup was canceled or unavailable.',...(error instanceof NetworkResolutionError?{candidates:error.candidates}:{})},{status:error instanceof NetworkResolutionError?error.status:503,headers:{'Cache-Control':'no-store'}});}
}
