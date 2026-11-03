import type {Chain} from './analysis';
export type SearchHistory={run:number;scopes:Record<string,{state:string;settled:boolean}>};
export function beginSearchHistory(chain:Chain,run:number):SearchHistory{
 const scopes=chain==='solana'?['mint-history']:['pool-history','transfer-history'];
 return {run,scopes:Object.fromEntries(scopes.map(scope=>[scope,{state:'pending',settled:false}]))};
}
export function updateSearchHistory(current:SearchHistory|null,run:number,scope:string,state:string,settled=false):SearchHistory|null{
 if(!current||current.run!==run||!current.scopes[scope])return current;
 const previous=current.scopes[scope];
 if(previous.settled||previous.state===state&&previous.settled===settled)return current;
 return {...current,scopes:{...current.scopes,[scope]:{state,settled}}};
}
export function searchHistorySettled(current:SearchHistory|null){return !current||Object.values(current.scopes).every(scope=>scope.settled);}
export function searchHistoryComplete(current:SearchHistory|null){return !!current&&searchHistorySettled(current)&&Object.values(current.scopes).every(scope=>['exhausted','scope-complete'].includes(scope.state));}
