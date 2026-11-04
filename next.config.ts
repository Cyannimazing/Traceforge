import type { NextConfig } from "next";
const config: NextConfig = { poweredByHeader: false,async headers(){return [
 {source:'/api/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow, nosnippet'}]},
 ...(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production'?[{source:'/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'}]}]:[]),
 ];} };
export default config;
