import {createPageMetadata} from '@/lib/seo';
import Workbench from '@/components/workbench';
export const metadata=createPageMetadata('/discover');
export default function DiscoveryPage(){return <Workbench initialView="discover"/>;}
