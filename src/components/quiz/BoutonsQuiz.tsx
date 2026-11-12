"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lancerQuiz, supprimerQuiz } from "@/lib/actions-quiz";

export function BoutonCommencer({ quizId, libelle, desactive }: { quizId: number; libelle: string; desactive: boolean }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  return (
    <>
      <button type="button" className="bouton-principal" disabled={desactive || enCours}
              onClick={() => demarrer(async () => {
                setErreur(null);
                // En cas de succès, l'action redirige vers le jeu.
                const r = await lancerQuiz(quizId);
                if (r && !r.ok) setErreur(r.erreur);
              })}>
        {enCours ? "…" : libelle}
      </button>
      {erreur && <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}
    </>
  );
}

export function BoutonSupprimerQuiz({ quizId }: { quizId: number }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  return (
    <button type="button" disabled={enCours}
            className="lien-discret !text-[var(--destructive)]"
            onClick={() => {
              if (!confirm("Supprimer ce quiz ? Les réponses de la classe ne seront plus visibles.")) return;
              demarrer(async () => {
                const r = await supprimerQuiz(quizId);
                if (r.ok) router.push("/divertissement/quiz");
                else alert(r.erreur);
              });
            }}>
      Supprimer
    </button>
  );
}
