const sources=[
 ['DEX Screener','Market snapshots and latest token profiles','dexscreener.jpg'],
 ['GoPlus','Contract and token security checks','goplus.png'],
 ['GeckoTerminal','Pool trading records','geckoterminal.png'],
 ['Blockscout','Explorer records where supported','blockscout.png'],
 ['Alchemy','Configured Solana, Ethereum and Base RPC records','alchemy.svg'],
];

export default function SourceStrip(){
 return <div className="source-provider-strip" aria-label="Data sources used by TraceForge. Provider brands identify sources, not endorsements.">
  <span className="sr-only">Data sources</span>
  <div className="source-provider-window"><div className="source-provider-track">{[0,1,2,3].map(copy=><ul key={copy} aria-hidden={copy>0?true:undefined}>{sources.map(([name,description,logo])=><li key={name} title={description}><img src={`/providers/${logo}`} alt="" width="28" height="28" loading="eager"/>{name}</li>)}</ul>)}</div></div>
 </div>;
}
