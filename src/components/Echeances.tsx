"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ajouterEcheance, modifierEcheance } from "@/lib/actions-echeances";
import type { Reponse } from "@/lib/actions";
import { ChoixMatiere } from "@/components/Matiere";
import { Dialogue } from "@/components/Dialogue";

type Matieres = Array<{ id: number; nom: string }>;

/** ISO → valeur d'un <input type="datetime-local"> dans le fuseau du navigateur. */
function versLocal(iso: string): string {
  const d = new Date(iso);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

function FormulaireDialogue({
  titreDialogue, bouton, matieres, initial, envoyer, onFermer,
}: {
  titreDialogue: string;
  bouton: string;
  matieres: Matieres;
  initial?: { titre: string; matiere: string; dueAt: string };
  envoyer: (fd: FormData) => Promise<Reponse<undefined>>;
  onFermer: () => void;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  return (
    <Dialogue titre={titreDialogue} onFermer={onFermer}>
    <form
      action={(fd) => {
        setErreur(null);
        demarrer(async () => {
          const local = String(fd.get("dueAt") ?? "");
          if (local) fd.set("dueAt", new Date(local).toISOString());
          const r = await envoyer(fd);
          if (r.ok) { onFermer(); router.refresh(); }
          else setErreur(r.erreur);
        });
      }}
      className="space-y-2"
    >
      <input
        name="titre" required minLength={3} maxLength={120}
        defaultValue={initial?.titre}
        placeholder="Titre (ex. DS de physique)" aria-label="Titre"
        className="w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                   outline-none focus:border-[var(--ring)]"
      />
      <ChoixMatiere matieres={matieres} defaut={initial?.matiere ?? ""}
                    className="w-full rounded-[var(--radius-md)] border-2 text-[14px]
                               outline-none focus:border-[var(--ring)]" />
      <input
        name="dueAt" type="datetime-local" required
        defaultValue={initial ? versLocal(initial.dueAt) : undefined}
        aria-label="Date"
        className="w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                   outline-none focus:border-[var(--ring)]"
      />

      {erreur && (
        <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onFermer}
                className="rounded-[var(--radius-md)] border px-3 py-2 text-[13px] font-medium">
          Annuler
        </button>
        <button type="submit" disabled={enCours}
                className="flex-1 rounded-[var(--radius-md)] bg-[var(--primary)] px-3 py-2
                           text-[13px] font-semibold text-[var(--primary-foreground)]
                           disabled:opacity-50">
          {enCours ? "…" : bouton}
        </button>
      </div>
    </form>
    </Dialogue>
  );
}

/** Ajout d'une échéance par n'importe qui dans la classe. */
export function FormulaireEcheance({ matieres }: { matieres: Matieres }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} aria-haspopup="dialog"
              className="lien-discret mt-1 self-start">
        + Ajouter une échéance
      </button>
      {ouvert && (
        <FormulaireDialogue titreDialogue="Nouvelle échéance" bouton="Ajouter"
                            matieres={matieres} envoyer={ajouterEcheance}
                            onFermer={() => setOuvert(false)} />
      )}
    </>
  );
}

/** Ligne d'échéance : n'importe quel membre peut la corriger d'un clic. */
export function EcheanceModifiable({
  echeance, matieres, children,
}: {
  echeance: { id: number; titre: string; subject_id: number | null; matiere: string | null; due_at: string };
  matieres: Matieres;
  children: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  // Une matière archivée depuis reste proposée pour ne pas l'effacer en silence.
  const choix = echeance.subject_id !== null && !matieres.some((m) => m.id === echeance.subject_id)
    ? [...matieres, { id: echeance.subject_id, nom: echeance.matiere ?? "Matière archivée" }]
    : matieres;
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} aria-haspopup="dialog"
              title="Modifier l’échéance"
              className="flex w-full items-baseline justify-between gap-3 text-left">
        {children}
      </button>
      {ouvert && (
        <FormulaireDialogue
          titreDialogue="Modifier l’échéance" bouton="Enregistrer" matieres={choix}
          initial={{
            titre: echeance.titre,
            matiere: echeance.subject_id === null ? "" : String(echeance.subject_id),
            dueAt: echeance.due_at,
          }}
          envoyer={(fd) => modifierEcheance(echeance.id, fd)}
          onFermer={() => setOuvert(false)}
        />
      )}
    </>
  );
}
