"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ContenuRenduClient as Rendu } from "./Rendu";
import { lancerQuiz, repondreQuestion } from "@/lib/actions-quiz";
import { pourcent } from "@/lib/quiz-commun";
import type { Correction, QuestionJeu } from "@/lib/quiz";

/*
 * Une question à la fois : on coche, on valide, le serveur corrige (le
 * corrigé n'arrive qu'à ce moment) et renvoie la question suivante ou le
 * bilan. Toute la progression est en base : quitter puis revenir reprend
 * à la première question non répondue.
 */
export function Jeu({ quizId, initiale }: { quizId: number; initiale: QuestionJeu }) {
  const [question, setQuestion] = useState(initiale);
  const [coches, setCoches] = useState<number[]>([]);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function basculer(id: number) {
    if (correction) return;
    setCoches((c) => question.plusieurs
      ? (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])
      : [id]);
  }

  function valider() {
    if (!coches.length) return;
    setErreur(null);
    demarrer(async () => {
      const r = await repondreQuestion(question.tentativeId, question.questionId, coches);
      if (r.ok) setCorrection(r.data);
      else setErreur(r.erreur);
    });
  }

  function suivante() {
    if (!correction?.suivante) return;
    setQuestion(correction.suivante);
    setCoches([]);
    setCorrection(null);
    window.scrollTo({ top: 0 });
  }

  const progression = ((question.rang - 1 + (correction ? 1 : 0)) / question.total) * 100;

  return (
    <div>
      <div className="mb-2 flex justify-between text-[13px] text-[var(--muted-foreground)]">
        <span className="tabular">Question {question.rang}/{question.total}</span>
        <span>{question.plusieurs ? "Plusieurs réponses possibles" : "Une seule réponse"}</span>
      </div>
      <div className="barre mb-6"><span style={{ width: `${progression}%` }} /></div>

      <Rendu html={question.enonceHtml} className="mb-6 text-[17px]" />

      <ul className="space-y-2" role={question.plusieurs ? "group" : "radiogroup"}>
        {question.choix.map((c) => {
          const coche = coches.includes(c.id);
          const juste = correction?.justes.includes(c.id);
          let etat = coche ? "border-[var(--foreground)]" : "border-[var(--border)]";
          if (correction) {
            if (juste) etat = "border-[var(--matiere-vert)] bg-[color-mix(in_oklab,var(--matiere-vert)_12%,transparent)]";
            else if (coche) etat = "border-[var(--destructive)] bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)]";
            else etat = "border-[var(--border)] opacity-60";
          }
          return (
            <li key={c.id}>
              <button type="button" onClick={() => basculer(c.id)} disabled={!!correction || enCours}
                      role={question.plusieurs ? "checkbox" : "radio"} aria-checked={coche}
                      className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] border-2 px-4 py-3
                                  text-left text-[15px] disabled:cursor-default ${etat}`}>
                <span aria-hidden="true"
                      className={`grid h-5 w-5 shrink-0 place-items-center border-2 text-[11px]
                                  ${question.plusieurs ? "rounded-[5px]" : "rounded-full"}
                                  ${coche ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--border)]"}`}>
                  {coche && "✓"}
                </span>
                <Rendu html={c.html} className="flex-1" />
                {correction && juste && <span className="sr-only">(bonne réponse)</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {erreur && <p role="alert" className="mt-3 text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}

      {!correction && (
        <button type="button" className="bouton-principal mt-6" disabled={!coches.length || enCours} onClick={valider}>
          {enCours ? "…" : "Valider"}
        </button>
      )}

      {correction && (
        <div className="mt-6 space-y-4" aria-live="polite">
          <div className="rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--card)] p-4">
            <p className={`text-[17px] font-semibold ${correction.juste ? "text-[var(--matiere-vert)]" : "text-[var(--destructive)]"}`}>
              {correction.juste ? "Bonne réponse !" : "Raté."}
            </p>
            {correction.reussiteClasse !== null && (
              <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
                {correction.reussiteClasse} % de la classe a trouvé du premier coup.
              </p>
            )}
            {correction.explicationHtml && (
              <Rendu html={correction.explicationHtml} className="mt-3 border-t border-[var(--hairline)] pt-3 text-[15px]" />
            )}
          </div>

          {correction.suivante ? (
            <button type="button" className="bouton-principal" onClick={suivante}>Question suivante</button>
          ) : correction.bilan ? (
            <Bilan quizId={quizId} bilan={correction.bilan} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function Bilan({ quizId, bilan }: { quizId: number; bilan: NonNullable<Correction["bilan"]> }) {
  const [enCours, demarrer] = useTransition();
  const p = pourcent(bilan.justes, bilan.repondues) ?? 0;
  return (
    <div className="space-y-3 pt-4">
      <div className="text-center">
        <p className="etiquette">Quiz terminé</p>
        <p className="tabular text-[40px] font-semibold leading-tight">{bilan.justes}/{bilan.repondues}</p>
        <p className="text-[15px] text-[var(--muted-foreground)]">
          {p} % {bilan.numero === 1 ? "· compte pour la classe" : `· essai ${bilan.numero}`}
        </p>
      </div>
      <Link href={`/divertissement/quiz/${quizId}/stats`} className="bouton-principal">Voir les statistiques</Link>
      <button type="button" className="bouton-principal bouton-sombre" disabled={enCours}
              onClick={() => demarrer(async () => { await lancerQuiz(quizId); })}>
        {enCours ? "…" : "Recommencer"}
      </button>
      <Link href="/divertissement/quiz" className="lien-discret w-full justify-center">Autres quiz</Link>
    </div>
  );
}
