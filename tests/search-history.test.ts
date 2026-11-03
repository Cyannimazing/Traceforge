import test from 'node:test';
import assert from 'node:assert/strict';
import {beginSearchHistory,updateSearchHistory,searchHistorySettled,searchHistoryComplete} from '../src/lib/search-history';
test('first search waits for all scope settlement after final report refresh',()=>{
 let search=beginSearchHistory('ethereum',1);
 search=updateSearchHistory(search,1,'pool-history','scope-complete',true)!;
 assert.equal(searchHistorySettled(search),false);
 search=updateSearchHistory(search,1,'transfer-history','exhausted')!;
 assert.equal(searchHistorySettled(search),false);
 search=updateSearchHistory(search,1,'transfer-history','exhausted',true)!;
 assert.equal(searchHistoryComplete(search),true);
});
test('superseded callbacks cannot release a new token search; unsupported is incomplete',()=>{
 const search=beginSearchHistory('solana',2);
 assert.equal(updateSearchHistory(search,1,'mint-history','exhausted',true),search);
 assert.equal(updateSearchHistory(search,2,'wrong-scope','exhausted',true),search);
 const incomplete=updateSearchHistory(search,2,'mint-history','unsupported',true);
 assert.equal(searchHistorySettled(incomplete),true);assert.equal(searchHistoryComplete(incomplete),false);
 assert.equal(searchHistoryComplete(beginSearchHistory('solana',3)),false);
});
