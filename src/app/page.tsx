import Workbench from "@/components/workbench";
import {createPageMetadata} from '@/lib/seo';
export const metadata=createPageMetadata('/');
export default function Home() {
  return <Workbench />;
}
