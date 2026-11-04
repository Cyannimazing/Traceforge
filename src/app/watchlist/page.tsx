import {createPageMetadata} from '@/lib/seo';
import Workbench from '@/components/workbench';
export const metadata=createPageMetadata('/watchlist');
export default function WatchlistPage(){return <Workbench initialView="watchlist"/>;}
