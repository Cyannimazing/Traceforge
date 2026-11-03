import {notFound} from 'next/navigation';
import Workbench from '@/components/workbench';
import {tokenRouteTarget} from '@/lib/token-route';

export default async function TokenReportPage({params}:{params:Promise<{chain:string;address:string}>}){
 const {chain,address}=await params;
 const target=tokenRouteTarget(chain,address);
 if(!target)notFound();
 return <Workbench initialTarget={target}/>;
}
