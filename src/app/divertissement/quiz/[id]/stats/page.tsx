import { notFound, redirect } from "next/navigation";
import { LienRetour } from "@/components/LienRetour";
import { ContenuRenduClient as Rendu } from "@/components/quiz/Rendu";
import { lireQuiz, peutVoirStats, statsQuiz } from "@/lib/quiz";
import { pourcent } from "@/lib/quiz-commun";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statistiques du quiz — MP2I/FSM" };

/*
 * Statistiques d'un quiz, sur les premières tentatives : résumé, grille
 * membres × questions (qui a trouvé quoi), puis le détail de chaque
 * question avec la répartition des choix et le corrigé.
 */
export default async function PageStatsQuiz({ params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const quiz = await lireQuiz(Number((await params).id));
  if (!quiz) notFound();
  if (!(await peutVoirStats(u, quiz))) redirect(`/divertissement/quiz/${quiz.id}`);

  const s = await statsQuiz(quiz.id);
  const parQuestion = new Map(s.questions.map((q) => [q.id, q]));
  const moi = s.membres.find((m) => m.user_id === u.id);

  return (
    <main>
      <LienRetour href={`/divertissement/quiz/${quiz.id}`} label="Retour au quiz" />
      <header className="page-heading">
        <h1>Statistiques</h1>
        <p>{quiz.titre} · premiers essais seulement</p>
      </header>

      <dl className="mb-10 grid grid-cols-3 gap-3 text-center">
        <Chiffre titre="Participants" valeur={String(s.participants)} />
        <Chiffre titre="Moyenne classe" valeur={s.moyenne === null ? "—" : `${s.moyenne} %`} />
        <Chiffre titre="Mon 1er essai"
                 valeur={moi?.premiereRepondues ? `${pourcent(moi.premiereJustes, moi.premiereRepondues)} %` : "—"} />
      </dl>

      <section className="mb-12">
        <h2 className="etiquette">Qui a trouvé quoi</h2>
        {s.membres.length === 0 ? (
          <p className="py-6 text-[14px] text-[var(--muted-foreground)]">Personne n’a encore répondu.</p>
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[var(--hairline)] text-[var(--muted-foreground)]">
                  <th scope="col" className="sticky left-0 bg-[var(--background)] py-2 pr-3 text-left font-medium">Membre</th>
                  {s.contenu.map((q, i) => (
                    <th key={q.id} scope="col" className="px-1 py-2 text-center font-medium tabular">
                      <a href={`#q${q.id}`} className="text-inherit">Q{i + 1}</a>
                    </th>
                  ))}
                  <th scope="col" className="py-2 pl-3 text-right font-medium">Score</th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium" title="Meilleur essai terminé">Max</th>
                </tr>
              </thead>
              <tbody>
                {s.membres.map((m) => (
                  <tr key={m.user_id}
                      className={`border-b border-[var(--hairline)] ${m.user_id === u.id ? "font-semibold" : ""}`}>
                    <th scope="row" className="sticky left-0 max-w-[9rem] truncate bg-[var(--background)] py-2 pr-3 text-left font-[inherit]">
                      {m.nom}
                      {m.tentatives > 1 && <span className="ml-1 font-normal text-[var(--muted-foreground)]">×{m.tentatives}</span>}
                    </th>
                    {s.contenu.map((q) => {
                      const r = m.premiere[q.id];
                      return (
                        <td key={q.id} className="px-1 py-2 text-center">
                          {r === undefined
                            ? <span className="text-[var(--muted-foreground)]" aria-label="pas répondu">·</span>
                            : r
                              ? <span className="text-[var(--matiere-vert)]" aria-label="juste">✓</span>
                              : <span className="text-[var(--destructive)]" aria-label="faux">✗</span>}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-3 text-right tabular whitespace-nowrap">
                      {m.premiereRepondues ? `${pourcent(m.premiereJustes, m.premiereRepondues)} %` : "—"}
                      {!m.premiereFinie && <span className="ml-1 font-normal text-[var(--muted-foreground)]" title="Essai en cours">…</span>}
                    </td>
                    <td className="py-2 pl-3 text-right tabular text-[var(--muted-foreground)]">
                      {m.meilleur === null ? "—" : `${m.meilleur} %`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-[var(--muted-foreground)]">
                  <th scope="row" className="sticky left-0 bg-[var(--background)] py-2 pr-3 text-left font-medium">Réussite</th>
                  {s.contenu.map((q) => {
                    const st = parQuestion.get(q.id)!;
                    const p = pourcent(st.justes, st.repondants);
                    return <td key={q.id} className="px-1 py-2 text-center tabular">{p === null ? "—" : p}</td>;
                  })}
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="etiquette">Question par question</h2>
        <ol className="space-y-6">
          {s.contenu.map((q, i) => {
            const st = parQuestion.get(q.id)!;
            const p = pourcent(st.justes, st.repondants);
            return (
              <li key={q.id} id={`q${q.id}`}
                  className="scroll-mt-6 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--card)] p-4">
                <div className="mb-2 flex items-baseline justify-between gap-3 text-[13px] text-[var(--muted-foreground)]">
                  <span>Question {i + 1}</span>
                  <span className="tabular">
                    {p === null ? "Aucune réponse" : <><strong className="text-[var(--foreground)]">{p} %</strong> de réussite ({st.justes}/{st.repondants})</>}
                  </span>
                </div>
                <Rendu html={q.enonceHtml} className="mb-3 text-[15px]" />
                <ul className="space-y-2">
                  {q.choix.map((c) => {
                    const n = st.parChoix[c.id] ?? 0;
                    const pc = pourcent(n, st.repondants) ?? 0;
                    return (
                      <li key={c.id}>
                        <div className="flex items-start gap-2 text-[14px]">
                          <span aria-label={c.juste ? "bonne réponse" : undefined}
                                className={`w-4 shrink-0 ${c.juste ? "text-[var(--matiere-vert)]" : "text-transparent"}`}>✓</span>
                          <Rendu html={c.html} className={`flex-1 ${c.juste ? "font-medium" : ""}`} />
                          <span className="tabular shrink-0 text-[13px] text-[var(--muted-foreground)]">{n} · {pc} %</span>
                        </div>
                        <div className="barre ml-6 mt-1">
                          <span style={{ width: `${pc}%`, background: c.juste ? "var(--matiere-vert)" : "var(--muted-foreground)" }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {q.explicationHtml && (
                  <Rendu html={q.explicationHtml}
                         className="mt-3 border-t border-[var(--hairline)] pt-3 text-[14px] text-[var(--muted-foreground)]" />
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}

function Chiffre({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--card)] px-2 py-3">
      <dt className="text-[12px] text-[var(--muted-foreground)]">{titre}</dt>
      <dd className="tabular mt-1 text-[22px] font-semibold">{valeur}</dd>
    </div>
  );
}
