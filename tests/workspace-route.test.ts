import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWorkspacePath,workspacePath} from '../src/lib/token-route';

test('each workspace section has a refreshable URL',()=>{
 for(const [view,path] of [['scanner','/'],['discover','/discover'],['watchlist','/watchlist'],['methodology','/methodology']] as const){
  assert.equal(workspacePath(view),path);
  assert.equal(parseWorkspacePath(path),view);
  if(path!=='/')assert.equal(parseWorkspacePath(path+'/'),view);
 }
});
test('workspace routes do not swallow token reports or unknown pages',()=>{
 assert.equal(parseWorkspacePath('/token/solana/6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump'),null);
 assert.equal(parseWorkspacePath('/discover/more'),null);
 assert.equal(parseWorkspacePath('/unknown'),null);
});
