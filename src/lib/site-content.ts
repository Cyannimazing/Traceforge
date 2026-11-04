import {CHAINS,sameToken} from './analysis';
import {parseTokenPath,tokenReportPath} from './token-route';
export const SITE_NAME='TraceForge Engine';
export const DEFAULT_SITE_ORIGIN='https://www.traceengine.tech';
export type PageSeo={path:string;title:string;description:string;indexable:boolean};
const pages:Record<string,PageSeo>={
 '/':{path:'/',title:'TraceForge Engine | Crypto Token & Holder Analysis',description:'Analyze crypto token holders, wallet connections, creator and sniper flags, and contract risks on Solana, Ethereum, Base, BNB Chain and Robinhood Chain.',indexable:true},
 '/discover':{path:'/discover',title:'Latest Crypto Tokens & Pool Listings | TraceForge Engine',description:'Discover recent token profiles and DEX pool listings on Solana, Ethereum, Base, BNB Chain and Robinhood Chain. Open a token holder and contract investigation.',indexable:true},
 '/methodology':{path:'/methodology',title:'Token Analysis, Wallet Flags & Risk Checks | TraceForge Engine',description:'Understand token holder analysis, wallet tracing, Creator, Owner, Dev and Sniper flags, contract checks, and how TraceForge calculates its token assessments.',indexable:true},
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
