import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

export type HistoryStatus='queued'|'running'|'paused'|'complete'|'blocked';
export type HistoryChain='ethereum'|'base'|'solana';
export type HistoryPool={pool:string;status:HistoryStatus;checkpoint:unknown;result:unknown;message:string;updatedAt:string};
export type HistoryJob={id:string;chain:HistoryChain;token:string;status:HistoryStatus;createdAt:string;updatedAt:string;revision:number;message:string;poolLimit:number;progress:unknown;result:unknown;leaseExpiresAt:number|null;pools:HistoryPool[];counts:Record<HistoryStatus,number>};
export type HistoryJobPatch={status?:HistoryStatus;message?:string;progress?:unknown;result?:unknown};
export type HistoryPoolPatch={pool:string;status:HistoryStatus;checkpoint?:unknown;result?:unknown;message?:string};
type Row=Record<string,unknown>;
const statuses:HistoryStatus[]=['queued','running','paused','complete','blocked'];
const fail=(message:string):never=>{throw new Error(`History store: ${message}`);};
function chainValue(chain:string):HistoryChain{if(!['ethereum','base','solana'].includes(chain))return fail('unsupported chain');return chain as HistoryChain;}
function identifier(chain:HistoryChain,value:string){if(typeof value!=='string'||!value.trim()||value.length>256||/[\x00-\x20]/.test(value.trim()))return fail('invalid identifier');return chain==='solana'?value.trim():value.trim().toLowerCase();}
export function historyJobId(chain:HistoryChain,token:string){chainValue(chain);return createHash('sha256').update(`${chain}:${identifier(chain,token)}`).digest('hex');}
function text(value:unknown,max=2000):string{if(typeof value!=='string'||value.length>max)return fail('invalid message');return value;}
function status(value:unknown):HistoryStatus{if(!statuses.includes(value as HistoryStatus))return fail('invalid status');return value as HistoryStatus;}
function encode(value:unknown):string{
 const seen=new Set<object>();
 const visit=(v:unknown,depth:number):void=>{
  if(depth>100)return fail('JSON nesting limit');
  if(v===null||typeof v==='string'||typeof v==='boolean')return;
  if(typeof v==='number'&&Number.isFinite(v))return;
  if(typeof v!=='object'||!v||seen.has(v))return fail('invalid JSON value');
  if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)return fail('JSON must contain plain objects');
  seen.add(v);for(const [key,item] of Object.entries(v)){
   if(/^(api[-_]?key|authorization|cookie|password|secret|access[-_]?token|refresh[-_]?token|rpc[-_]?url|credentials)$/i.test(key))return fail('credential fields must not be persisted');
   visit(item,depth+1);
  }seen.delete(v);
 };
 visit(value,0);const json=JSON.stringify(value);if(Buffer.byteLength(json)>8*1024*1024)return fail('JSON exceeds 8 MiB limit');return json;
}
function decode(value:unknown):unknown{try{if(typeof value!=='string')throw Error();const parsed:unknown=JSON.parse(value);encode(parsed);return parsed;}catch{return fail('corrupt persisted JSON; checkpoint was not resumed');}}

/** Synchronous, server-only durable checkpoints. No background work is started.
 * Caller supplies a private local file path and nonsecret chain evidence only.
 * node:sqlite API: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
 * Lease tokens fence writers; every mutation advances the job revision.
 */
