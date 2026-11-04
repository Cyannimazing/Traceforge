import {notFound} from 'next/navigation';
import Workbench from '@/components/workbench';
import {tokenRouteTarget} from '@/lib/token-route';
import {createPageMetadata} from '@/lib/seo';

export async function generateMetadata({params}:{params:Promise<{chain:string;address:string}>}){
 const {chain,address}=await params;if(!tokenRouteTarget(chain,address))notFound();
 return createPageMetadata(`/token/${chain}/${encodeURIComponent(address)}`);
}

export default async function TokenReportPage({params}:{params:Promise<{chain:string;address:string}>}){
 const {chain,address}=await params;
 const target=tokenRouteTarget(chain,address);
 if(!target)notFound();
 return <Workbench initialTarget={target}/>;
}
