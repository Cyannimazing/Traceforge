import { validateToken, type Chain } from './analysis';
import type { ScanOptions } from './investigation-service';
export function parseScanRequest(url: URL) {
  const chain = url.searchParams.get('chain') || 'ethereum';
  const raw = (url.searchParams.get('token') || '').trim();
  const mode = url.searchParams.get('mode') || 'deep';
  const error = validateToken(chain,raw) || (!['deep','market','holders'].includes(mode) ? 'Choose a valid scan mode.' : null);
  return {error,chain:chain as Chain,token:chain==='solana'?raw:raw.toLowerCase(),options:{mode:mode as ScanOptions['mode'],expanded:url.searchParams.get('expanded')==='1',fresh:url.searchParams.get('fresh')==='1'}};
}
