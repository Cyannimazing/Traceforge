import { validateToken, type Chain } from './analysis';
import type { InvestigationReport, ScanEvent } from './investigation-types';
import type { ScanOptions } from './investigation-service';
import { bridgeSwarmReport } from './swarm-bridge';
import type { SwarmResult } from './swarm';

type Service = { scan: (chain: Chain, token: string, options?: ScanOptions) => Promise<InvestigationReport> };
type Dependencies = {
  independent: Service;
  provider: (chain: Chain, token: string, options: {signal?: AbortSignal; allowScan?: boolean}) => Promise<SwarmResult>;
};

/** Public provider aggregation is an explicit source, never canonical history. */
export function createProviderInvestigationService({independent, provider}: Dependencies): Service {
  let active = 0;
  return { async scan(chain, token, options = {}) {
    options.signal?.throwIfAborted();
    const invalid = validateToken(chain, token); if (invalid) throw Error(invalid);
    if (options.mode === 'market') return independent.scan(chain, token, options);
    if (options.expanded) {
      options.onEvent?.({type:'stage',stage:'independent-scan',status:'complete',detail:'Independent expanded scan selected; the provider snapshot was not requested.'});
      return independent.scan(chain, token, options);
    }
    if (active >= 4) throw Error('Investigation capacity reached. Retry shortly.');
    active++;
    const stage = (status: 'running'|'complete'|'unavailable', detail: string) => options.onEvent?.({type:'stage',stage:'provider-report',status,detail} satisfies ScanEvent);
    try {
      stage('running', 'Requesting the public SwarmEngine analysis. Its original scan timestamp and attribution will be preserved.');
      let result: SwarmResult;
      try { result = await provider(chain, token, {signal:options.signal,allowScan:options.mode !== 'holders'}); }
      catch { options.signal?.throwIfAborted(); result = {status:'unavailable',cached:false,message:'The public analysis provider is unavailable.'}; }
      options.signal?.throwIfAborted();
      if (result.status !== 'available' || !result.report) {
        const detail = result.status === 'pending' ? 'The provider report is still pending. Using available independent sources for this response.' : result.status === 'rate-limited' ? 'The provider is rate limited. Using available independent sources without retrying the provider.' : 'The provider did not return a valid completed report. Using available independent sources.';
        stage('unavailable', detail);
        const fallback = await independent.scan(chain, token, options);
        options.signal?.throwIfAborted();
        return {...fallback,sources:[...fallback.sources.filter(s=>!s.name.startsWith('Swarm provider')),{name:'Swarm provider report',status:'unavailable',detail}]};
      }
      const report = bridgeSwarmReport(result.report);
      stage('complete', `${result.cached?'Cached':'Stored or completed'} provider report received. ${report.investigation.wallets.length} addresses returned; complete launch history is not established.`);
      // A market-only request cannot add independent role/authority assertions to
      // the provider snapshot. Its failure must not discard the provider report.
      try {
        options.onEvent?.({type:'stage',stage:'market-context',status:'running',detail:'Refreshing independent market context for the provider report.'});
        const market = await independent.scan(chain, token, {mode:'market',signal:options.signal});
        options.signal?.throwIfAborted();
        report.market = market.market;
        report.sources.push(...market.sources.filter(s=>!/not requested/i.test(s.detail)));
        options.onEvent?.({type:'stage',stage:'market-context',status:market.market?'complete':'unavailable',detail:market.market?'Market snapshot received. Wallet classifications remain provider-reported.':'Market context is unavailable; the provider report is retained.'});
      } catch {
        options.signal?.throwIfAborted();
        report.sources.push({name:'DEX Screener',status:'unavailable',detail:'Market enrichment failed. The provider analysis and original timestamps are preserved.'});
        options.onEvent?.({type:'stage',stage:'market-context',status:'unavailable',detail:'Market context could not be refreshed. The provider report is retained.'});
      }
      options.onEvent?.({type:'stage',stage:'assessment',status:'complete',detail:'Provider claims assembled with source attribution and explicit historical limits.'});
      return report;
    } finally { active--; }
  }};
}
