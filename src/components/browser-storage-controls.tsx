'use client';
import React,{useEffect,useState} from 'react';
import {BROWSER_STORAGE_EVENT,clearTraceForgeStorage,reportHistoryEnabled,setReportHistoryConsent} from '../lib/browser-storage';

export default function BrowserStorageControls(){
 const [enabled,setEnabled]=useState(false),[ready,setReady]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{const read=()=>{setEnabled(reportHistoryEnabled());setReady(true);};read();window.addEventListener(BROWSER_STORAGE_EVENT,read);window.addEventListener('storage',read);return()=>{window.removeEventListener(BROWSER_STORAGE_EVENT,read);window.removeEventListener('storage',read);};},[]);
 const change=(value:boolean)=>{const success=setReportHistoryConsent(value);setEnabled(reportHistoryEnabled());setMessage(success?value?'Report history is on. Future completed scans can be saved on this browser.':'Report history is off and saved report summaries have been cleared from this browser.':'Browser storage could not be updated. Check your browser settings and try again.');};
 const clear=()=>{const success=clearTraceForgeStorage();setEnabled(reportHistoryEnabled());setMessage(success?'TraceForge browser data cleared. Report history is off and this browser’s watchlist has been removed.':'Some browser data could not be cleared. Use your browser’s site-data settings to remove it.');};
 return <section id="storage-controls" className="storage-controls" aria-labelledby="storage-controls-title">
  <h2 id="storage-controls-title">Your browser storage choices</h2>
  <p>Report history is <strong>{ready?(enabled?'on':'off'):'off unless you enable it'}</strong>. Scanning works with history off.</p>
  <p>Enable history to save up to 12 completed report summaries on this browser. This also makes any summaries saved by an earlier version visible again. Your choice stays here until you change it or clear site data.</p>
  <div className="storage-actions"><button type="button" disabled={!ready||enabled} onClick={()=>change(true)}>Enable report history</button><button type="button" disabled={!ready} onClick={()=>change(false)}>{enabled?'Turn off and clear history':'Clear saved report history'}</button></div>
  <p>Turning history off clears saved report summaries, including earlier versions. Your watchlist is kept.</p>
  <div className="storage-clear"><h3>Clear TraceForge browser data</h3><p>Remove this browser’s watchlist, report summaries and history preference. This does not erase server evidence, hosting or provider logs, downloaded files, your browser’s browsing history, or blockchain records.</p><button type="button" disabled={!ready} onClick={clear}>Clear TraceForge browser data</button></div>
  <p className="storage-feedback" role="status" aria-live="polite">{message}</p>
 </section>;
}