export class HistoryStore{
 private readonly db:DatabaseSync;private readonly now:()=>number;private readonly maxJobs:number;
 constructor(filePath:string,options:{now?:()=>number;maxJobs?:number}={}){
  if(typeof window!=='undefined')throw new Error('History store: server-only');
  if(!filePath||filePath===':memory:')throw new Error('History store: a durable database file path is required');
  this.now=options.now||Date.now;this.maxJobs=options.maxJobs??100;
  if(!Number.isSafeInteger(this.maxJobs)||this.maxJobs<1||this.maxJobs>1000)throw new Error('History store: invalid capacity');
  const path=resolve(filePath);mkdirSync(dirname(path),{recursive:true,mode:0o700});
  this.db=new DatabaseSync(path,{timeout:1000,enableForeignKeyConstraints:true,allowExtension:false});
  try{
   const version=Number(this.db.prepare('PRAGMA user_version').get()?.user_version);
   if(version!==0&&version!==1)fail('unsupported schema version');
   this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS history_jobs(id TEXT PRIMARY KEY,chain TEXT NOT NULL,token TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('queued','running','paused','complete','blocked')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,revision INTEGER NOT NULL,pool_limit INTEGER NOT NULL,message TEXT NOT NULL,progress_json TEXT NOT NULL,result_json TEXT NOT NULL,lease_token TEXT,lease_expires_at INTEGER);
    CREATE TABLE IF NOT EXISTS history_pools(job_id TEXT NOT NULL REFERENCES history_jobs(id) ON DELETE CASCADE,pool TEXT NOT NULL,ordinal INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('queued','running','paused','complete','blocked')),checkpoint_json TEXT NOT NULL,result_json TEXT NOT NULL,message TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(job_id,pool));
    PRAGMA user_version=1;`);
   this.recoverExpired();
  }catch(error){this.db.close();throw error;}
 }
 close(){this.db.close();}
 private transaction<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
 private readSnapshot<T>(fn:()=>T):T{if(this.db.isTransaction)return fn();this.db.exec('BEGIN');try{const result=fn();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
 private stamp(){return new Date(this.now()).toISOString();}
 private row(id:string):Row|null{return this.db.prepare('SELECT * FROM history_jobs WHERE id=?').get(id) as Row|undefined||null;}
 private required(id:string):HistoryJob{return this.get(id)||fail('job not found');}
 get(id:string):HistoryJob|null{return this.readSnapshot(()=>this.readJob(id));}
 private readJob(id:string):HistoryJob|null{
  const row=this.row(id);if(!row)return null;
  const pools=this.db.prepare('SELECT * FROM history_pools WHERE job_id=? ORDER BY ordinal').all(id).map((r):HistoryPool=>({pool:String(r.pool),status:status(r.status),checkpoint:decode(r.checkpoint_json),result:decode(r.result_json),message:String(r.message),updatedAt:String(r.updated_at)}));
  const counts={queued:0,running:0,paused:0,complete:0,blocked:0};for(const pool of pools)counts[pool.status]++;
  return {id:String(row.id),chain:chainValue(String(row.chain)),token:String(row.token),status:status(row.status),createdAt:String(row.created_at),updatedAt:String(row.updated_at),revision:Number(row.revision),message:String(row.message),poolLimit:Number(row.pool_limit),progress:decode(row.progress_json),result:decode(row.result_json),leaseExpiresAt:row.lease_expires_at===null?null:Number(row.lease_expires_at),pools,counts};
 }
 list():HistoryJob[]{return this.readSnapshot(()=>this.db.prepare('SELECT id FROM history_jobs ORDER BY updated_at DESC,id').all().map(row=>this.required(String(row.id))));}
 create(input:{chain:HistoryChain;token:string;pools:string[];expanded?:boolean}):HistoryJob{
  const chain=chainValue(input.chain),token=identifier(chain,input.token),id=historyJobId(chain,token),limit=input.expanded?100:20,pools=this.normalizePools(chain,input.pools,limit);
  return this.transaction(()=>{
   const existing=this.get(id);if(existing)return existing;
   const count=Number(this.db.prepare('SELECT COUNT(*) AS n FROM history_jobs').get()?.n);
   if(count>=this.maxJobs){const oldest=this.db.prepare("SELECT id FROM history_jobs WHERE status='complete' ORDER BY updated_at,id LIMIT ?").all(count-this.maxJobs+1);if(oldest.length<count-this.maxJobs+1)fail('capacity reached; active or paused jobs will not be deleted');for(const row of oldest)this.db.prepare('DELETE FROM history_jobs WHERE id=?').run(String(row.id));}
   const at=this.stamp();this.db.prepare("INSERT INTO history_jobs VALUES(?,?,?,'queued',?,?,0,?,'','null','null',NULL,NULL)").run(id,chain,token,at,at,limit);
   this.insertPools(id,pools,0,at);return this.required(id);
  });
 }
 private normalizePools(chain:HistoryChain,pools:string[],limit:number){if(!Array.isArray(pools))return fail('invalid pools');const result=[...new Set(pools.map(pool=>identifier(chain,pool)))];if(result.length>limit)return fail(`pool limit ${limit} exceeded`);return result;}
 private insertPools(id:string,pools:string[],offset:number,at:string){const insert=this.db.prepare("INSERT INTO history_pools VALUES(?,?,?,'queued','null','null','',?)");pools.forEach((pool,i)=>insert.run(id,pool,offset+i,at));}
 private revision(job:HistoryJob,expected:number){if(job.revision!==expected)fail('revision conflict; reload job');}
 private lease(job:HistoryJob,token:string){const row=this.row(job.id)!;if(job.status!=='running'||row.lease_token!==token||job.leaseExpiresAt===null||job.leaseExpiresAt<=this.now())fail('lease expired or not owned');}
 private ttl(ms:number){if(!Number.isSafeInteger(ms)||ms<1000||ms>300000)fail('lease duration must be 1000..300000 milliseconds');return ms;}
 addPools(id:string,revision:number,pools:string[],expanded=false):HistoryJob{return this.transaction(()=>{
  const job=this.required(id);this.revision(job,revision);if(job.status==='running')fail('pause the job before changing pool scope');const limit=expanded?100:job.poolLimit;
  const all=this.normalizePools(job.chain,[...job.pools.map(pool=>pool.pool),...pools],limit),added=all.filter(pool=>!job.pools.some(old=>old.pool===pool));if(!added.length&&limit===job.poolLimit)return job;
  const at=this.stamp();this.insertPools(id,added,job.pools.length,at);this.db.prepare("UPDATE history_jobs SET pool_limit=?,status='queued',updated_at=?,revision=revision+1 WHERE id=?").run(limit,at,id);return this.required(id);
 });}
 acquire(id:string,leaseMs=60000):{job:HistoryJob;token:string}|null{return this.transaction(()=>{
  const job=this.required(id);if(job.status!=='queued')return null;const token=randomUUID(),expiry=this.now()+this.ttl(leaseMs);
  this.db.prepare("UPDATE history_jobs SET status='running',lease_token=?,lease_expires_at=?,updated_at=?,revision=revision+1 WHERE id=?").run(token,expiry,this.stamp(),id);return {job:this.required(id),token};
 });}
 private patch(id:string,job:HistoryJob,patch:HistoryJobPatch){
  const next=status(patch.status??job.status);if(next==='queued')fail('a worker must release or pause instead of queueing itself');
  if(next==='complete'&&this.required(id).pools.some(pool=>pool.status!=='complete'))fail('cannot complete a job with unfinished pools');
  this.db.prepare('UPDATE history_jobs SET status=?,message=?,progress_json=?,result_json=?,updated_at=?,revision=revision+1,lease_token=CASE WHEN ? THEN lease_token ELSE NULL END,lease_expires_at=CASE WHEN ? THEN lease_expires_at ELSE NULL END WHERE id=?').run(next,patch.message===undefined?job.message:text(patch.message),encode(patch.progress===undefined?job.progress:patch.progress),encode(patch.result===undefined?job.result:patch.result),this.stamp(),next==='running'?1:0,next==='running'?1:0,id);
 }
 saveJob(id:string,token:string,revision:number,patch:HistoryJobPatch):HistoryJob{return this.transaction(()=>{const job=this.required(id);this.revision(job,revision);this.lease(job,token);this.patch(id,job,patch);return this.required(id);});}
 updateDiscovery(id:string,revision:number,discovery:unknown):HistoryJob{return this.transaction(()=>{
  const job=this.required(id);this.revision(job,revision);if(job.status==='running')fail('cannot update discovery while running');
  const previous=job.result&&typeof job.result==='object'&&!Array.isArray(job.result)?job.result as Record<string,unknown>:{};
  const result=encode({...previous,discovery});
  this.db.prepare('UPDATE history_jobs SET result_json=?,updated_at=?,revision=revision+1 WHERE id=?').run(result,this.stamp(),id);return this.required(id);
 });}
 savePool(id:string,token:string,revision:number,pool:HistoryPoolPatch,patch:HistoryJobPatch={}):HistoryJob{return this.transaction(()=>{
  const job=this.required(id);this.revision(job,revision);this.lease(job,token);const key=identifier(job.chain,pool.pool),old=job.pools.find(p=>p.pool===key);if(!old)fail('pool is outside this job scope');
  this.db.prepare('UPDATE history_pools SET status=?,checkpoint_json=?,result_json=?,message=?,updated_at=? WHERE job_id=? AND pool=?').run(status(pool.status),encode(pool.checkpoint===undefined?old!.checkpoint:pool.checkpoint),encode(pool.result===undefined?old!.result:pool.result),pool.message===undefined?old!.message:text(pool.message),this.stamp(),id,key);
  this.patch(id,job,patch);return this.required(id);
 });}
 renew(id:string,token:string,revision:number,leaseMs=60000):HistoryJob{return this.transaction(()=>{const job=this.required(id);this.revision(job,revision);this.lease(job,token);this.db.prepare('UPDATE history_jobs SET lease_expires_at=?,updated_at=?,revision=revision+1 WHERE id=?').run(this.now()+this.ttl(leaseMs),this.stamp(),id);return this.required(id);});}
 release(id:string,token:string,revision:number,next:'paused'|'complete'|'blocked'='paused'):HistoryJob{return this.saveJob(id,token,revision,{status:next});}
 pause(id:string,revision?:number):HistoryJob{return this.transaction(()=>{const job=this.required(id);if(revision!==undefined)this.revision(job,revision);if(job.status==='complete'||job.status==='paused')return job;this.db.prepare("UPDATE history_jobs SET status='paused',lease_token=NULL,lease_expires_at=NULL,updated_at=?,revision=revision+1 WHERE id=?").run(this.stamp(),id);return this.required(id);});}
 resume(id:string,revision?:number,options:{recheckComplete?:boolean}={}):HistoryJob{return this.transaction(()=>{const job=this.required(id);if(revision!==undefined)this.revision(job,revision);if(job.status==='running')fail('job already running');if((job.status==='complete'&&!options.recheckComplete)||job.status==='queued')return job;this.db.prepare("UPDATE history_jobs SET status='queued',lease_token=NULL,lease_expires_at=NULL,updated_at=?,revision=revision+1 WHERE id=?").run(this.stamp(),id);return this.required(id);});}
 recoverExpired():number{return this.transaction(()=>Number(this.db.prepare("UPDATE history_jobs SET status='paused',lease_token=NULL,lease_expires_at=NULL,updated_at=?,revision=revision+1,message='Interrupted run: expired lease; resume to continue from saved checkpoints.' WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at<=?)").run(this.stamp(),this.now()).changes));}
}
