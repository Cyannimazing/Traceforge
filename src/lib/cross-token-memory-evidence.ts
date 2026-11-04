import type {Evidence,InvestigationReport} from './investigation-types';
import {qualifyCrossTokenMemory,type MemoryEvent} from './cross-token-memory';

/** Historical labels deliberately never become current transfers, graph edges,
 * insider exposure or security warnings. Their separate cap is applied once by
 * the shared memory qualifier. Preserve event time rather than scan time. */
export function crossTokenMemoryEvidence(report:InvestigationReport):Evidence[]{
 const hits=qualifyCrossTokenMemory(report).hits,result=new Map<string,Evidence>();
 const key=(event:MemoryEvent)=>`${event.transaction.toLowerCase()}:${event.kind}:${event.logIndex??'native'}`;
 const emit=(event:MemoryEvent,description:string,contextToken:string)=>{
  const id=`memory-proof:${contextToken}:${key(event)}`;
  result.set(id,{id,kind:'label',timestamp:event.block.timestamp,transaction:event.transaction,token:contextToken,from:event.from,to:event.to,description:`${description} Canonical block ${event.block.number} (${event.block.hash}). Successful transaction initiator ${event.initiator}. Relationship evidence does not establish common ownership or trading intent.`,source:'Independent cross-token memory'});
 };
 for(const hit of hits){
  for(const event of hit.events)emit(event,`Prior-token relationship for ${hit.token}: ${event.kind==='native'?'native funding':'direct token transfer'} from ${event.from} to ${event.to}, ${event.amountRaw} raw units. Independently verified at ${hit.verifiedAt}.`,hit.token);
  for(const connection of hit.connections)for(const participant of connection.participants){
   const h=participant.holding;
   const height=BigInt(h.block.number),activityHeight=BigInt(participant.activity.block.number);
   const basis=height===activityHeight?'at the activity block':height+1n===activityHeight?'at the immediately preceding block, before the signed outgoing transfer':'at a later historical block';
   emit(participant.activity,`Voluntary prior-token activity for ${participant.address} in ${hit.token}. Historical holding ${basis}: ${h.balanceRaw} / ${h.totalSupplyRaw} raw supply units, decimals ${h.decimals}, at ${h.block.number} (${h.block.hash}). The wallet signed its own token activity and met the at-least 0.01% materiality threshold. Balance and total supply were read at the same stated block.`,hit.token);
  }
 }
 return [...result.values()];
}
