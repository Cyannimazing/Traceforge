'use client';

import type {ReactNode} from 'react';
import {ArrowLeft,ArrowUpRight,Bookmark,Copy,Download,ExternalLink,Link2,RefreshCw,Search} from 'lucide-react';
import {CHAINS,formatMoney} from '@/lib/analysis';
import {holderScope} from '@/lib/holder-scope';
import type {InvestigationReport} from '@/lib/investigation-types';
import './report-header.css';

type Props={report:InvestigationReport;refreshing:string;watched:boolean;editToken:boolean;search:ReactNode;onHome:()=>void;onChangeToken:()=>void;onWatch:()=>void;onCopyAddress:()=>void;onCopyLink:()=>void;onDownload:()=>void;onRefresh:()=>void};

export default function ReportHeader({report,refreshing,watched,editToken,search,onHome,onChangeToken,onWatch,onCopyAddress,onCopyLink,onDownload,onRefresh}:Props){
 const scope=holderScope(report),captured=new Date(report.fetchedAt),validDate=Number.isFinite(captured.getTime());
 const value=(amount:number|null|undefined)=>formatMoney(amount).replace(/^-$|^—$/,'Unavailable');
 const price=report.market?.priceUsd==null?null:Number(report.market.priceUsd);
 const metrics=[
  {name:'Price',value:value(price!=null&&Number.isFinite(price)?price:null)},
  {name:'Liquidity',value:value(report.market?.liquidity?.usd)},
  {name:'24h volume',value:value(report.market?.volume?.h24)},
  {name:'Market cap',value:value(report.market?.marketCap)},
  {name:'Holders analyzed',value:report.holders.length?scope.holders.length.toLocaleString('en-US'):'Unavailable',detail:scope.infrastructure.length+' infrastructure accounts excluded'},
  {name:'Addresses traced',value:report.investigation.wallets.length.toLocaleString('en-US'),detail:'Distinct addresses across the retrieved evidence; not a count of people'},
 ];
 return <section className="report-header" aria-label="Token investigation summary">
  <div className="rh-toolbar"><button type="button" onClick={onHome}><ArrowLeft size={15}/>Back to search</button><span className="rh-captured">{report.fixture?<span className="rh-example">Illustrative example - not live</span>:<><i aria-hidden="true"/>{refreshing?'Refreshing '+refreshing:<><span>Snapshot</span><time dateTime={validDate?report.fetchedAt:undefined} title={validDate?captured.toLocaleString():undefined}>{validDate?captured.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Time unavailable'}</time></>}</>}</span></div>
  <div className="rh-main"><div className="rh-identity"><span className="rh-token-mark" aria-hidden="true">{report.symbol.slice(0,3)}</span><div className="rh-token-copy"><div className="rh-name"><h1 tabIndex={-1}>{report.name}</h1><span>{report.symbol}</span></div><div className="rh-address"><span className="rh-network">{CHAINS[report.chain].name}</span><code className="rh-contract">{report.token}</code><button type="button" aria-label="Copy token address" onClick={onCopyAddress}><Copy size={14}/></button>{!report.fixture&&<a aria-label="Open token explorer" href={CHAINS[report.chain].explorer+'/token/'+report.token} target="_blank" rel="noreferrer"><ExternalLink size={14}/></a>}</div></div></div>
   <div className="rh-actions"><button type="button" className="rh-change" onClick={onChangeToken} aria-expanded={editToken}><Search size={15}/>{editToken?'Close search':'Change token'}</button><button type="button" aria-label={watched?'Remove from watchlist':'Add to watchlist'} aria-pressed={watched} title={report.fixture?'Example tokens cannot be saved':watched?'Remove from watchlist':'Add to watchlist'} disabled={!!report.fixture} onClick={onWatch}><Bookmark size={16}/></button><button type="button" aria-label="Copy report link" title="Copy report link" disabled={!!report.fixture} onClick={onCopyLink}><Link2 size={16}/></button><button type="button" aria-label="Export investigation JSON" title="Export investigation JSON" onClick={onDownload}><Download size={16}/></button><button type="button" className="rh-refresh" aria-label="Refresh investigation" disabled={!!report.fixture} onClick={onRefresh}><RefreshCw size={15}/><span>Refresh scan</span><ArrowUpRight size={14}/></button></div>
  </div>
  {editToken&&<div className="rh-search">{search}</div>}
  <dl className="rh-metrics">{metrics.map(metric=><div key={metric.name} title={metric.detail}><dt>{metric.name}</dt><dd>{metric.value}</dd></div>)}</dl>
 </section>;
}
