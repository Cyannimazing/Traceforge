import {ImageResponse} from 'next/og';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

export const alt='TraceForge Engine - token investigation, wallet tracing and contract checks at traceengine.tech';
export const size={width:1200,height:630};
export const contentType='image/png';

export default async function Image(){
 const [regular,logo]=await Promise.all([
  readFile(join(process.cwd(),'public','fonts','space-grotesk-regular.ttf')),
  readFile(join(process.cwd(),'public','brand','traceforge-creative-logo.png')),
 ]);

 return new ImageResponse(
  <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',background:'#050505',color:'#f0efec',fontFamily:'Space Grotesk',padding:'86px 72px 52px'}}>
   <div style={{display:'flex',alignItems:'center',height:260}}>
    <img src={`data:image/png;base64,${logo.toString('base64')}`} width={1056} height={201} alt="TraceForge Engine"/>
   </div>
   <div style={{display:'flex',marginTop:42,fontSize:46,lineHeight:1.2,letterSpacing:-1.4}}>Token investigation. Wallet tracing.</div>
   <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:'auto',fontSize:21,color:'#a6a6a4'}}>
    <span>Holders. Connections. Contract checks.</span>
    <span style={{color:'#f0efec'}}>traceengine.tech</span>
   </div>
  </div>,
  {...size,fonts:[{name:'Space Grotesk',data:new Uint8Array(regular).buffer,weight:400,style:'normal'}]},
 );
}
