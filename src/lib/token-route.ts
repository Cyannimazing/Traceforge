import {validateToken,type Chain} from './analysis';

export type TokenRouteTarget={chain:Chain;token:string};
export type WorkspaceView='scanner'|'discover'|'watchlist'|'methodology';
const workspacePaths:Record<WorkspaceView,string>={scanner:'/',discover:'/discover',watchlist:'/watchlist',methodology:'/methodology'};
export function workspacePath(view:WorkspaceView):string{return workspacePaths[view];}
export function parseWorkspacePath(pathname:string):WorkspaceView|null{
 const path=pathname==='/'?pathname:pathname.replace(/\/$/,'');
 return (Object.keys(workspacePaths) as WorkspaceView[]).find(view=>workspacePaths[view]===path)??null;
}

export function tokenRouteTarget(chain:string,token:string):TokenRouteTarget|null{
 const address=token.trim();
 if(validateToken(chain,address))return null;
 return {chain:chain as Chain,token:chain==='solana'?address:address.toLowerCase()};
}

export function tokenReportPath(chain:string,token:string):string|null{
 const target=tokenRouteTarget(chain,token);
 return target?`/token/${target.chain}/${encodeURIComponent(target.token)}`:null;
}

export function parseTokenPath(pathname:string):TokenRouteTarget|null{
 const match=/^\/token\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
 if(!match)return null;
 try{return tokenRouteTarget(decodeURIComponent(match[1]),decodeURIComponent(match[2]));}
 catch{return null;}
}
