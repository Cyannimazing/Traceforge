import 'server-only';
import {createCryptoReviewer} from './crypto-agent';
export const cryptoReviewer=createCryptoReviewer({key:()=>process.env.GEMINI_API_KEY||''});
