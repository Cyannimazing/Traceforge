import type {Metadata} from 'next';
import Workbench from '@/components/workbench';
export const metadata:Metadata={title:'Watchlist - TraceForge Engine'};
export default function WatchlistPage(){return <Workbench initialView="watchlist"/>;}
