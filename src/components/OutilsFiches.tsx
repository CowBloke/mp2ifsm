"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { creerPaquet } from "@/lib/actions-fiches";
import { ChoixMatiere } from "@/components/Matiere";
import { NouveauDossier } from "@/components/NouveauDossier";
import { Dialogue } from "@/components/Dialogue";
import type { OptionDestination } from "@/lib/arbre-dossiers";

type Matieres = Array<{ id: number; nom: string }>;

const TITRES = {
  choix: "Créer", creer: "Nouveau paquet", dossier: "Nouveau dossier", importer: "Importer depuis Anki",
} as const;

/**
 * En-tête de la page Fiches : le titre et un seul bouton « + », qui
 * ouvre une fenêtre pour créer un paquet, un dossier, ou importer.
 */
export function OutilsPaquets({
  matieres, dossiers,
}: { matieres: Matieres; dossiers: OptionDestination[] }) {
  const [vue, setVue] = useState<null | keyof typeof TITRES>(null);
  const fermer = () => setVue(null);

  return (
    <>
      <header className="page-heading">
        <h1>Fiches</h1>
        <button type="button" className="bouton-rond" aria-label="Nouveau paquet, dossier ou import Anki"
                aria-haspopup="dialog" onClick={() => setVue("choix")}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </header>

      {vue && (
        <Dialogue key={vue} titre={TITRES[vue]} onFermer={fermer}>
          {vue === "choix" ? (
            <div className="flex flex-col">
              <button type="button" className="ligne ligne__titre w-full text-left" onClick={() => setVue("creer")}>Nouveau paquet</button>
              <button type="button" className="ligne ligne__titre w-full text-left" onClick={() => setVue("dossier")}>Nouveau dossier</button>
              <button type="button" className="ligne ligne__titre w-full text-left" onClick={() => setVue("importer")}>Importer depuis Anki</button>
            </div>
          ) : vue === "creer" ? <FormulairePaquet matieres={matieres} dossiers={dossiers} onFini={fermer} />
            : vue === "importer" ? <FormulaireImport matieres={matieres} dossiers={dossiers} onFini={fermer} />
            : <NouveauDossier kind="deck" parents={dossiers} matieres={matieres} onFini={fermer} />}
        </Dialogue>
      )}
    </>
  );
}

/**
 * Matière + chapitre, et le dossier où ranger le paquet. Dans un
 * dossier, la matière est celle du dossier : le menu est donc masqué.
 */
function ChampsClassement({ matieres, dossiers }: { matieres: Matieres; dossiers: OptionDestination[] }) {
  const [dossier, setDossier] = useState("");
  return (
    <div className="flex flex-col gap-2">
      {dossiers.length > 1 && <label className="flex flex-col gap-1.5 text-[13px] text-[var(--muted-foreground)]">
        Dossier
        <select name="dossier" value={dossier} onChange={(e) => setDossier(e.target.value)}
                className="min-h-12 px-3 text-[var(--foreground)]">
          {dossiers.map((o) => (
            <option key={o.id ?? "aucun"} value={o.id ?? ""}>
              {"\u2003".repeat(Math.max(0, o.niveau - 1))}{o.libelle}
            </option>
          ))}
        </select>
      </label>}
      <div className={`grid gap-2 ${dossier === "" ? "grid-cols-2" : ""}`}>
        {dossier === "" && <ChoixMatiere matieres={matieres} />}
        <input name="chapitre" required maxLength={120}
               placeholder="Chapitre"
               className="rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                          outline-none focus:border-[var(--ring)]" />
      </div>
    </div>
  );
}

function FormulairePaquet({
  matieres, dossiers, onFini,
}: { matieres: Matieres; dossiers: OptionDestination[]; onFini: () => void }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  return (
    <form
      action={(fd) => {
        setErreur(null);
        demarrer(async () => {
          const r = await creerPaquet(fd);
          if (r.ok) { onFini(); router.push(`/fiches/${r.data.slug}`); }
          else setErreur(r.erreur);
        });
      }}
      className="space-y-2"
    >
      <input name="titre" required minLength={2} maxLength={120}
             placeholder="Titre"
             className="w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                        outline-none focus:border-[var(--ring)]" />
      <ChampsClassement matieres={matieres} dossiers={dossiers} />
      {erreur && <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}
      <Boutons enCours={enCours} onAnnuler={onFini} label="Créer" />
    </form>
  );
}

function FormulaireImport({
  matieres, dossiers, onFini,
}: { matieres: Matieres; dossiers: OptionDestination[]; onFini: () => void }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(fd: FormData) {
    setErreur(null);
    setEnCours(true);
    try {
      // Passe par une route plutôt qu'une action serveur : un .apkg
      // peut peser plusieurs dizaines de Mo.
      const res = await fetch("/api/fiches/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setErreur(data.erreur ?? "Import impossible"); return; }
      onFini();
      router.push(`/fiches/${data.slug}`);
    } catch {
      setErreur("Import impossible — vérifiez le fichier");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form action={envoyer} className="space-y-2">
      <input type="file" name="apkg" accept=".apkg" required
             className="w-full text-[13px] file:mr-3 file:rounded-[var(--radius-sm)]
                        file:border-0 file:bg-[var(--secondary)] file:px-3 file:py-1.5
                        file:text-[13px] file:font-medium" />
      <ChampsClassement matieres={matieres} dossiers={dossiers} />
      <input name="titre" maxLength={120} placeholder="Titre (facultatif)"
             className="w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                        outline-none focus:border-[var(--ring)]" />
      {erreur && <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}
      <Boutons enCours={enCours} onAnnuler={onFini} label="Importer" />
    </form>
  );
}

function Boutons({
  enCours, onAnnuler, label,
}: { enCours: boolean; onAnnuler: () => void; label: string }) {
  return (
    <div className="flex gap-2 pt-1">
      <button type="button" onClick={onAnnuler}
              className="rounded-[var(--radius-md)] border px-4 py-2.5 text-[14px] font-medium">
        Annuler
      </button>
      <button type="submit" disabled={enCours}
              className="flex-1 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2.5
                         text-[14px] font-semibold text-[var(--primary-foreground)]
                         disabled:opacity-50">
        {enCours ? "…" : label}
      </button>
    </div>
  );
}
