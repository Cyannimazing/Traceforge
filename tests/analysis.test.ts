import { test } from "node:test";
import assert from "node:assert/strict";
import {
  supplyShare,
  validateToken,
  analyzeSecurity,
  normalizeHolders,
  selectPair,
  sameToken,
  formatMoney,
  parseCount,
} from "../src/lib/analysis";
test("small positive prices retain significant digits and missing counts remain unknown", () => {
  assert.equal(formatMoney(0.0000000123), "$1.23e-8");
  assert.equal(parseCount(null), null);
  assert.equal(parseCount(""), null);
  assert.equal(parseCount("0"), 0);
});
test('supply shares require finite positive supply and normalized in-range token balances',()=>{
  assert.equal(supplyShare(125,1000),12.5);
  assert.equal(supplyShare(0,1000),0);
  for(const supply of [null,undefined,0,-1,'',Infinity])assert.equal(supplyShare(1,supply),null);
  assert.equal(supplyShare(1001,1000),null);
  assert.equal(supplyShare(null,1000),null);
});
test("missing holder fields do not become definite zero shares or wallet labels", () => {
  const address = "0x" + "a".repeat(40);
  assert.equal(normalizeHolders([{ address, percent: null }]).length, 0);
  assert.equal(normalizeHolders([{ address, percent: "   " }]).length, 0);
  assert.equal(
    normalizeHolders([{ address, percent: ".1" }])[0].contract,
    null,
  );
});
test("watchlist identity treats EVM case-insensitively and Solana case-sensitively", () => {
  assert.equal(sameToken("ethereum", "0xAB", "0xab"), true);
  assert.equal(sameToken("solana", "Abcd", "abcd"), false);
});
test("validates EVM addresses and rejects unsupported chain and URL input", () => {
  assert.equal(validateToken("ethereum", "0x" + "a".repeat(40)), null);
  assert.ok(validateToken("ethereum", "https://example.com"));
  assert.ok(validateToken("unknown", "0x" + "a".repeat(40)));
});
test("preserves Solana case and rejects invalid base58", () => {
  assert.equal(
    validateToken("solana", "So11111111111111111111111111111111111111112"),
    null,
  );
  assert.ok(validateToken("solana", "0".repeat(44)));
});
test("missing or nonbinary security flags remain unknown", () => {
  assert.ok(analyzeSecurity(null).every((x) => x.status === "unknown"));
  assert.equal(analyzeSecurity({ is_honeypot: "" })[0].status, "unknown");
  assert.equal(
    analyzeSecurity({ is_honeypot: "unexpected" })[0].status,
    "unknown",
  );
});
test("honeypot and balance manipulation are critical; open source reverses flag meaning", () => {
  const checks = analyzeSecurity({
    is_honeypot: "1",
    owner_change_balance: "1",
    is_open_source: "1",
  });
  assert.equal(checks[0].status, "critical");
  assert.equal(
    checks.find((x) => x.key === "owner_change_balance")?.status,
    "critical",
  );
  assert.equal(checks.find((x) => x.key === "is_open_source")?.status, "clear");
});
test("holder shares are parsed as fractions and bad records excluded", () => {
  const rows = normalizeHolders([
    { address: "0x" + "a".repeat(40), percent: "0.2", is_contract: 1 },
    { address: "bad", percent: "oops" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].share, 20);
  assert.equal(rows[0].contract, true);
});
test("pair selection requires requested chain and base token, orders liquidity", () => {
  const token = "0x" + "a".repeat(40);
  const a = {
    chainId: "ethereum",
    baseToken: { address: token },
    liquidity: { usd: 10 },
  };
  assert.equal(
    selectPair(
      [
        { ...a, chainId: "base", liquidity: { usd: 100 } },
        a,
        { ...a, baseToken: { address: "other" } },
      ],
      "ethereum",
      token,
    ),
    a,
  );
  assert.equal(selectPair([], "ethereum", token), null);
});
