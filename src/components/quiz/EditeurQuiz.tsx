"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChoixMatiere } from "@/components/Matiere";
import { sauverQuiz } from "@/lib/actions-quiz";
import { LIMITES, verifierQuiz, type QuizSaisi } from "@/lib/quiz-commun";

/*
 * Éditeur complet d'un quiz, envoyé d'un bloc. Les id des questions et
 * choix existants sont renvoyés : le serveur les met à jour au lieu de
 * les recréer, et les réponses déjà données restent rattachées.
 */
type Choix = { cle: string; id?: number; texte: string; juste: boolean };
type Question = { cle: string; id?: number; enonce: string; explication: string; choix: Choix[] };

let compteur = 0;
const cle = () => `n${++compteur}`;
const choixVide = (): Choix => ({ cle: cle(), texte: "", juste: false });
const questionVide = (): Question => ({ cle: cle(), enonce: "", explication: "", choix: [choixVide(), choixVide()] });

export function EditeurQuiz({
  quizId, initial, matieres, aDesReponses = false,
}: {
  quizId: number | null;
  initial?: QuizSaisi;
  matieres: Array<{ id: number; nom: string }>;
  aDesReponses?: boolean;
}) {
  const router = useRouter();
  const [titre, setTitre] = useState(initial?.titre ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [questions, setQuestions] = useState<Question[]>(() =>
    initial?.questions.map((q) => ({ ...q, cle: cle(), choix: q.choix.map((c) => ({ ...c, cle: cle() })) }))
    ?? [questionVide()]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const majQ = (i: number, f: (q: Question) => Question) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? f(q) : q)));
  const majC = (i: number, k: number, f: (c: Choix) => Choix) =>
    majQ(i, (q) => ({ ...q, choix: q.choix.map((c, j) => (j === k ? f(c) : c)) }));
  const deplacer = (i: number, d: number) => setQuestions((qs) => {
    const j = i + d;
    if (j < 0 || j >= qs.length) return qs;
    const out = [...qs];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  });

  function enregistrer(form: HTMLFormElement) {
    setErreur(null);
    const saisie = {
      titre, description,
      matiere: String(new FormData(form).get("matiere") ?? ""),
      questions: questions.map(({ id, enonce, explication, choix }) => ({
        ...(id ? { id } : {}), enonce, explication,
        choix: choix.map(({ id: cid, texte, juste }) => ({ ...(cid ? { id: cid } : {}), texte, juste })),
      })),
    };
    const v = verifierQuiz(saisie);
    if (!v.ok) { setErreur(v.erreur); return; }
    demarrer(async () => {
      const r = await sauverQuiz(quizId, saisie);
      if (r.ok) { router.push(`/divertissement/quiz/${r.data.id}`); router.refresh(); }
      else setErreur(r.erreur);
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); enregistrer(e.currentTarget); }} className="space-y-8">
      <div className="space-y-2">
        <input value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={LIMITES.titre} required
               placeholder="Titre (ex. Séries entières — définitions)" aria-label="Titre du quiz"
               className="champ text-[17px] font-semibold" />
        <ChoixMatiere matieres={matieres} defaut={initial?.matiere ?? ""} className="w-full" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  maxLength={LIMITES.description} rows={2} placeholder="Description (facultatif)"
                  aria-label="Description" className="w-full px-4 py-3 text-[15px]" />
        <p className="text-[13px] text-[var(--muted-foreground)]">
          Les formules s’écrivent en LaTeX entre <code>$…$</code> (ou <code>$$…$$</code> centrées).
          {aDesReponses && " Des membres ont déjà répondu : corriger une bonne réponse recalcule leurs scores."}
        </p>
      </div>

      <ol className="space-y-8">
        {questions.map((q, i) => (
          <li key={q.cle} className="rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--card)] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">Question {i + 1}</h2>
              <div className="flex gap-1">
                <PetitBouton label="Monter" onClick={() => deplacer(i, -1)} disabled={i === 0}>↑</PetitBouton>
                <PetitBouton label="Descendre" onClick={() => deplacer(i, 1)} disabled={i === questions.length - 1}>↓</PetitBouton>
                <PetitBouton label="Supprimer la question" disabled={questions.length === 1}
                             onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}>✕</PetitBouton>
              </div>
            </div>
            <textarea value={q.enonce} onChange={(e) => majQ(i, (x) => ({ ...x, enonce: e.target.value }))}
                      maxLength={LIMITES.enonce} rows={3} placeholder="Énoncé" aria-label={`Énoncé de la question ${i + 1}`}
                      className="w-full px-4 py-3 text-[15px]" />

            <p className="etiquette mt-3">Choix — coche la ou les bonnes réponses</p>
            <ul className="space-y-2">
              {q.choix.map((c, k) => (
                <li key={c.cle} className="flex items-center gap-2">
                  <input type="checkbox" checked={c.juste} aria-label={`Choix ${k + 1} juste`}
                         onChange={(e) => majC(i, k, (x) => ({ ...x, juste: e.target.checked }))}
                         className="h-5 w-5 shrink-0 accent-[var(--matiere-vert)]" />
                  <input value={c.texte} onChange={(e) => majC(i, k, (x) => ({ ...x, texte: e.target.value }))}
                         maxLength={LIMITES.texteChoix} placeholder={`Choix ${k + 1}`}
                         aria-label={`Texte du choix ${k + 1}`} className="champ min-h-11 flex-1 text-[15px]" />
                  <PetitBouton label={`Retirer le choix ${k + 1}`} disabled={q.choix.length <= LIMITES.choixMin}
                               onClick={() => majQ(i, (x) => ({ ...x, choix: x.choix.filter((_, j) => j !== k) }))}>✕</PetitBouton>
                </li>
              ))}
            </ul>
            {q.choix.length < LIMITES.choixMax && (
              <button type="button" className="lien-discret"
                      onClick={() => majQ(i, (x) => ({ ...x, choix: [...x.choix, choixVide()] }))}>
                + Ajouter un choix
              </button>
            )}

            <textarea value={q.explication} onChange={(e) => majQ(i, (x) => ({ ...x, explication: e.target.value }))}
                      maxLength={LIMITES.explication} rows={2}
                      placeholder="Explication montrée après la réponse (facultatif)"
                      aria-label={`Explication de la question ${i + 1}`} className="mt-2 w-full px-4 py-3 text-[14px]" />
          </li>
        ))}
      </ol>

      {questions.length < LIMITES.questions && (
        <button type="button" className="bouton-principal bouton-sombre"
                onClick={() => setQuestions((qs) => [...qs, questionVide()])}>
          + Ajouter une question
        </button>
      )}

      <div className="sticky bottom-[calc(var(--bottom-nav-clearance)-1rem)] space-y-2 bg-[var(--background)] py-3">
        {erreur && <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}
        <button type="submit" className="bouton-principal" disabled={enCours}>
          {enCours ? "…" : quizId === null ? "Publier le quiz" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

function PetitBouton({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[14px] text-[var(--muted-foreground)]
                       hover:bg-[var(--muted)] disabled:opacity-30">
      {children}
    </button>
  );
}
