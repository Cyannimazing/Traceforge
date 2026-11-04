/** Common movement preserves relationships; a small per-wallet current adds
 * independent motion within the packing gap. Coordinates carry no risk meaning. */
export function holderMapDrift(phase:number,index:number):{x:number;y:number}{
 if(!Number.isFinite(phase)||!Number.isSafeInteger(index)||index<0)return {x:0,y:0};
 const offset=index*2.399963229728653;
 return {x:22*Math.sin(phase)+2*Math.sin(phase*2+offset),y:14*Math.sin(phase*2)+2*Math.sin(phase*3+offset)};
}
