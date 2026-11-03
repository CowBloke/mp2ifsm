"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { modifierPaquet } from "@/lib/actions-fiches";
import { Dialogue } from "./Dialogue";
import { ChoixDossier } from "./ChoixDossier";
import { EditeurCarte } from "./EditeurCarte";
import type { OptionDestination } from "@/lib/arbre-dossiers";

type Onglet = "infos" | "contenu";

const CHAMP = "w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px] outline-none focus:border-[var(--ring)]";

/*
 * Édition d'un paquet par son créateur (ou un admin), dans une seule
 * fenêtre : « Infos » pour le titre, la description, la matière et le
 * dossier ; « Contenu » pour ajouter une carte ou mettre à jour les
 * cartes depuis un nouvel export Anki. Chaque carte reste aussi
 * modifiable dans la liste (« Corriger »).
 */
export function ModifierPaquet({
  paquet, matieres, dossiers,
}: {
  paquet: {
    id: number; titre: string; description: string | null;
    subject_id: number | null; folder_id: number | null; total: number;
  };
  matieres: Array<{ id: number; nom: string; archivee: boolean }>;
  dossiers: OptionDestination[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [onglet, setOnglet] = useState<Onglet>("infos");

  return (
    <>
      <button type="button" className="puce h-11" aria-haspopup="dialog"
              onClick={() => { setOnglet("infos"); setOuvert(true); }}>
        Modifier
      </button>
      {ouvert && (
        <Dialogue titre="Modifier le paquet" onFermer={() => setOuvert(false)}>
          <div role="tablist" aria-label="Sections" className="mb-4 flex gap-2">
            {(["infos", "contenu"] as const).map((o) => (
              <button key={o} type="button" role="tab" aria-selected={onglet === o}
                      aria-pressed={onglet === o} className="puce" onClick={() => setOnglet(o)}>
                {o === "infos" ? "Infos" : "Contenu"}
              </button>
            ))}
          </div>
          {onglet === "infos"
            ? <Infos paquet={paquet} matieres={matieres} dossiers={dossiers} onFini={() => setOuvert(false)} />
            : <Contenu paquet={paquet} />}
        </Dialogue>
      )}
    </>
  );
}

function Infos({
  paquet, matieres, dossiers, onFini,
}: {
  paquet: { id: number; titre: string; description: string | null; subject_id: number | null; folder_id: number | null };
  matieres: Array<{ id: number; nom: string; archivee: boolean }>;
  dossiers: OptionDestination[];
  onFini: () => void;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const options = matieres.filter((m) => !m.archivee || m.id === paquet.subject_id);

  return (
    <div className="flex flex-col gap-4">
      <form
        action={(fd) => {
          setErreur(null);
          demarrer(async () => {
            const r = await modifierPaquet(paquet.id, fd);
            if (r.ok) { router.refresh(); onFini(); } else setErreur(r.erreur);
          });
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1.5 text-[13px] text-[var(--muted-foreground)]">
          Titre
          <input name="titre" required minLength={2} maxLength={120} defaultValue={paquet.titre}
                 className={`${CHAMP} text-[var(--foreground)]`} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-[var(--muted-foreground)]">
          Description
          <textarea name="description" maxLength={1000} rows={3} defaultValue={paquet.description ?? ""}
                    placeholder="Ce que couvre le paquet, la source…"
                    className={`${CHAMP} resize-y text-[var(--foreground)]`} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-[var(--muted-foreground)]">
          Matière
          <select name="matiere" defaultValue={paquet.subject_id ?? ""}
                  className="min-h-11 px-3 text-[14px] text-[var(--foreground)]">
            <option value="">Sans matière</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>{m.nom}{m.archivee ? " (archivée)" : ""}</option>
            ))}
          </select>
        </label>
        {erreur && <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}
        <button type="submit" disabled={enCours}
                className="rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2.5 text-[14px]
                           font-semibold text-[var(--primary-foreground)] disabled:opacity-50">
          {enCours ? "…" : "Enregistrer"}
        </button>
      </form>
      {dossiers.length > 1 && (
        <div className="border-t pt-3">
          <ChoixDossier key={`${paquet.folder_id}-${paquet.subject_id}`} cible="deck" id={paquet.id}
                        actuel={paquet.folder_id} options={dossiers} />
        </div>
      )}
    </div>
  );
}

type Bilan = { ajoutees: number; modifiees: number; inchangees: number; supprimees: number };

function Contenu({ paquet }: { paquet: { id: number; total: number } }) {
  const router = useRouter();
  const [ajout, setAjout] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(fd: FormData) {
    setErreur(null);
    setBilan(null);
    setEnCours(true);
    try {
      fd.set("deck", String(paquet.id));
      const res = await fetch("/api/fiches/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setErreur(data.erreur ?? "Mise à jour impossible"); return; }
      setBilan(data);
      router.refresh();
    } catch {
      setErreur("Mise à jour impossible — vérifiez le fichier");
    } finally {
      setEnCours(false);
    }
  }

  if (ajout) {
    return <EditeurCarte deckId={paquet.id} onFini={() => { setAjout(false); router.refresh(); }} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="text-[15px] font-semibold">Cartes</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted-foreground)]">
          {paquet.total} carte{paquet.total > 1 ? "s" : ""}. Pour corriger une carte, ouvrez-la dans
          la liste puis « Corriger » : l’ancienne version reste dans l’historique.
        </p>
        <button type="button" className="lien-discret" onClick={() => setAjout(true)}>+ Ajouter une carte</button>
      </section>

      <section className="border-t pt-4">
        <h3 className="text-[15px] font-semibold">Mettre à jour depuis Anki</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted-foreground)]">
          Exportez à nouveau le paquet (.apkg, compatibilité anciennes versions). Les cartes sont
          reconnues : les modifiées sont mises à jour sans perdre la progression de chacun, les
          nouvelles sont ajoutées.
        </p>
        <form action={envoyer} className="mt-3 flex flex-col gap-3">
          <input type="file" name="apkg" accept=".apkg" required
                 className="w-full text-[13px] file:mr-3 file:rounded-[var(--radius-sm)]
                            file:border-0 file:bg-[var(--secondary)] file:px-3 file:py-1.5
                            file:text-[13px] file:font-medium" />
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" name="supprimer_absentes" className="mt-0.5 h-4 w-4" />
            <span>Retirer les cartes importées qui ne sont plus dans le fichier
              <span className="block text-[var(--muted-foreground)]">Les cartes ajoutées dans le portail ne sont jamais retirées.</span>
            </span>
          </label>
          {erreur && <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}
          {bilan && (
            <p role="status" className="text-[13px]">
              {bilan.ajoutees} ajoutée{bilan.ajoutees > 1 ? "s" : ""} · {bilan.modifiees} modifiée{bilan.modifiees > 1 ? "s" : ""}
              {" · "}{bilan.inchangees} inchangée{bilan.inchangees > 1 ? "s" : ""}
              {bilan.supprimees > 0 && ` · ${bilan.supprimees} retirée${bilan.supprimees > 1 ? "s" : ""}`}
            </p>
          )}
          <button type="submit" disabled={enCours}
                  className="rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2.5 text-[14px]
                             font-semibold text-[var(--primary-foreground)] disabled:opacity-50">
            {enCours ? "Mise à jour…" : "Mettre à jour"}
          </button>
        </form>
      </section>
    </div>
  );
}
