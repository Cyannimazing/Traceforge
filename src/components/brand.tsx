"use client";
import './brand.css';
export function ForgeMark({size=36,className=''}:{size?:number;className?:string}) {
  return <svg className={`forge-mark ${className}`} width={size} height={size} viewBox="0 0 68 68" fill="none" aria-hidden="true"><path d="M6 12H36L30 22H25V56H15V22H6Z" fill="currentColor"/><path d="M39 12H62L56 22H49V30H60L54 40H49V56H39Z" fill="currentColor"/></svg>;
}
