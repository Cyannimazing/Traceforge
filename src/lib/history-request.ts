import {validateToken} from './analysis';
export function parseHistoryRequest(url:URL){
 const chain=url.searchParams.get('chain')||'',token=(url.searchParams.get('token')||'').trim();
 if(chain!=='ethereum'&&chain!=='base')throw Error('Historical pool verification currently supports Ethereum and Base.');
 const error=validateToken(chain,token);if(error)throw Error(error);
 return {chain,token} as {chain:'ethereum'|'base';token:string};
}
export function historyMutationAllowed(request:{url:string;headers:Headers}){
 const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
 if(site==='cross-site'||!origin)return false;
 try{
  const source=new URL(origin),target=new URL(request.url);
  if(source.origin!==origin||!['http:','https:'].includes(source.protocol))return false;
  // Next can normalize its internal URL to localhost while the browser uses
  // 127.0.0.1. Host is the actual HTTP authority; arbitrary foreign origins still
  // fail. Forwarded-host headers are deliberately not trusted.
  return source.origin===target.origin||(source.host===request.headers.get('host')&&source.protocol===target.protocol);
 }catch{return false;}
}
