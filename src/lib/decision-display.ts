import type {DecisionKey} from './decision-model';

/** Round the presentation only. Largest remainders keep the three one-decimal
 * labels at100%; model weights and arithmetic retain their original precision. */
export function decisionDisplayPercentages(weights:Record<DecisionKey,number>):Record<DecisionKey,number>{
 const keys=['avoid','caution','ok'] as const,values=keys.map(key=>weights[key]);
 const total=values.reduce((sum,value)=>sum+value,0);
 if(!values.every(value=>Number.isFinite(value)&&value>=0&&value<=1)||!Number.isFinite(total)||total<=0||Math.abs(total-1)>.00101)throw new Error('Invalid decision weights');
 const shares=values.map(value=>value/total*1000),ticks=shares.map(value=>Math.floor(value));
 const order=keys.map((key,index)=>({key,index,remainder:shares[index]-ticks[index]})).sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
 const remaining=1000-ticks.reduce((sum,value)=>sum+value,0);
 for(let index=0;index<remaining;index++)ticks[order[index].index]++;
 return {avoid:ticks[0]/10,caution:ticks[1]/10,ok:ticks[2]/10};
}
