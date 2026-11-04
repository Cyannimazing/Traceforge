'use client';

import {useId,useState,type ReactNode} from 'react';
import {ArrowLeft,ArrowUpRight,Bookmark,Copy,Download,ExternalLink,Globe,Link2,MessageCircle,RefreshCw,Search,Send} from 'lucide-react';
import {CHAINS,formatMoney} from '@/lib/analysis';
import {holderScope} from '@/lib/holder-scope';
import {holderCountSummary} from '@/lib/holder-count-summary';
import {tokenProjectLinks,type ProjectLink} from '@/lib/token-project-links';
import type {InvestigationReport} from '@/lib/investigation-types';
import './report-header.css';

type Props={report:InvestigationReport;refreshing:string;watched:boolean;editToken:boolean;search:ReactNode;onHome:()=>void;onChangeToken:()=>void;onWatch:()=>void;onCopyAddress:()=>void;onCopyLink:()=>void;onDownload:()=>void;onRefresh:()=>void};

function TokenMark({url,symbol}:{url?:string;symbol:string}){
 const [failed,setFailed]=useState(false);
 return <span className="rh-token-mark" aria-hidden="true">{url&&!failed?<img src={url} alt="" width={48} height={48} decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:symbol.slice(0,3)}</span>;
}
function ProjectIcon({kind}:{kind:ProjectLink['kind']}){
 if(kind==='x')return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.5 5.4 22H2.2l7.3-8.4L1.8 2h6.5l4.5 6.9L18.9 2Zm-1.1 18h1.7L7.3 3.9H5.5L17.8 20Z"/></svg>;
 const Icon=kind==='website'?Globe:kind==='telegram'?Send:kind==='discord'?MessageCircle:kind==='dex'?ExternalLink:Link2;
 return <Icon size={14} aria-hidden="true"/>;
}

export default function ReportHeader({report,refreshing,watched,editToken,search,onHome,onChangeToken,onWatch,onCopyAddress,onCopyLink,onDownload,onRefresh}:Props){
 const project=tokenProjectLinks(report),projectTip=useId();
 const scope=holderScope(report),captured=new Date(report.fetchedAt),validDate=Number.isFinite(captured.getTime());
 const counts=holderCountSummary(report);
 const value=(amount:number|null|undefined)=>formatMoney(amount).replace(/^-$|^—$/,'Unavailable');
 const price=report.market?.priceUsd==null?null:Number(report.market.priceUsd);
 const metrics=[
  {name:'Price',value:value(price!=null&&Number.isFinite(price)?price:null)},
  {name:'Liquidity',value:value(report.market?.liquidity?.usd)},
  {name:'24h volume',value:value(report.market?.volume?.h24)},
  {name:'Market cap',value:value(report.market?.marketCap)},
  ...(counts.total!==null?[{name:'Holders',value:counts.total.toLocaleString('en-US'),note:counts.allRecordedChecked?'All recorded balances checked':counts.derived?'Transfer-derived accounts':'Reported accounts',detail:counts.allRecordedChecked?'Every recorded positive holder balance was independently checked at the stated block and reconciled to total supply.':counts.derived?'Recorded positive accounts reconstructed from token Transfer history. Only the analyzed subset is independently balance-checked.':'Source-reported total holder accounts.'}]:[]),
  {name:'Holders analyzed',value:report.holders.length?scope.holders.length.toLocaleString('en-US'):'Unavailable',note:scope.infrastructure.length?scope.infrastructure.length+' platform / burn accounts set aside':undefined,detail:scope.infrastructure.length+' infrastructure accounts excluded'},
  ...(counts.total===null?[{name:'Addresses traced',value:report.investigation.wallets.length.toLocaleString('en-US'),detail:'Distinct addresses across the retrieved evidence; not a count of people'}]:[]),
 ];
 return <section className="report-header" aria-label="Token investigation summary">
  <div className="rh-toolbar"><button type="button" onClick={onHome}><ArrowLeft size={15}/>Back to search</button><span className="rh-captured">{report.fixture?<span className="rh-example">Illustrative example - not live</span>:<><i aria-hidden="true"/>{refreshing?'Refreshing '+refreshing:<><span>Snapshot</span><time dateTime={validDate?report.fetchedAt:undefined} title={validDate?captured.toLocaleString():undefined}>{validDate?captured.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Time unavailable'}</time></>}</>}</span></div>
  <div className="rh-main"><div className="rh-identity"><TokenMark key={project.logoUrl||report.token} url={project.logoUrl} symbol={report.symbol}/><div className="rh-token-copy"><div className="rh-name"><h1 tabIndex={-1}>{report.name}</h1><span>{report.symbol}</span></div><div className="rh-address"><span className="rh-network">{CHAINS[report.chain].name}</span><code className="rh-contract">{report.token}</code><button type="button" aria-label="Copy token address" onClick={onCopyAddress}><Copy size={14}/></button>{!report.fixture&&<a aria-label="Open token explorer" href={CHAINS[report.chain].explorer+'/token/'+report.token} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/></a>}</div>{project.links.length>0&&<nav className="rh-project-links" aria-label="Token project links">{project.links.map((link,index)=><a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" aria-describedby={projectTip+'-'+index}><ProjectIcon kind={link.kind}/><span>{link.label}</span><span className="rh-project-tip" id={projectTip+'-'+index} role="tooltip">{link.source}{link.kind!=='dex'?' - project supplied':''}</span></a>)}</nav>}</div></div>
   <div className="rh-actions"><button type="button" className="rh-change" onClick={onChangeToken} aria-expanded={editToken}><Search size={15}/>{editToken?'Close search':'Change token'}</button><button type="button" aria-label={watched?'Remove from watchlist':'Add to watchlist'} aria-pressed={watched} title={report.fixture?'Example tokens cannot be saved':watched?'Remove from watchlist':'Add to watchlist'} disabled={!!report.fixture} onClick={onWatch}><Bookmark size={16}/></button><button type="button" aria-label="Copy report link" title="Copy report link" disabled={!!report.fixture} onClick={onCopyLink}><Link2 size={16}/></button><button type="button" aria-label="Export investigation JSON" title="Export investigation JSON" onClick={onDownload}><Download size={16}/></button><button type="button" className="rh-refresh" aria-label="Refresh investigation" disabled={!!report.fixture} onClick={onRefresh}><RefreshCw size={15}/><span>Refresh scan</span><ArrowUpRight size={14}/></button></div>
  </div>
  {editToken&&<div className="rh-search">{search}</div>}
  <dl className="rh-metrics">{metrics.map(metric=><div key={metric.name} title={metric.detail}><dt>{metric.name}</dt><dd>{metric.value}</dd>{'note' in metric&&metric.note&&<small className="rh-metric-note">{metric.note}</small>}</div>)}</dl>
 </section>;
}
