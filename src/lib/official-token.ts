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

// NEXT_PUBLIC_* values are inlined at build time, so each must be read by its
// literal name. Leave NEXT_PUBLIC_OFFICIAL_TOKEN_ADDRESS empty to hide the token.
export const OFFICIAL_TOKEN=officialToken({
 address:process.env.NEXT_PUBLIC_OFFICIAL_TOKEN_ADDRESS,
 chain:process.env.NEXT_PUBLIC_OFFICIAL_TOKEN_CHAIN,
 symbol:process.env.NEXT_PUBLIC_OFFICIAL_TOKEN_SYMBOL,
 name:process.env.NEXT_PUBLIC_OFFICIAL_TOKEN_NAME,
});
