import type {Finding} from './investigation-types';

/** Coverage notes are never counted as detected risks. */
export function findingBreakdown(findings:Finding[]){
 const unique=new Map<string,Finding>();
 const priority={critical:0,warning:1,info:2};
 for(const finding of findings){const old=unique.get(finding.id);if(!old||priority[finding.level]<priority[old.level])unique.set(finding.id,finding);}
 const ordered=[...unique.values()].sort((a,b)=>priority[a.level]-priority[b.level]);
 const risks=ordered.filter(f=>f.level!=='info'),notes=ordered.filter(f=>f.level==='info');
 const controls=risks.filter(f=>f.id.startsWith('security:')),wallet=risks.filter(f=>!f.id.startsWith('security:'));
 const critical=risks.filter(f=>f.level==='critical').length,warning=risks.length-critical;
 const coverage=notes.filter(f=>f.id==='coverage').length,information=notes.length-coverage;
 const label=[[critical,'critical finding'],[warning,'warning'],[coverage,'coverage note'],[information,'information note']].filter(([n])=>Number(n)>0).map(([n,name])=>`${n} ${name}${n===1?'':'s'}`).join(' · ')||'No flagged findings';
 return {risks,notes,controls,wallet,label};
}
