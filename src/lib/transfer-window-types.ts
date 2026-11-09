/** Browser-safe transfer-window constants and types (no Node/SQLite imports). */

/** Most recent token transfers read to nominate real holders. Larger tokens are
 * too large for a full crawl; their verdict is explicitly based on this window. */
export const TRANSFER_WINDOW_LIMIT=150_000;
export type WindowChain='ethereum'|'base'|'robinhood'|'bsc';
export type TransferWindowStatus='partial'|'complete'|'capped'|'cooldown'|'unavailable';
export type TransferWindowSummary={limit:number;read:number;total:number|null;status:TransferWindowStatus;anchorBlock:number|null;newestBlock:number|null;oldestBlock:number|null;updatedAt:string;detail:string};
export type TransferWindowResult={summary:TransferWindowSummary;candidates:string[]};
