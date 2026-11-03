"use client";
import {decisionLabels,presentationText} from '@/lib/assessment-presentation';
import {LLM_REVIEW_ENABLED} from '@/lib/features';
import {useEffect,useState} from 'react';
import {ArrowUpRight,BrainCircuit} from 'lucide-react';
import type {ReviewResult} from '@/lib/crypto-agent';
import type {InvestigationReport} from '@/lib/investigation-types';
import type {Selection} from './investigation-panels';
import {agentReportIdentity,agentEvidenceIdentity} from '@/lib/agent-report-identity';
import './crypto-agent-panel.css';

const messages={
 not_configured:'Connect Gemini to add an evidence-grounded crypto analyst to your reports.',
 stale:'The saved scan has changed or expired. Run a fresh scan for an analyst review.',
 unavailable:'The analyst could not complete this review. Your independent scan is still available.',
 rate_limited:'The analyst request limit was reached. Your independent scan is still available.',
 unsupported:'This report cannot be reviewed. The analyst uses independent live scans only.',
};
export function useCryptoReview(report:InvestigationReport){
 const [state,setState]=useState<{key:string;result:ReviewResult|null}>({key:'',result:null});
 const key=agentEvidenceIdentity(report);
 const result=state.key===key?state.result:null;
 const excluded=!LLM_REVIEW_ENABLED||!!report.fixture||!!report.providerAnalysis;
 useEffect(()=>{
  if(excluded)return;
  const controller=new AbortController();let active=true,started=false;
  const run=async()=>{
   if(document.hidden||started)return;started=true;
   try{
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(agentReportIdentity(report)));
    if(!active)return;
    const reportRevision=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    const response=await fetch('/api/agent/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chain:report.chain,token:report.token,capturedAt:report.investigation.coverage.fetchedAt,reportRevision}),signal:controller.signal});
    const value=await response.json() as ReviewResult;
    if(active)setState({key,result:value.status==='ready'&&value.capturedAt!==report.investigation.coverage.fetchedAt?{status:'stale'}:value});
   }catch{if(active)setState({key,result:{status:'unavailable'}});}
  };
  void run();document.addEventListener('visibilitychange',run);
  return()=>{active=false;controller.abort();document.removeEventListener('visibilitychange',run);};
 },[key,excluded,report.chain,report.token,report.investigation.coverage.fetchedAt]);
 return result;
}
export default function CryptoAgentPanel({report,onSelect,result}:{report:InvestigationReport;onSelect:(value:Selection)=>void;result:ReviewResult|null}){
 const excluded=!LLM_REVIEW_ENABLED||!!report.fixture||!!report.providerAnalysis;
 if(excluded)return null;
 return <section className="crypto-agent" aria-label="Crypto analyst">
  <header><span><BrainCircuit size={16} aria-hidden="true"/> Assessment reasoning</span><small>GEMINI</small></header>
  {!result?<p className="agent-state" role="status">Reviewing the scan evidence...</p>:result.status!=='ready'?<>
   <p className="agent-state" role="status">{messages[result.status]||messages.unavailable}</p>
   {result.status==='not_configured'&&<details><summary>Connect the analyst</summary><p>Add <code>GEMINI_API_KEY</code> to your server&apos;s <code>.env.local</code>, then restart the app. Keep the key private.</p><a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get a Gemini API key <ArrowUpRight size={13}/></a><p>Only this token&apos;s public evidence summary is sent. Google may use free-tier content to improve its products.</p></details>}
  </>:<>
   <p className="agent-state">Review snapshot: {new Date(result.capturedAt).toLocaleString()}.{report.fetchedAt!==result.capturedAt?' Market data has refreshed since this review. Its market observations describe the older snapshot.':''}</p>
   {([['Supporting evidence',result.review.supporting],['Risks and unknowns',result.review.risks],['What to watch',result.review.watch]] as const).map(([label,points])=>points.length>0&&<div className="agent-points" key={label}><h3>{label}</h3><ul>{points.map((point,i)=><li key={i}><p>{presentationText(point.text)}</p><div className="agent-citations">{point.citations.map(id=>{const reference=result.references[id];return reference&&(reference.evidenceIds.length?<button key={id} type="button" onClick={()=>onSelect({kind:'group',id:`agent:${id}`,evidenceIds:reference.evidenceIds})}>{reference.label}<ArrowUpRight size={11}/></button>:<details key={id}><summary>{reference.label}</summary><p>{reference.detail}</p></details>);})}</div></li>)}</ul></div>)}
   <details><summary>Review scope and method</summary><p>Gemini assigns weights to {decisionLabels.avoid}, {decisionLabels.caution} and {decisionLabels.ok} from this scan&apos;s evidence. These are uncalibrated AI decision weights, not measured accuracy or a probability of safety. Weights are withheld when evidence rules override the assessment or the evidence is insufficient.</p>{result.review.overrides.map(rule=><p key={rule}>{presentationText(rule)}</p>)}<p>{result.model} · {result.version}</p><p>Evidence: {new Date(result.capturedAt).toLocaleString()}<br/>Reviewed: {new Date(result.reviewedAt).toLocaleString()}</p></details>
  </>}
 </section>;
}
