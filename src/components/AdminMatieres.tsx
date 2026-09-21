"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archiverMatiere, creerMatiere, deplacerMatiere, modifierMatiere,
} from "@/lib/actions-matieres";
import { PALETTE, type MatiereVue } from "@/lib/constantes";
import { PastilleMatiere, styleMatiere } from "@/components/Matiere";

/*
 * Matières : ajouter, renommer, colorer, ordonner, archiver.
 * Archiver retire la matière des formulaires de création sans rien
 * changer au contenu existant qui la porte.
 */
export function AdminMatieres({ matieres }: { matieres: MatiereVue[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function lancer(action: () => Promise<{ ok: boolean; erreur?: string }>, succes: string) {
    setMessage(null);
    demarrer(async () => {
      const r = await action();
      setMessage(r.ok ? succes : (r.erreur ?? "Erreur"));
      if (r.ok) router.refresh();
    });
  }

  const actives = matieres.filter((m) => !m.archivee);
  const archivees = matieres.filter((m) => m.archivee);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted-foreground)]">
        La couleur d’une matière s’applique partout : fiches, documents, échéances, colles et
        accueil. Le contenu sans matière s’affiche en gris neutre.
      </p>

      <NouvelleMatiere
        enCours={enCours}
        onCreer={(nom, couleur) => lancer(() => creerMatiere(nom, couleur), "Matière ajoutée")}
      />

      <ul className="space-y-2">
        {actives.map((m, i) => (
          <LigneMatiere
            key={m.id} m={m} enCours={enCours}
            premier={i === 0} dernier={i === actives.length - 1}
            onEnregistrer={(nom, couleur) => lancer(() => modifierMatiere(m.id, nom, couleur), "Matière modifiée")}
            onArchiver={() => {
              if (!confirm(`Archiver « ${m.nom} » ? Le contenu existant la garde ; elle ne sera plus proposée.`)) return;
              lancer(() => archiverMatiere(m.id, true), "Matière archivée");
            }}
            onDeplacer={(sens) => lancer(() => deplacerMatiere(m.id, sens), "Ordre mis à jour")}
          />
        ))}
      </ul>

      {archivees.length > 0 && (
        <section>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Archivées
          </h3>
          <ul className="space-y-1.5">
            {archivees.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                <PastilleMatiere nom={m.nom} couleur={m.couleur} />
                <button type="button" disabled={enCours}
                        onClick={() => lancer(() => archiverMatiere(m.id, false), "Matière restaurée")}
                        className="rounded-[var(--radius-md)] border px-3 py-1.5 text-[12px]">
                  Restaurer
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {message && <p role="status" className="text-sm">{message}</p>}
    </div>
  );
}

function Nuancier({ valeur, onChange, nom }: { valeur: string; onChange: (c: string) => void; nom: string }) {
  return (
    <div role="radiogroup" aria-label={`Couleur de ${nom || "la matière"}`} className="flex flex-wrap gap-1.5">
      {PALETTE.map((p) => (
        <button
          key={p.cle} type="button" role="radio" aria-checked={valeur === p.cle}
          aria-label={p.nom} title={p.nom}
          onClick={() => onChange(p.cle)}
          style={styleMatiere(p.cle)}
          className={`m-plein h-7 w-7 rounded-full transition-transform ${
            valeur === p.cle ? "scale-110 ring-2 ring-[var(--foreground)] ring-offset-2 ring-offset-[var(--card)]" : ""
          }`}
        />
      ))}
    </div>
  );
}

function NouvelleMatiere({
  enCours, onCreer,
}: { enCours: boolean; onCreer: (nom: string, couleur: string) => void }) {
  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState<string>("bleu");
  return (
    <form
      className="space-y-2 rounded-lg border bg-[var(--card)] p-3"
      onSubmit={(e) => { e.preventDefault(); onCreer(nom, couleur); setNom(""); }}
    >
      <h3 className="text-[14px] font-semibold">Nouvelle matière</h3>
      <div className="flex gap-2">
        <input value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={40}
               placeholder="Nom (ex. Informatique)" aria-label="Nom de la matière"
               className="min-w-0 flex-1 rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                          outline-none focus:border-[var(--ring)]" />
        <button type="submit" disabled={enCours || !nom.trim()}
                className="rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 text-[13px] font-semibold
                           text-[var(--primary-foreground)] disabled:opacity-40">
          Ajouter
        </button>
      </div>
      <Nuancier valeur={couleur} onChange={setCouleur} nom={nom} />
      {nom.trim() && <PastilleMatiere nom={nom.trim()} couleur={couleur} />}
    </form>
  );
}

function LigneMatiere({
  m, enCours, premier, dernier, onEnregistrer, onArchiver, onDeplacer,
}: {
  m: MatiereVue; enCours: boolean; premier: boolean; dernier: boolean;
  onEnregistrer: (nom: string, couleur: string) => void;
  onArchiver: () => void;
  onDeplacer: (sens: -1 | 1) => void;
}) {
  const [edition, setEdition] = useState(false);
  const [nom, setNom] = useState(m.nom);
  const [couleur, setCouleur] = useState<string>(m.couleur);

  return (
    <li style={styleMatiere(m.couleur)} className="m-liseret rounded-lg border bg-[var(--card)] py-2 pl-3.5 pr-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><PastilleMatiere nom={m.nom} couleur={m.couleur} /></div>
        <button type="button" disabled={enCours || premier} onClick={() => onDeplacer(-1)}
                aria-label={`Monter ${m.nom}`} className="rounded px-2 py-1 text-[13px] disabled:opacity-30">↑</button>
        <button type="button" disabled={enCours || dernier} onClick={() => onDeplacer(1)}
                aria-label={`Descendre ${m.nom}`} className="rounded px-2 py-1 text-[13px] disabled:opacity-30">↓</button>
        <button type="button" onClick={() => setEdition(!edition)} aria-expanded={edition}
                className="rounded-[var(--radius-md)] border px-2.5 py-1 text-[12px]">
          {edition ? "Fermer" : "Modifier"}
        </button>
      </div>
      {edition && (
        <form
          className="mt-2 space-y-2 border-t pt-2"
          onSubmit={(e) => { e.preventDefault(); onEnregistrer(nom, couleur); setEdition(false); }}
        >
          <input value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={40}
                 aria-label="Nom de la matière"
                 className="w-full rounded-[var(--radius-md)] border-2 px-3 py-1.5 text-[14px]
                            outline-none focus:border-[var(--ring)]" />
          <Nuancier valeur={couleur} onChange={setCouleur} nom={nom} />
          <div className="flex gap-2">
            <button type="submit" disabled={enCours}
                    className="rounded-[var(--radius-md)] bg-[var(--primary)] px-3 py-1.5 text-[13px] font-semibold
                               text-[var(--primary-foreground)]">
              Enregistrer
            </button>
            <button type="button" disabled={enCours} onClick={onArchiver}
                    className="rounded-[var(--radius-md)] border px-3 py-1.5 text-[13px]">
              Archiver
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
