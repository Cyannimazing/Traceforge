import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTokenPath,tokenReportPath,tokenRouteTarget} from '../src/lib/token-route';

const WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const SOL='6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump';

test('EVM report links canonicalize address case and reopen the same target',()=>{
 const path=tokenReportPath('ethereum',WETH)!;
 assert.equal(path,`/token/ethereum/${WETH.toLowerCase()}`);
 assert.deepEqual(parseTokenPath(path),{chain:'ethereum',token:WETH.toLowerCase()});
});
test('Solana report links preserve case-sensitive mint addresses',()=>{
 assert.equal(tokenReportPath('solana',SOL),`/token/solana/${SOL}`);
 assert.deepEqual(parseTokenPath(`/token/solana/${SOL}/`),{chain:'solana',token:SOL});
});
test('unsupported chains, malformed addresses, and extra path segments never start scans',()=>{
 for(const path of ['/',`/token/unknown/${WETH}`,`/token/solana/${WETH}`,`/token/base/${SOL}`,`/token/ethereum/${WETH}/extra`,`/token/ethereum/%ZZ`,`/token/ethereum/${WETH}%2Fextra`])assert.equal(parseTokenPath(path),null,path);
 assert.equal(tokenReportPath('ethereum','<script>'),null);
 assert.equal(tokenRouteTarget('constructor',WETH),null);
});
test('report routes retain network identity for an address shared across EVM chains',()=>{
 assert.notEqual(tokenReportPath('ethereum',WETH),tokenReportPath('base',WETH));
 assert.deepEqual(parseTokenPath(`/token/base/${WETH}`),{chain:'base',token:WETH.toLowerCase()});
});
