"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiverRetour, traiterRetour } from "@/lib/actions-retours";
import { CATEGORIES_RETOUR, NOM_CATEGORIE, NOM_STATUT, STATUTS_RETOUR } from "@/lib/constantes";
import type { Retour } from "@/lib/retours";


/* Statuts : icône + libellé, jamais la couleur seule. */
const STYLE_STATUT: Record<string, { signe: string; couleur: string }> = {
  ouvert: { signe: "○", couleur: "var(--outcome-3)" },
  prevu: { signe: "◐", couleur: "var(--outcome-4)" },
  refuse: { signe: "✕", couleur: "var(--outcome-2)" },
  termine: { signe: "✓", couleur: "var(--outcome-1)" },
};

export function BadgeStatut({ statut }: { statut: string }) {
  const s = STYLE_STATUT[statut] ?? STYLE_STATUT.ouvert;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ color: s.couleur, background: `color-mix(in oklab, ${s.couleur} 14%, transparent)` }}>
      <span aria-hidden>{s.signe}</span>{NOM_STATUT[statut] ?? statut}
    </span>
  );
}

export function AdminRetours({ retours }: { retours: Retour[] }) {
  const [statut, setStatut] = useState("actifs");
  const [categorie, setCategorie] = useState("");
  const [archives, setArchives] = useState(false);

  const visibles = useMemo(() => retours.filter((r) =>
    (archives ? r.archived_at !== null : r.archived_at === null)
    && (categorie === "" || r.categorie === categorie)
    && (statut === "" || (statut === "actifs" ? r.statut === "ouvert" || r.statut === "prevu" : r.statut === statut)),
  ), [retours, statut, categorie, archives]);

  const ouverts = retours.filter((r) => r.archived_at === null && r.statut === "ouvert").length;
  const select = "rounded-[var(--radius-md)] border px-2 py-1.5 text-sm";

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted-foreground)]">
        {ouverts} retour{ouverts > 1 ? "s" : ""} ouvert{ouverts > 1 ? "s" : ""}. Les membres voient le
        statut et votre réponse dans leur profil.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm">Statut{" "}
          <select value={statut} onChange={(e) => setStatut(e.target.value)} className={select}>
            <option value="actifs">Ouverts et prévus</option>
            <option value="">Tous</option>
            {STATUTS_RETOUR.map((s) => <option key={s.cle} value={s.cle}>{s.nom}</option>)}
          </select>
        </label>
        <label className="text-sm">Catégorie{" "}
          <select value={categorie} onChange={(e) => setCategorie(e.target.value)} className={select}>
            <option value="">Toutes</option>
            {CATEGORIES_RETOUR.map((c) => <option key={c.cle} value={c.cle}>{c.nom}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={archives} onChange={(e) => setArchives(e.target.checked)} />
          Archivés
        </label>
      </div>

      {visibles.length === 0 && (
        <p className="rounded-lg border border-dashed p-5 text-sm text-[var(--muted-foreground)]">
          Aucun retour pour ces filtres.
        </p>
      )}
      {visibles.map((r) => <CarteRetourAdmin key={r.id} r={r} />)}
    </div>
  );
}

function CarteRetourAdmin({ r }: { r: Retour }) {
  const router = useRouter();
  const [statut, setStatut] = useState<string>(r.statut);
  const [reponse, setReponse] = useState(r.reponse);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const modifie = statut !== r.statut || reponse.trim() !== r.reponse;

  function lancer(action: () => Promise<{ ok: boolean; erreur?: string }>, succes: string) {
    setMessage(null);
    demarrer(async () => {
      const res = await action();
      setMessage(res.ok ? succes : (res.erreur ?? "Erreur"));
      if (res.ok) router.refresh();
    });
  }

  return (
    <article className="rounded-lg border bg-[var(--card)] p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
        <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 font-semibold text-[var(--foreground)]">
          {NOM_CATEGORIE[r.categorie]}
        </span>
        <BadgeStatut statut={r.statut} />
        <span>{r.auteur}</span>
        <span>· {new Date(r.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}</span>
        {r.page && <span className="break-all">· {r.page}</span>}
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{r.message}</p>
      <div className="mt-3 space-y-2 border-t pt-2">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Statut">
          {STATUTS_RETOUR.map((s) => (
            <button key={s.cle} type="button" role="radio" aria-checked={statut === s.cle}
                    onClick={() => setStatut(s.cle)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${statut === s.cle ? "bg-[var(--secondary)] font-semibold" : ""}`}>
              {s.nom}
            </button>
          ))}
        </div>
        <textarea value={reponse} onChange={(e) => setReponse(e.target.value)} maxLength={1000} rows={2}
                  placeholder="Réponse visible par l’auteur (facultatif)" aria-label="Réponse"
                  className="w-full rounded-lg border p-2 text-sm" />
        <div className="flex gap-2">
          <button type="button" disabled={enCours || !modifie}
                  onClick={() => lancer(() => traiterRetour(r.id, statut, reponse), "Retour mis à jour")}
                  className="rounded-[var(--radius-md)] bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold
                             text-[var(--primary-foreground)] disabled:opacity-40">
            Enregistrer
          </button>
          <button type="button" disabled={enCours}
                  onClick={() => lancer(() => archiverRetour(r.id, r.archived_at === null),
                    r.archived_at === null ? "Retour archivé" : "Retour désarchivé")}
                  className="rounded-[var(--radius-md)] border px-3 py-1.5 text-sm">
            {r.archived_at === null ? "Archiver" : "Désarchiver"}
          </button>
        </div>
        {message && <p role="status" className="text-sm">{message}</p>}
      </div>
    </article>
  );
}
