/** Next can reconstruct nextUrl with localhost while the browser uses 127.0.0.1. */
export function validAgentOrigin(origin:string|null,host:string|null,protocol:string){
 return !!origin&&!!host&&(protocol==='http:'||protocol==='https:')&&origin===`${protocol}//${host}`;
}
