import {CHAINS,validateToken,type Chain} from './analysis';

/** Operator-designated project link, never an analysis or scoring exception. */
export type OfficialToken={address:string;chain:Chain;network:string;name:string;symbol:string;explorer:string};
type OfficialTokenEnv={address?:string;chain?:string;symbol?:string;name?:string};

/** Builds the official token from configuration. Returns null (nothing is shown)
 * when no address is set or the address is not valid for the chosen chain. */
export function officialToken(env:OfficialTokenEnv):OfficialToken|null{
 const address=env.address?.trim();if(!address)return null;
 const chainInput=(env.chain?.trim().toLowerCase()||'solana');
 if(!Object.hasOwn(CHAINS,chainInput))return null;const chain=chainInput as Chain;
 if(validateToken(chain,address))return null;
 const normalized=chain==='solana'?address:address.toLowerCase();
 const symbol=(env.symbol?.trim()||'TE').replace(/^\$/,'').slice(0,12),name=(env.name?.trim()||'Trace Engine').slice(0,60);
 return {address:normalized,chain,network:CHAINS[chain].name,name,symbol,explorer:`${CHAINS[chain].explorer}/token/${normalized}`};
}

/** The official project token. Set `address` to '' to hide it everywhere.
 * Trace Engine ($TRACE) on Robinhood Chain; name and symbol read from the
 * contract on 2026-11-09. */
export const OFFICIAL_TOKEN=officialToken({
 address:'0x252e757b2b89b856c8232cc1bcdb45355bfb46cc',
 chain:'robinhood',
 symbol:'TRACE',
 name:'Trace Engine',
});
