export type MapShareBasis = 'float' | 'total';
type InfrastructureRow = { address: string; share: number | null };
export type MapFloatBasis = { denominator: number | null; excluded: number | null; reason: string | null };

export function resolveShareBasis(preferred:MapShareBasis,float:MapFloatBasis,infrastructure=false):MapShareBasis {
  return infrastructure||float.denominator===null?'total':preferred;
}
export const shareBasisLabel=(basis:MapShareBasis)=>basis==='float'?'Snapshot float':'Total supply';
export function sharePercentText(value:number|null):string {
  return value==null||!Number.isFinite(value)?'Unavailable':`${value>0&&value<.01?'<0.01':value.toLocaleString(undefined,{maximumFractionDigits:2})}%`;
}

/** Snapshot denominator subtracts measured infrastructure, never displayed holders.
 * Required addresses are current infrastructure rows and the valid current market
 * pair. Historical labels without balances do not imply a measured zero balance.
 */
export function holderMapFloatBasis(infrastructure: readonly InfrastructureRow[], requiredCurrentAddresses: readonly string[], caseSensitive = false, holders: readonly InfrastructureRow[] = []): MapFloatBasis {
  const normalize = (address: string) => caseSensitive ? address : address.toLowerCase();
  const rows = new Map(infrastructure.map(row => [normalize(row.address), row]));
  if (requiredCurrentAddresses.some(address => !rows.has(normalize(address)))) return { denominator: null, excluded: null, reason: 'Snapshot float unavailable: a current infrastructure address has no snapshot balance.' };
  let excluded = 0;
  for (const row of rows.values()) {
    if (row.share == null || !Number.isFinite(row.share) || row.share < 0 || row.share > 100) return { denominator: null, excluded: null, reason: 'Snapshot float unavailable: an infrastructure supply share is missing or invalid.' };
    excluded += row.share;
  }
  const denominator = 100 - excluded;
  if (!Number.isFinite(denominator) || denominator <= 0) return { denominator: null, excluded, reason: 'Snapshot float unavailable: documented infrastructure leaves no positive supply denominator.' };
  const holderRows = new Map(holders.map(row => [normalize(row.address), row]));
  let knownHeld = 0;
  for (const [address, row] of holderRows) {
    if (rows.has(address) || row.share == null || !Number.isFinite(row.share)) continue;
    if (row.share < 0 || row.share > 100) return { denominator: null, excluded, reason: 'Snapshot float unavailable: a holder supply share is invalid in this snapshot.' };
    knownHeld += row.share;
  }
  // A partial snapshot can prove a contradiction, but cannot prove completeness.
  // Allow only floating-point summation noise; never normalize or clamp balances.
  if (knownHeld > denominator + 1e-8) return { denominator: null, excluded, reason: 'Snapshot float unavailable: documented holder and infrastructure balances exceed total supply. This snapshot is inconsistent.' };
  return { denominator, excluded, reason: null };
}

export function mapDisplayShare(raw: number | null, basis: MapShareBasis, float: MapFloatBasis): number | null {
  if (raw == null || !Number.isFinite(raw) || raw < 0 || raw > 100) return null;
  const value = basis === 'total' ? raw : float.denominator == null ? NaN : raw / float.denominator * 100;
  // Subtracting nearly 100% infrastructure can introduce boundary roundoff.
  // Correct only the computed percentage within 1e-8 percentage points of 100;
  // preserve real dust holdings and never normalize the displayed holder set.
  if (basis === 'float' && Math.abs(value - 100) <= 1e-8) return 100;
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}
