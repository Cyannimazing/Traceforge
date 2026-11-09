import type {Metadata,MetadataRoute} from 'next';
import {DEFAULT_SITE_ORIGIN,INDEXABLE_PATHS,pageSeoForPath,SITE_NAME} from './site-content';
export type SeoEnvironment={NODE_ENV?:string;VERCEL_ENV?:string;SITE_URL?:string;GOOGLE_SITE_VERIFICATION?:string};
export function seoSettings(env:SeoEnvironment=process.env){
 let url:URL;
 try{url=new URL(env.SITE_URL?.trim()||DEFAULT_SITE_ORIGIN);}catch{throw Error('SITE_URL must be a public HTTPS origin without credentials, a path or query.');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!url.hostname.includes('.')||/^[\d.]+$|:|\.$|(?:^|\.)(?:localhost|local|internal|test)$/i.test(url.hostname))throw Error('SITE_URL must be a public HTTPS origin without credentials, a path or query.');
 return {origin:url.origin,indexable:env.NODE_ENV==='production'&&(!env.VERCEL_ENV||env.VERCEL_ENV==='production')};
}
export function createPageMetadata(path:string,env:SeoEnvironment=process.env):Metadata{
 const site=seoSettings(env),page=pageSeoForPath(path),canonical=new URL(page.path,site.origin).href,image={url:`${site.origin}/opengraph-image`,width:1200,height:630,alt:'TraceForge Engine - public blockchain token investigation'};
 return {title:page.title,description:page.description,alternates:{canonical},robots:{index:site.indexable&&page.indexable,follow:true,'max-image-preview':'large'},openGraph:{type:'website',locale:'en_US',siteName:SITE_NAME,title:page.title,description:page.description,url:canonical,images:[image]},twitter:{card:'summary_large_image',site:'@traceengine17',title:page.title,description:page.description,images:[image]}};
}
export function createRootMetadata(env:SeoEnvironment=process.env):Metadata{
 return {...createPageMetadata('/',env),metadataBase:new URL(`${seoSettings(env).origin}/`),applicationName:SITE_NAME,category:'finance',verification:env.GOOGLE_SITE_VERIFICATION?.trim()?{google:env.GOOGLE_SITE_VERIFICATION.trim()}:undefined,icons:{icon:[{url:'/favicon.ico?v=tf5',sizes:'16x16 32x32 48x48',type:'image/x-icon'},{url:'/brand/traceforge-favicon-48.png?v=tf5',sizes:'48x48',type:'image/png'},{url:'/brand/traceforge-favicon-96.png?v=tf5',sizes:'96x96',type:'image/png'},{url:'/brand/traceforge-favicon-192.png?v=tf5',sizes:'192x192',type:'image/png'},{url:'/brand/traceforge-favicon-512.png?v=tf5',sizes:'512x512',type:'image/png'}],apple:'/brand/traceforge-apple-touch-180.png?v=tf5'}};
}
export function siteSitemap(env:SeoEnvironment=process.env):MetadataRoute.Sitemap{
 const site=seoSettings(env);return site.indexable?INDEXABLE_PATHS.map(path=>({url:new URL(path,site.origin).href})):[];
}
export function siteRobots(env:SeoEnvironment=process.env):MetadataRoute.Robots{
 const site=seoSettings(env);return site.indexable?{rules:{userAgent:'*',allow:'/',disallow:['/api/']},sitemap:`${site.origin}/sitemap.xml`}:{rules:{userAgent:'*',disallow:'/'}};
}
export function structuredSiteData(env:SeoEnvironment=process.env):Record<string,unknown>{
 const {origin}=seoSettings(env),description=pageSeoForPath('/').description;
 return {'@context':'https://schema.org','@graph':[
  {'@type':'WebSite','@id':`${origin}/#website`,url:`${origin}/`,name:SITE_NAME,alternateName:'TraceForge',sameAs:['https://x.com/traceengine17'],description,inLanguage:'en'},
  {'@type':'WebApplication','@id':`${origin}/#application`,url:`${origin}/`,name:SITE_NAME,description,applicationCategory:'FinanceApplication',operatingSystem:'Web browser',featureList:['Token holder analysis and supply-share maps','Wallet funding and transaction connections','Creator, Owner, Dev and Sniper evidence flags','Token contract and authority checks','Source-linked token assessments','Recent token and DEX pool discovery'],isPartOf:{'@id':`${origin}/#website`}},
 ]};
}
export function jsonLd(value:unknown):string{return JSON.stringify(value).replace(/</g,'\\u003c');}
