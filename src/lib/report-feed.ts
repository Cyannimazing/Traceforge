import {sameToken,validateToken,type Chain} from './analysis';
import type {InvestigationReport} from './investigation-types';
import {getDisplayAssessment} from './verdict-summary';
import {trustRating} from './trust-rating';

export type FeedItem={chain:Chain;token:string;name:string;symbol:string;status:'critical'|'caution'|'insufficient'|'clear';title:string;reason:string;fetchedAt:string;source:string;score?:number|null;providerTimestamp?:string|null};
export const FEED_KEY='traceforge.report-feed.v5';
export const FEED_EVENT='traceforge:report-feed';

export function feedItem(report:InvestigationReport):FeedItem|null{
 if(report.fixture||report.providerAnalysis||validateToken(report.chain,report.token)||!Number.isFinite(Date.parse(report.fetchedAt)))return null;
 const assessment=getDisplayAssessment(report),level=assessment.status==='critical'?'critical':'warning';
 const finding=report.investigation.findings.find(item=>item.level===level);
 const check=report.checks.find(item=>item.status===level);
 return {chain:report.chain,token:report.token,name:report.name,symbol:report.symbol,status:assessment.status,title:assessment.title,
  reason:finding?`${finding.attribution==='provider-reported'?'Provider reports: ':finding.certainty==='inferred'?'Possible pattern: ':''}${finding.title}`:check?.title||assessment.summary,
  fetchedAt:report.fetchedAt,source:'Independent sources',score:trustRating(report).score,providerTimestamp:null};
}
export function parseFeed(raw:string):FeedItem[]{
 try{const value:unknown=JSON.parse(raw);if(!Array.isArray(value))return [];
  return value.filter((item):item is FeedItem=>!!item&&typeof item==='object'&&['chain','token','name','symbol','title','reason','fetchedAt','source','status'].every(key=>typeof item[key]==='string')&&!validateToken(item.chain,item.token)&&Number.isFinite(Date.parse(item.fetchedAt))&&['critical','caution','insufficient','clear'].includes(item.status)&&(item.score==null||(typeof item.score==='number'&&Number.isFinite(item.score)&&item.score>=0&&item.score<=100))&&(item.providerTimestamp==null||(typeof item.providerTimestamp==='string'&&Number.isFinite(Date.parse(item.providerTimestamp))))).slice(0,12);
 }catch{return [];}
}
export function mergeFeed(items:FeedItem[],next:FeedItem):FeedItem[]{
 const existing=items.find(item=>item.chain===next.chain&&sameToken(next.chain,item.token,next.token));
 if(existing&&Date.parse(existing.fetchedAt)>Date.parse(next.fetchedAt))return items;
 return [next,...items.filter(item=>item.chain!==next.chain||!sameToken(next.chain,item.token,next.token))].slice(0,12);
}
export function rememberReport(report:InvestigationReport){
 const next=feedItem(report);if(!next)return;
 try{const items=mergeFeed(parseFeed(localStorage.getItem(FEED_KEY)||'[]'),next);localStorage.setItem(FEED_KEY,JSON.stringify(items));window.dispatchEvent(new Event(FEED_EVENT));}catch{/* Storage failure must never interrupt a successful scan. */}
}
