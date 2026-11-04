import {ImageResponse} from 'next/og';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export const alt='TraceForge Engine - crypto token analysis and wallet tracing';
export const size={width:1200,height:630};
export const contentType='image/png';
export default async function Image(){
 const [regular,bold]=await Promise.all(['space-grotesk-regular.ttf','space-grotesk-bold.ttf'].map(file=>readFile(join(process.cwd(),'public','fonts',file))));
 return new ImageResponse(<div style={{display:'flex',width:'100%',height:'100%',background:'#080808',color:'#eeeeee',fontFamily:'Space Grotesk',padding:48,position:'relative'}}>
  <div style={{display:'flex',position:'absolute',left:24,top:24,right:24,bottom:24,border:'1px solid #353535'}}/>
  <div style={{display:'flex',position:'absolute',right:54,top:150,width:330,height:330,alignItems:'center',justifyContent:'center'}}>
   <svg width="330" height="330" viewBox="0 0 330 330"><circle cx="165" cy="165" r="156" fill="none" stroke="#252525"/><circle cx="165" cy="165" r="110" fill="none" stroke="#252525"/><path d="M55 112L150 62L252 122L211 233L93 254L55 112L211 233M150 62L165 165L93 254M165 165L252 122" fill="none" stroke="#505050"/>{[[55,112,13],[150,62,20],[252,122,15],[211,233,26],[93,254,12],[165,165,34]].map(([cx,cy,r])=><circle key={cx} cx={cx} cy={cy} r={r} fill="#161616" stroke="#a1a1a1" strokeWidth="1.5"/>)}</svg>
  </div>
  <div style={{display:'flex',flexDirection:'column',position:'relative',width:'100%'}}>
   <div style={{display:'flex',alignItems:'center',gap:18,fontSize:28,fontWeight:700,letterSpacing:2}}><svg width="46" height="46" viewBox="0 0 68 68"><path d="M6 12H36L30 22H25V56H15V22H6Z M39 12H62L56 22H49V30H60L54 40H49V56H39Z" fill="#eeeeee"/></svg>TRACEFORGE ENGINE</div>
   <div style={{display:'flex',flexDirection:'column',marginTop:70,fontSize:76,lineHeight:1.08,letterSpacing:-3,fontWeight:700}}><span>See the token.</span><span>Trace the wallets.</span></div>
   <div style={{display:'flex',marginTop:30,fontSize:24,color:'#a1a1a1'}}>Holders. Connections. Contract checks.</div>
   <div style={{display:'flex',position:'absolute',bottom:0,left:0,right:0,borderTop:'1px solid #353535',paddingTop:24,justifyContent:'space-between',fontSize:19,color:'#a1a1a1'}}><span>PUBLIC BLOCKCHAIN EVIDENCE</span><span>traceengine.tech</span></div>
  </div>
 </div>,{...size,fonts:[{name:'Space Grotesk',data:new Uint8Array(regular).buffer,weight:400},{name:'Space Grotesk',data:new Uint8Array(bold).buffer,weight:700}]});
}
