"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { examinerProposition, revoquerSessions } from "@/lib/actions-admin";
import type { Proposal } from "@/lib/proposals";
export type AdminUser = { id: string; display_name: string; email: string; role: string; created_at: string; sessions: number };
const button = 'rounded-[var(--radius-md)] border px-3 py-2 text-sm disabled:opacity-50';
export function AdminPanel({ users, proposals, currentId, children }: { users: AdminUser[]; proposals: Proposal[]; currentId: string; children: React.ReactNode }) {
 const [tab,setTab] = useState('proposals');
 const [search,setSearch] = useState('');
 const [message,setMessage] = useState('');
 const [busy,start] = useTransition();
 const router = useRouter();
 const pending = proposals.filter(p=>p.status==='pending').length;
 return <section className="space-y-4">
  <h2 className="text-xl font-bold">Administration</h2>
  <div className="grid grid-cols-3 gap-2 text-center text-sm">{[[users.length,'Comptes'],[pending,'À valider'],[users.filter(u=>u.role==='admin').length,'Admins']].map(([n,label])=><div key={label} className="rounded-lg border bg-[var(--card)] p-3"><strong className="block text-xl">{n}</strong>{label}</div>)}</div>
  <nav aria-label="Administration" className="flex flex-wrap gap-2">{[['proposals',`Propositions (${pending})`],['users','Utilisateurs'],['markets','Marchés & comptes']].map(([key,label])=><button key={key} className={`${button} ${tab===key?'bg-[var(--secondary)] text-[var(--secondary-foreground)]':''}`} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</nav>
  {tab==='proposals' && <ProposalList items={proposals} admin />}
  {tab==='users' && <div className="space-y-3">
   <label className="block text-sm">Rechercher un compte<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pseudo ou adresse e-mail" className="mt-1 w-full rounded-lg border p-3" /></label>
   <p className="text-sm text-[var(--muted-foreground)]">{users.length} comptes inscrits · Déconnecter ferme les sessions ; le membre pourra se reconnecter.</p>
   {users.filter(u=>`${u.display_name} ${u.email}`.toLowerCase().includes(search.toLowerCase())).map(u=><article key={u.id} className="rounded-lg border bg-[var(--card)] p-3">
    <div className="flex justify-between gap-2"><strong className="break-all">{u.display_name}</strong><span className="text-xs">{u.role==='admin'?'Administrateur':'Membre'}</span></div>
    <p className="break-all text-sm">{u.email}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">Inscrit le {new Date(u.created_at).toLocaleDateString('fr-FR')} · {u.sessions} session(s) active(s)</p>
    {u.id!==currentId && u.sessions>0 && <button className={`${button} mt-2`} disabled={busy} onClick={()=>{
     if (!confirm(`Déconnecter toutes les sessions de ${u.display_name} ?`)) return;
     start(async()=>{const r=await revoquerSessions(u.id);setMessage(r.ok?'Sessions déconnectées':r.erreur);if(r.ok)router.refresh();});
    }}>Déconnecter les sessions</button>}
   </article>)}
   {!users.some(u=>`${u.display_name} ${u.email}`.toLowerCase().includes(search.toLowerCase())) && <p>Aucun compte trouvé.</p>}
   {message && <p role="status">{message}</p>}
  </div>}
  {tab==='markets' && children}
 </section>;
}
export function ProposalList({ items, admin=false }: { items: Proposal[]; admin?: boolean }) {
 return <div className="space-y-3">{!items.length && <p className="rounded-lg border border-dashed p-5 text-sm text-[var(--muted-foreground)]">Aucune proposition pour l’instant.</p>}{items.map(p=><ProposalCard key={p.id} p={p} admin={admin}/>)}</div>;
}
function ProposalCard({p,admin}:{p:Proposal;admin:boolean}) {
 const [note,setNote]=useState('');const [message,setMessage]=useState('');const [busy,start]=useTransition();const router=useRouter();
 function review(approve:boolean){start(async()=>{const r=await examinerProposition(p.id,approve,note);setMessage(r.ok?(approve?'Pari publié':'Proposition refusée'):r.erreur);if(r.ok)router.refresh();});}
 return <article className="rounded-lg border bg-[var(--card)] p-4">
  <p className="text-xs text-[var(--muted-foreground)]">{p.status==='pending'?'En attente':p.status==='approved'?'Approuvée':'Refusée'}{admin?` · ${p.display_name}`:''}</p>
  <h3 className="mt-1 break-words font-semibold">{p.question}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm">{p.description}</p>
  <p className="mt-2 text-sm">{p.issues.join(' / ')}</p><p className="mt-1 text-xs">Fermeture : {new Date(p.closes_at).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})} (Paris)</p>
  {p.review_note && <p className="mt-2 text-sm">Réponse : {p.review_note}</p>}
  {p.slug && <Link href={`/marche/${p.slug}`} className="mt-2 inline-block text-sm underline">Voir le pari →</Link>}
  {admin && p.status==='pending' && <div className="mt-3 space-y-2"><label className="block text-sm">Message au proposant (facultatif)<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border p-2"/></label><div className="flex gap-2"><button className={`${button} bg-[var(--primary)] text-[var(--primary-foreground)]`} disabled={busy} onClick={()=>review(true)}>Approuver et publier</button><button className={button} disabled={busy} onClick={()=>review(false)}>Refuser</button></div></div>}
  {message && <p className="mt-2 text-sm" role="status">{message}</p>}
 </article>;
}
