import {createPageMetadata} from '@/lib/seo';
import Workbench from '@/components/workbench';
export const metadata=createPageMetadata('/methodology');
export default function MethodologyPage(){return <Workbench initialView="methodology"/>;}
