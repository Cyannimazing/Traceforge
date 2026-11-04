import {CHAINS,sameToken} from './analysis';
import {parseTokenPath,tokenReportPath} from './token-route';
export const SITE_NAME='TraceForge Engine';
export const DEFAULT_SITE_ORIGIN='https://www.traceengine.tech';
export type PageSeo={path:string;title:string;description:string;indexable:boolean};
const pages:Record<string,PageSeo>={
 '/':{path:'/',title:'TraceForge Engine | Crypto Token Analysis & Wallet Tracing',description:'Investigate crypto tokens with holder maps, wallet connections, contract checks and public blockchain evidence across five networks.',indexable:true},
 '/discover':{path:'/discover',title:'Discover Crypto Tokens | TraceForge Engine',description:'Explore recent token profiles and pool listings across Ethereum, Base, BNB Chain, Solana and Robinhood Chain. Select a token to investigate its public evidence.',indexable:true},
 '/methodology':{path:'/methodology',title:'Token Analysis Methodology | TraceForge Engine',description:'Learn how TraceForge checks holders, creator and sniper flags, wallet connections and contract controls, and how its evidence-based token assessments are calculated.',indexable:true},
 '/watchlist':{path:'/watchlist',title:'Your Token Watchlist | TraceForge Engine',description:'Keep track of token investigations saved on this device and reopen their public evidence reports.',indexable:false},
};
export const INDEXABLE_PATHS=['/','/discover','/methodology'] as const;
export function pageSeoForPath(pathname:string,report?:{chain:string;token:string;symbol:string}):PageSeo{
 const path=pathname.split(/[?#]/)[0].replace(/\/$/,'')||'/';
 if(pages[path])return {...pages[path]};
 const target=parseTokenPath(path);
 if(target){
  const symbol=report&&target.chain===report.chain&&sameToken(target.chain,target.token,report.token)?report.symbol.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,40):'';
  return {path:tokenReportPath(target.chain,target.token)!,title:`${symbol||CHAINS[target.chain].name} Token Report | ${SITE_NAME}`,description:`Investigate ${target.token} on ${CHAINS[target.chain].name}. Inspect token holders, wallet flags, contract controls and source-linked evidence.`,indexable:false};
 }
 return {path,title:`Page Not Found | ${SITE_NAME}`,description:'This TraceForge page could not be found.',indexable:false};
}
export function robotsContent(indexable:boolean){return `${indexable?'index':'noindex'}, follow, max-image-preview:large`;}
