"use client";
import './brand.css';
export function ForgeMark({size=36,className=''}:{size?:number;className?:string}) {
  return <img className={`forge-mark ${className}`} src="/brand/traceforge-creative-icon-192.png" width={size} height={size} alt="" aria-hidden="true"/>;
}
export function ForgeLogo(){return <picture className="forge-logo"><source media="(max-width:480px)" srcSet="/brand/traceforge-creative-icon-192.png"/><img src="/brand/traceforge-creative-logo.png" width="1100" height="209" alt="" aria-hidden="true" decoding="async"/></picture>;}
