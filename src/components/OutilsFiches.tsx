"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { creerPaquet } from "@/lib/actions-fiches";
import { ChoixMatiere } from "@/components/Matiere";

type Matieres = Array<{ id: number; nom: string }>;

/** Créer un paquet, ou en importer un depuis Anki. */
export function OutilsPaquets({ matieres }: { matieres: Matieres }) {
  const [vue, setVue] = useState<null | "creer" | "importer">(null);

  if (!vue) {
    return (
      <div className="page-toolbar flex gap-2">
        <button type="button" onClick={() => setVue("creer")}
                className="flex-1 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2.5
                           text-[14px] font-semibold text-[var(--primary-foreground)]">
          + Nouveau paquet
        </button>
        <button type="button" onClick={() => setVue("importer")}
                className="flex-1 rounded-[var(--radius-md)] border px-4 py-2.5 text-[14px]
                           font-medium transition-colors hover:bg-[var(--muted)]">
          Importer un .apkg
        </button>
      </div>
    );
  }

  return (
    <div className="app-surface rounded-[var(--radius-lg)] border p-4 lg:p-5">
      {vue === "creer"
        ? <FormulairePaquet matieres={matieres} onFini={() => setVue(null)} />
        : <FormulaireImport matieres={matieres} onFini={() => setVue(null)} />}
    </div>
  );
}

function ChampsClassement({ matieres }: { matieres: Matieres }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <ChoixMatiere matieres={matieres} />
      <input name="chapitre" required maxLength={120}
             placeholder="Chapitre"
             className="rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                        outline-none focus:border-[var(--ring)]" />
    </div>
  );
}

function FormulairePaquet({ matieres, onFini }: { matieres: Matieres; onFini: () => void }) {
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
      <h2 className="text-[15px] font-semibold">Nouveau paquet</h2>
      <input name="titre" required minLength={2} maxLength={120}
             placeholder="Titre (ex. Développements limités)"
             className="w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                        outline-none focus:border-[var(--ring)]" />
      <ChampsClassement matieres={matieres} />
      <textarea name="description" rows={2} maxLength={1000} placeholder="Description (facultatif)"
                className="w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                           outline-none focus:border-[var(--ring)]" />
      {erreur && <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}
      <Boutons enCours={enCours} onAnnuler={onFini} label="Créer" />
    </form>
  );
}

function FormulaireImport({ matieres, onFini }: { matieres: Matieres; onFini: () => void }) {
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
      <h2 className="text-[15px] font-semibold">Importer depuis Anki</h2>
      <input type="file" name="apkg" accept=".apkg" required
             className="w-full text-[13px] file:mr-3 file:rounded-[var(--radius-sm)]
                        file:border-0 file:bg-[var(--secondary)] file:px-3 file:py-1.5
                        file:text-[13px] file:font-medium" />
      <ChampsClassement matieres={matieres} />
      <input name="titre" maxLength={120} placeholder="Titre (sinon celui du paquet Anki)"
             className="w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                        outline-none focus:border-[var(--ring)]" />
      <p className="text-[11px] leading-snug text-[var(--muted-foreground)]">
        Dans Anki, exportez en cochant « Prise en charge des anciennes versions
        d’Anki ». Les images sont importées ; les sons sont ignorés.
      </p>
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
