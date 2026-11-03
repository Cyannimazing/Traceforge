import {walletRoleNames,type RolePresentation} from '@/lib/wallet-role-presentation';
import './wallet-role-summary.css';

export function WalletRolePrimary({role,onExplain,expanded}:{role:RolePresentation;onExplain?:()=>void;expanded?:boolean}){
 return <div className="wallet-role-primary">{onExplain?<button type="button" aria-expanded={expanded} onClick={event=>{event.stopPropagation();onExplain();}}>{role.label}</button>:<strong>{role.label}</strong>}{role.reported&&<small>SwarmEngine-reported</small>}</div>;
}
export function WalletRoleFacts({role}:{role:RolePresentation}){
 return <div className="wallet-role-facts"><p>{role.description}</p>{role.earlyExplanation&&role.earlyExplanation!==role.description&&<p>{role.earlyExplanation}</p>}<ul>{role.roles.filter(value=>value!=='unclassified').map(value=><li key={value}><strong>{value==='pool'&&role.platformCustody?'Platform contract (shared custody)':walletRoleNames[value]}</strong><span>{role.reportedRoles.includes(value)?'SwarmEngine-reported; not independently verified':'Report classification; inspect supporting records'}{value==='authority'?' - current owner / authority; exact powers remain in the evidence. Creator and current control are separate roles.':value==='fresh'?' - limited prior activity under the stated source rule.':value==='accumulator'?' - bought more than sold in the retrieved sample.':value==='insider'?' - a possible association, not proof of buying or ownership.':''}</span></li>)}</ul></div>;
}
export default function WalletRoleSummary({role}:{role:RolePresentation}){
 return <div className="wallet-role-summary"><WalletRolePrimary role={role}/><details><summary>Details</summary><WalletRoleFacts role={role}/></details></div>;
}
