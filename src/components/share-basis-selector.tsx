import type {MapShareBasis} from '@/lib/holder-map-basis';
import './share-basis-selector.css';

export default function ShareBasisSelector({value,onChange,floatAvailable,describedBy,label='Percentage basis'}:{value:MapShareBasis;onChange:(basis:MapShareBasis)=>void;floatAvailable:boolean;describedBy?:string;label?:string}){
 return <div className="share-basis-selector" role="group" aria-label={label}><button type="button" aria-pressed={value==='float'} aria-describedby={describedBy} disabled={!floatAvailable} onClick={()=>onChange('float')}>Snapshot float</button><button type="button" aria-pressed={value==='total'} onClick={()=>onChange('total')}>Total supply</button></div>;
}
