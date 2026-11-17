"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deciderInscription } from "@/lib/actions-admin";
import type { Inscription } from "@/lib/inscriptions";

const bouton = 'rounded-[var(--radius-md)] border px-3 py-2 text-sm disabled:opacity-50';

/*
 * File des inscriptions : chaque nouveau compte attend qu'un administrateur
 * l'accepte. Les comptes liés (même appareil / même IP) signalent les
 * doublons probables.
 */
export function AdminInscriptions({ inscriptions }: { inscriptions: Inscription[] }) {
  const [message, setMessage] = useState('');
  const [voirRefuses, setVoirRefuses] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();
  const attente = inscriptions.filter(i => i.statut === 'en_attente');
  const refuses = inscriptions.filter(i => i.statut === 'refuse');

  function decider(ids: string[], accepter: boolean, confirmation?: string) {
    if (confirmation && !confirm(confirmation)) return;
    start(async () => {
      const r = await deciderInscription(ids, accepter);
      setMessage(r.ok ? `${r.data.n} compte(s) ${accepter ? 'accepté(s)' : 'refusé(s)'}` : r.erreur);
      if (r.ok) router.refresh();
    });
  }

  return <div className="space-y-3">
    <p className="text-sm text-[var(--muted-foreground)]">
      Chaque inscription doit être acceptée avant la première connexion. « Même appareil » : créé ou utilisé
      depuis le même navigateur qu’un autre compte, presque sûrement la même personne. « Même IP » : peut être le wifi du lycée.
    </p>
    {attente.length > 1 && <button className={bouton} disabled={busy}
      onClick={() => decider(attente.map(i => i.id), false, `Refuser les ${attente.length} inscriptions en attente ?`)}>
      Tout refuser ({attente.length})
    </button>}
    {!attente.length && <p className="rounded-lg border border-dashed p-5 text-sm text-[var(--muted-foreground)]">Aucune inscription en attente.</p>}
    {attente.map(i => <Carte key={i.id} i={i} busy={busy} decider={decider} />)}
    {message && <p role="status" className="text-sm">{message}</p>}
    {refuses.length > 0 && <>
      <button className={bouton} onClick={() => setVoirRefuses(!voirRefuses)}>
        {voirRefuses ? 'Masquer' : 'Voir'} les comptes refusés ({refuses.length})
      </button>
      {voirRefuses && refuses.map(i => <Carte key={i.id} i={i} busy={busy} decider={decider} />)}
    </>}
  </div>;
}

function Carte({ i, busy, decider }: { i: Inscription; busy: boolean; decider: (ids: string[], accepter: boolean, c?: string) => void }) {
  const appareil = i.lies.filter(l => l.par.includes('appareil'));
  const ip = i.lies.filter(l => !l.par.includes('appareil'));
  return <article className="rounded-lg border bg-[var(--card)] p-3">
    <div className="flex justify-between gap-2">
      <strong className="break-all">{i.display_name}</strong>
      <span className="text-xs">{i.statut === 'refuse' ? 'Refusé' : 'En attente'}</span>
    </div>
    <p className="break-all text-sm">{i.email}</p>
    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
      Inscrit le {new Date(i.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}{i.ip ? ` · IP ${i.ip}` : ''}
    </p>
    {appareil.length > 0 && <p className="mt-1 text-sm text-[var(--destructive)]">
      Même appareil que : {appareil.map(l => `${l.nom}${l.statut !== 'actif' ? ` (${l.statut === 'refuse' ? 'refusé' : 'en attente'})` : ''}${l.banni ? ' (banni de La Toile)' : ''}`).join(', ')}
    </p>}
    {ip.length > 0 && <p className="mt-1 text-xs text-[var(--muted-foreground)]">
      Même IP que : {ip.slice(0, 12).map(l => l.nom).join(', ')}{ip.length > 12 ? ` et ${ip.length - 12} autre(s)` : ''}
    </p>}
    <div className="mt-2 flex flex-wrap gap-2">
      <button className={`${bouton} bg-[var(--primary)] text-[var(--primary-foreground)]`} disabled={busy}
        onClick={() => decider([i.id], true)}>Accepter</button>
      {i.statut !== 'refuse' && <button className={bouton} disabled={busy} onClick={() => decider([i.id], false)}>Refuser</button>}
    </div>
  </article>;
}
