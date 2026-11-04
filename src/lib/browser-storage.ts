export const WATCHLIST_KEY='traceforge.watchlist.v1';
export const REPORT_HISTORY_CONSENT_KEY='traceforge.report-history.v1';
export const BROWSER_STORAGE_EVENT='traceforge:browser-storage';
export type BrowserStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'|'key'|'length'>;

export function browserStorage():BrowserStorage|undefined{
 try{return typeof localStorage==='undefined'?undefined:localStorage;}catch{return undefined;}
}
export function reportHistoryEnabled(storage=browserStorage()):boolean{
 try{return storage?.getItem(REPORT_HISTORY_CONSENT_KEY)==='enabled';}catch{return false;}
}
function notify(){if(typeof window!=='undefined')window.dispatchEvent(new Event(BROWSER_STORAGE_EVENT));}
function removeMatching(storage:BrowserStorage,matches:(key:string)=>boolean){
 const keys:string[]=[];
 for(let index=0;index<storage.length;index++){const key=storage.key(index);if(key&&matches(key))keys.push(key);}
 for(const key of keys)storage.removeItem(key);
}
export function setReportHistoryConsent(enabled:boolean,storage=browserStorage()):boolean{
 if(!storage)return false;
 try{
  if(enabled)storage.setItem(REPORT_HISTORY_CONSENT_KEY,'enabled');
  else{storage.removeItem(REPORT_HISTORY_CONSENT_KEY);removeMatching(storage,key=>/^traceforge\.report-feed\.v\d+$/.test(key));}
  return true;
 }catch{return false;}finally{notify();}
}
export function clearTraceForgeStorage(storage=browserStorage()):boolean{
 if(!storage)return false;
 try{removeMatching(storage,key=>key.startsWith('traceforge.'));return true;}
 catch{return false;}finally{notify();}
}
