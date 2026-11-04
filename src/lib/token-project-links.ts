import {validateToken} from './analysis';

export type ProjectLink={kind:'website'|'x'|'telegram'|'discord'|'social'|'dex';label:string;url:string;source:string};
export type TokenProjectLinks={logoUrl?:string;links:ProjectLink[]};
type Input={chain:string;token:string;market:unknown;fixture?:boolean};
type Row=Record<string,unknown>;
const object=(value:unknown):Row=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const cleanLabel=(value:unknown,fallback:string)=>typeof value==='string'?value.replace(/[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,32)||fallback:fallback;

function externalUrl(value:unknown):URL|undefined{
 if(typeof value!=='string'||value.length>2048||!/^https?:\/\//i.test(value)||/[\u0000-\u0020\u007f\\]/.test(value))return;
 try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)return;return url;}catch{return;}
}
function knownSocial(url:URL):Pick<ProjectLink,'kind'|'label'>|undefined{
 const host=url.hostname.toLowerCase().replace(/^www\./,'');
 if(['x.com','twitter.com'].includes(host))return {kind:'x',label:'X'};
 if(['t.me','telegram.me','telegram.org'].includes(host))return {kind:'telegram',label:'Telegram'};
 if(['discord.gg','discord.com'].includes(host))return {kind:'discord',label:'Discord'};
}

/** Only metadata bound to this exact chain and base token can name a project.
 * Links are provider-supplied destinations, not endorsements or verified identities. */
export function tokenProjectLinks(report:Input):TokenProjectLinks{
 const empty:TokenProjectLinks={links:[]},market=object(report.market),base=object(market.baseToken);
 if(report.fixture||validateToken(report.chain,report.token)||market.chainId!==report.chain||typeof base.address!=='string')return empty;
 const matches=report.chain==='solana'?base.address===report.token:base.address.toLowerCase()===report.token.toLowerCase();
 if(!matches)return empty;
 const info=object(market.info),links:ProjectLink[]=[],seen=new Set<string>();
 const add=(value:unknown,kind:ProjectLink['kind'],label:string,source:string)=>{
  const url=externalUrl(value);if(!url)return;
  const key=new URL(url.href);key.hostname=key.hostname.replace(/^www\./,'').replace(/^twitter\.com$/,'x.com');key.hash='';
  const identity=key.href.replace(/\/$/,'');if(seen.has(identity))return;seen.add(identity);
  const social=knownSocial(url);links.push({kind:social?.kind||kind,label:social?.label||label,url:url.href,source});
 };
 for(const value of (Array.isArray(info.websites)?info.websites:[]).slice(0,4)){
  const row=object(value);add(row.url,'website',cleanLabel(row.label,'Website'),'DEX Screener project metadata');
 }
 for(const value of (Array.isArray(info.socials)?info.socials:[]).slice(0,4)){
  const row=object(value),label=cleanLabel(row.type,'Project link');
  add(row.url,'social',/^(twitter|x|telegram|discord)$/i.test(label)?'Project link':label,'DEX Screener project metadata');
 }
 const marketUrl=externalUrl(market.url);
 if(marketUrl&&['dexscreener.com','www.dexscreener.com'].includes(marketUrl.hostname.toLowerCase()))add(marketUrl.href,'dex','DEX Screener','DEX Screener market listing');
 const logo=externalUrl(info.imageUrl);
 return {...(logo?{logoUrl:logo.href}:{}),links};
}
