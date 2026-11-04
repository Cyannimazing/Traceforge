import type {InvestigationReport} from './investigation-types';
import type {TrustRating} from './trust-rating';
import type {VerdictOutput} from './verdict-output';

/** Explain an issued snapshot, never imply that unavailable measurements are queued jobs.
 * This presentation helper cannot award points or change the decision model. */
export function assessmentReadiness(
 report:InvestigationReport,
 rating:Pick<TrustRating,'score'|'coreVerified'|'hard'|'soft'>,
 score:number|null,
 decision:VerdictOutput['decision'],
):{label:string;summary:string}{
 if(rating.hard?.length)return {label:'Stop rule triggered',summary:rating.hard[0]};
 if(rating.soft?.length)return {label:'Warning found',summary:rating.soft[0]};
 if(score!==null&&Number.isFinite(score)&&score>=0&&score<=100)return {label:'Observed activity',summary:decision==='OK'?'No stop rule was triggered in the observed activity.':'The observed activity raised warning signs.'};
 if(!rating.coreVerified)return {label:'Current data unavailable',summary:'Some current contract controls or holder balances could not be verified. The source details explain what was returned.'};
 const market=report.market,price=Number(market?.priceUsd),liquidity=market?.liquidity?.usd;
 if(!market||!Number.isFinite(price)||price<=0||typeof liquidity!=='number'||!Number.isFinite(liquidity)||liquidity<=0||!market.pairAddress)return {label:'Market data unavailable',summary:'The retrieved sources did not provide a usable market price or liquidity for a numerical market-risk score.'};
 return {label:'Limited evidence',summary:'Some wallet or pool measurements could not be verified in this snapshot. The specific findings below explain which evidence is available.'};
}
