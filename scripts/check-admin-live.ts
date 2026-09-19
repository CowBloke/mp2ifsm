// Read-only page smoke checks with short-lived sessions; no account or market writes.
import { randomBytes, createHash } from 'node:crypto';
import { pool, query } from '../src/lib/db';
const hashes: Buffer[] = [];
try {
 const users = await query<{id:string;role:string}>("select distinct on (role) id,role from app_user order by role,created_at");
 for (const user of users) {
  const token=randomBytes(32).toString('base64url');
  const hash=createHash('sha256').update(token).digest();hashes.push(hash);
  await query("insert into user_session(token_hash,user_id,expires_at) values($1,$2,now()+interval '5 minutes')",[hash,user.id]);
  for(const path of ['/profil','/profil?onglet=admin','/marche']) {
   const r=await fetch('https://mp2ifsm.com'+path,{headers:{cookie:`mp2_session=${token}`}});
   const body=await r.text();
   if(!r.ok || body.includes('"digest":') || (path==='/marche'&&!body.includes('Proposer un pari')) || (path.includes('onglet')&&user.role==='admin'&&!body.includes('Utilisateurs'))) throw new Error(`Failed ${user.role} ${path}: ${r.status}`);
   console.log(`PASS public ${user.role} ${path}`);
  }
 }
} finally {
 for(const hash of hashes) await query('delete from user_session where token_hash=$1',[hash]);
 await pool.end();
}
