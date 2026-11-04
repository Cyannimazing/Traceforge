import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageMetadata,createRootMetadata,seoSettings,siteRobots,siteSitemap,structuredSiteData,jsonLd} from '../src/lib/seo';
import {pageSeoForPath} from '../src/lib/site-content';
const production={NODE_ENV:'production',VERCEL_ENV:'production'};

test('confirmed public origin is canonical; preview and development do not become indexable',()=>{
 assert.equal(seoSettings(production).origin,'https://www.traceengine.tech');
 assert.equal(seoSettings(production).indexable,true);
 for(const env of [{NODE_ENV:'development'},{NODE_ENV:'production',VERCEL_ENV:'preview'},{NODE_ENV:'test'}])assert.equal(seoSettings(env).indexable,false);
 assert.equal(seoSettings({NODE_ENV:'production',SITE_URL:'https://example.org/'}).origin,'https://example.org');
 for(const SITE_URL of ['https://user:secret@example.org','http://example.org','https://localhost','https://127.0.0.1','https://example.org/app','https://example.org/?token=secret','file:///etc/passwd'])assert.throws(()=>seoSettings({...production,SITE_URL}),/SITE_URL must be a public HTTPS origin/);
});

test('sitemap contains the three indexable pages and no client reports, watchlists, query variants or fabricated modification dates',()=>{
 const entries=siteSitemap(production);
 assert.deepEqual(entries.map(e=>e.url),['https://www.traceengine.tech/','https://www.traceengine.tech/discover','https://www.traceengine.tech/methodology']);
 assert(entries.every(e=>e.lastModified===undefined));
 assert.deepEqual(siteSitemap({...production,VERCEL_ENV:'preview'}),[]);
 const robots=siteRobots(production);assert.equal(robots.sitemap,'https://www.traceengine.tech/sitemap.xml');
 assert.deepEqual(robots.rules,{userAgent:'*',allow:'/',disallow:['/api/']});
 assert.deepEqual(siteRobots({NODE_ENV:'development'}).rules,{userAgent:'*',disallow:'/'});
});

test('public pages have distinct titles, descriptions, canonical links and absolute social URLs',()=>{
 const titles=new Set<string>();
 for(const path of ['/','/discover','/methodology']){
  const metadata=createPageMetadata(path,production);assert.equal(metadata.alternates?.canonical,`https://www.traceengine.tech${path==='/'?'/':path}`);
  assert.equal(metadata.title,pageSeoForPath(path).title);assert.equal(typeof metadata.description,'string');
  const graph=metadata.openGraph as {url:string;siteName:string;images:{url:string}[]};assert.equal(graph.url,metadata.alternates?.canonical);assert.equal(graph.images[0].url,'https://www.traceengine.tech/opengraph-image');
  assert.equal((metadata.robots as {index:boolean}).index,true);titles.add(String(metadata.title));
 }
 assert.equal(titles.size,3);
 const root=createRootMetadata({...production,GOOGLE_SITE_VERIFICATION:'proof-code'});assert.equal(String(root.metadataBase),'https://www.traceengine.tech/');assert.equal(root.verification?.google,'proof-code');
});

test('watchlists and live report loading pages remain noindex; token canonicals normalize EVM but preserve Solana case',()=>{
 const address='0x'+'A'.repeat(40),path=`/token/bsc/${address}`;
 const metadata=createPageMetadata(path,production);assert.equal(metadata.alternates?.canonical,`https://www.traceengine.tech/token/bsc/${address.toLowerCase()}`);assert.equal((metadata.robots as {index:boolean}).index,false);
 assert.equal((createPageMetadata('/watchlist',production).robots as {index:boolean}).index,false);
 const solana='6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump';assert.equal(pageSeoForPath(`/token/solana/${solana}`).path,`/token/solana/${solana}`);
 assert.equal(pageSeoForPath(path,{chain:'bsc',token:address.toLowerCase(),symbol:'MEI'}).title,'MEI Token Report | TraceForge Engine');
 assert(!pageSeoForPath(path,{chain:'ethereum',token:address,symbol:'STALE'}).title.includes('STALE'));
});

test('structured data describes the actual website/application without invented reviews, ratings or safety claims',()=>{
 const data=structuredSiteData(production),serialized=jsonLd(data);assert.equal(JSON.parse(serialized)['@context'],'https://schema.org');
 assert(serialized.includes('https://www.traceengine.tech'));assert(!/aggregateRating|reviewRating|guaranteed|100% safe/i.test(serialized));
 const hostile=jsonLd({name:'</script><script>alert(1)</script>'});assert(!hostile.includes('<'));assert.equal(JSON.parse(hostile).name,'</script><script>alert(1)</script>');
});
