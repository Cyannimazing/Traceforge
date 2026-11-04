import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureReport} from '../src/lib/investigation-fixture';
import {FEED_KEY,feedItem,rememberReport,readRememberedReports} from '../src/lib/report-feed';
import {reportHistoryEnabled,setReportHistoryConsent,clearTraceForgeStorage,REPORT_HISTORY_CONSENT_KEY,WATCHLIST_KEY,type BrowserStorage} from '../src/lib/browser-storage';

function memoryStorage(initial:Record<string,string>={}):BrowserStorage{
 const values=new Map(Object.entries(initial));
 return {getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);},key:index=>[...values.keys()][index]??null,get length(){return values.size;}};
}

test('completing a scan without history opt-in preserves existing browser data without writing a report',()=>{
 const values=new Map<string,string>([[FEED_KEY,JSON.stringify([{...feedItem({...fixtureReport,fixture:false})!,name:'Previously saved report'}])]]);
 const before=values.get(FEED_KEY);
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});
 try{rememberReport({...fixtureReport,fixture:false});assert.equal(values.get(FEED_KEY),before);}
 finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});

test('legacy history is hidden without opt-in and is preserved until a deliberate choice',()=>{
 const item=feedItem({...fixtureReport,fixture:false})!,raw=JSON.stringify([item]),storage=memoryStorage({[FEED_KEY]:raw});
 assert.equal(reportHistoryEnabled(storage),false);assert.deepEqual(readRememberedReports(storage),[]);
 assert.equal(storage.getItem(FEED_KEY),raw);assert.equal(storage.length,1);
 assert.equal(setReportHistoryConsent(true,storage),true);assert.deepEqual(readRememberedReports(storage),[item]);
});
test('an explicit history opt-in saves completed reports with the existing twelve-report bound',()=>{
 const storage=memoryStorage();assert.equal(setReportHistoryConsent(true,storage),true);
 for(let index=1;index<=14;index++)rememberReport({...fixtureReport,fixture:false,token:`0x${index.toString(16).padStart(40,'0')}`,name:`Token ${index}`},storage);
 const reports=readRememberedReports(storage);assert.equal(reports.length,12);assert.equal(reports[0].name,'Token 14');assert.equal(reports[11].name,'Token 3');
});
test('withdrawing history consent removes every saved report version and prevents later scan writes',()=>{
 const storage=memoryStorage({[REPORT_HISTORY_CONSENT_KEY]:'enabled',[FEED_KEY]:'[]','traceforge.report-feed.v4':'old',[WATCHLIST_KEY]:'watched','other-app':'keep'});
 assert.equal(setReportHistoryConsent(false,storage),true);rememberReport({...fixtureReport,fixture:false},storage);
 assert.equal(reportHistoryEnabled(storage),false);assert.equal(storage.getItem(FEED_KEY),null);assert.equal(storage.getItem('traceforge.report-feed.v4'),null);
 assert.equal(storage.getItem(WATCHLIST_KEY),'watched');assert.equal(storage.getItem('other-app'),'keep');assert.deepEqual(readRememberedReports(storage),[]);
});
test('clear app data removes the watchlist, all history versions and the opt-in without touching another application',()=>{
 const storage=memoryStorage({[WATCHLIST_KEY]:'watched',[REPORT_HISTORY_CONSENT_KEY]:'enabled',[FEED_KEY]:'[]','traceforge.report-feed.v1':'old','other-app':'keep'});
 assert.equal(clearTraceForgeStorage(storage),true);assert.equal(storage.length,1);assert.equal(storage.getItem('other-app'),'keep');
 rememberReport({...fixtureReport,fixture:false},storage);assert.equal(storage.length,1);assert.equal(reportHistoryEnabled(storage),false);
});
test('unavailable browser storage fails closed and does not interrupt a completed scan',()=>{
 const blocked:BrowserStorage={get length():number{throw Error('blocked');},key(){throw Error('blocked');},getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
 assert.equal(reportHistoryEnabled(blocked),false);assert.deepEqual(readRememberedReports(blocked),[]);
 assert.doesNotThrow(()=>rememberReport({...fixtureReport,fixture:false},blocked));assert.equal(setReportHistoryConsent(true,blocked),false);assert.equal(clearTraceForgeStorage(blocked),false);
});
