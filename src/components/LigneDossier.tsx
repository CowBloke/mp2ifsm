"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  creerDossier, deplacerDossier, modifierDossier, supprimerDossier,
} from "@/lib/actions-dossiers";
import type { GestionDossier } from "@/lib/arbre-dossiers";
import { IconeDossier } from "./IconeDossier";
import { styleMatiere } from "./Matiere";

/*
 * Une ligne de dossier. Deux formes :
 *  - `href` : le dossier est une page (Documents), la ligne est un lien ;
 *  - sinon un accordéon (Fiches) dont `children` est le contenu.
 * Le bouton « … » ouvre le panneau de gestion, quel que soit le mode.
 */
export function LigneDossier({
  nom, meta, badge, couleur, href, defautOuvert = false, gestion, children,
}: {
  nom: string;
  meta?: string;
  badge?: React.ReactNode;
  couleur?: string | null;
  href?: string;
  defautOuvert?: boolean;
  gestion?: GestionDossier;
  children?: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(defautOuvert);
  const [gerer, setGerer] = useState(false);
  const peutGerer = gestion && (gestion.peutModifier || gestion.peutCreerEnfant);

  const corps = (
    <>
      <span aria-hidden="true" style={couleur === undefined ? undefined : styleMatiere(couleur)}
            className="m-texte grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--muted)]">
        <IconeDossier />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="truncate text-[16px] font-medium">{nom}</span>
        {meta && <span className="truncate text-[13px] text-[var(--muted-foreground)]">{meta}</span>}
      </span>
      {badge}
      {!href && (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
             className={`shrink-0 text-[var(--muted-foreground)] transition-transform ${ouvert ? "rotate-90" : ""}`}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      )}
    </>
  );

  return (
    <li className="border-b last:border-b-0">
      <div className="flex min-h-16 items-center gap-1">
        {href ? (
          <Link href={href} className="flex min-w-0 flex-1 items-center gap-3.5 py-2">{corps}</Link>
        ) : (
          <button type="button" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}
                  className="flex min-w-0 flex-1 items-center gap-3.5 py-2">{corps}</button>
        )}
        {peutGerer && (
          <button type="button" aria-expanded={gerer} aria-label={`Gérer le dossier ${nom}`}
                  onClick={() => setGerer(!gerer)}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full
                             text-[var(--muted-foreground)] hover:bg-[var(--muted)]">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
        )}
      </div>

      {gerer && gestion && <PanneauDossier g={gestion} onFermer={() => setGerer(false)} />}

      {!href && ouvert && (
        <ul className="ml-[18px] border-l pl-3">{children}</ul>
      )}
    </li>
  );
}

export function PanneauDossier({
  g, onFermer, decale = true,
}: { g: GestionDossier; onFermer: () => void; decale?: boolean }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const [nom, setNom] = useState(g.nom);
  const [matiere, setMatiere] = useState(g.subjectId === null ? "" : String(g.subjectId));
  const [enfant, setEnfant] = useState("");

  function lancer(fn: () => Promise<{ ok: boolean; erreur?: string }>, fermer = false) {
    setErreur(null);
    demarrer(async () => {
      const r = await fn();
      if (r.ok) { if (fermer) onFermer(); router.refresh(); } else setErreur(r.erreur ?? "Échec");
    });
  }

  return (
    <div className={`mb-3 flex flex-col gap-3 text-[14px] ${decale ? "ml-[50px]" : ""}`}>
      {g.peutModifier && (
        <form className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                lancer(() => modifierDossier(g.id, nom, g.racine ? matiere : undefined), true);
              }}>
          <label className="text-[13px] text-[var(--muted-foreground)]" htmlFor={`nom-${g.id}`}>Nom</label>
          <div className="flex gap-2">
            <input id={`nom-${g.id}`} value={nom} onChange={(e) => setNom(e.target.value)}
                   maxLength={60} required className="champ min-w-0 flex-1" />
            <button type="submit" disabled={enCours || !nom.trim()} className="puce h-12 disabled:opacity-50">
              Enregistrer
            </button>
          </div>
          {g.racine && (
            <select value={matiere} onChange={(e) => setMatiere(e.target.value)} aria-label="Matière"
                    className="min-h-12 px-3">
              <option value="">Sans matière</option>
              {g.matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          )}
        </form>
      )}

      {g.peutModifier && (
        <label className="flex flex-col gap-2 text-[13px] text-[var(--muted-foreground)]">
          Déplacer vers
          <select defaultValue={g.parentId === null ? "" : String(g.parentId)}
                  disabled={enCours} className="min-h-12 px-3 text-[var(--foreground)]"
                  onChange={(e) => lancer(() =>
                    deplacerDossier(g.id, e.target.value === "" ? null : Number(e.target.value)), true)}>
            {g.destinations.map((d) => (
              <option key={d.id ?? "racine"} value={d.id ?? ""}>
                {" ".repeat(Math.max(0, d.niveau - 1))}{d.libelle}
              </option>
            ))}
          </select>
        </label>
      )}

      {g.peutCreerEnfant && (
        <form className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                lancer(async () => {
                  const r = await creerDossier(g.kind, g.id, enfant);
                  if (r.ok) setEnfant("");
                  return r;
                });
              }}>
          <input value={enfant} onChange={(e) => setEnfant(e.target.value)} maxLength={60}
                 placeholder="Nouveau sous-dossier" aria-label="Nom du sous-dossier"
                 className="champ min-w-0 flex-1" />
          <button type="submit" disabled={enCours || !enfant.trim()} className="puce h-12 disabled:opacity-50">
            Créer
          </button>
        </form>
      )}

      {g.peutModifier && (
        <button type="button" disabled={enCours}
                className="lien-discret self-start text-[var(--destructive)]"
                onClick={() => {
                  if (!window.confirm(
                    `Supprimer le dossier « ${g.nom} » ?\n\n` +
                    "Son contenu n’est pas supprimé : il remonte d’un niveau.")) return;
                  lancer(() => supprimerDossier(g.id), true);
                }}>
          Supprimer le dossier
        </button>
      )}

      {erreur && <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}
    </div>
  );
}
