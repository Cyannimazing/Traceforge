import type {Metadata} from 'next';
import Workbench from '@/components/workbench';
export const metadata:Metadata={title:'Discovery - TraceForge Engine'};
export default function DiscoveryPage(){return <Workbench initialView="discover"/>;}
