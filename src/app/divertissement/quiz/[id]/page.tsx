import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LienRetour } from "@/components/LienRetour";
import { PastilleMatiere } from "@/components/Matiere";
import { BoutonCommencer, BoutonSupprimerQuiz } from "@/components/quiz/BoutonsQuiz";
import { lireQuiz, mesTentatives, peutModifier, peutVoirStats } from "@/lib/quiz";
import { pourcent } from "@/lib/quiz-commun";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quiz — MP2I/FSM" };

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/* Présentation d'un quiz : commencer / reprendre / recommencer, mes essais, accès aux statistiques. */
export default async function PageUnQuiz({ params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const quiz = await lireQuiz(Number((await params).id));
  if (!quiz) notFound();

  const [tentatives, stats] = await Promise.all([mesTentatives(u.id, quiz.id), peutVoirStats(u, quiz)]);
  const enCours = tentatives.find((t) => !t.fini_le);
  const finies = tentatives.filter((t) => t.fini_le);
  const modifiable = peutModifier(u, quiz);

  return (
    <main>
      <LienRetour href="/divertissement/quiz" label="Retour aux quiz" />
      <header className="page-heading">
        <h1>{quiz.titre}</h1>
        <p className="flex flex-wrap items-center gap-x-2">
          <PastilleMatiere nom={quiz.matiere} couleur={quiz.couleur} />
          <span>· {quiz.nb_questions} question{quiz.nb_questions > 1 ? "s" : ""} · par {quiz.auteur}</span>
        </p>
      </header>

      {quiz.description && (
        <p className="mb-8 whitespace-pre-line text-[15px] leading-relaxed">{quiz.description}</p>
      )}

      <div className="space-y-3">
        <BoutonCommencer
          quizId={quiz.id}
          libelle={enCours ? `Reprendre (question ${Math.min(enCours.repondues + 1, quiz.nb_questions)}/${quiz.nb_questions})`
                           : finies.length ? "Recommencer" : "Commencer"}
          desactive={quiz.nb_questions === 0}
        />
        {!finies.length && !enCours && (
          <p className="text-center text-[13px] text-[var(--muted-foreground)]">
            Ta première tentative compte pour les statistiques de la classe, avec ton nom.
          </p>
        )}
        {stats && (
          <Link href={`/divertissement/quiz/${quiz.id}/stats`}
                className="bouton-principal bouton-sombre">Statistiques de la classe</Link>
        )}
        {!stats && (
          <p className="text-center text-[13px] text-[var(--muted-foreground)]">
            Les statistiques (et le corrigé) s’ouvrent une fois le quiz terminé.
          </p>
        )}
      </div>

      {finies.length > 0 && (
        <section className="mt-10">
          <h2 className="etiquette">Mes essais</h2>
          <ul>
            {finies.map((t) => (
              <li key={t.id} className="ligne">
                <span className="flex-1">
                  <span className="ligne__titre block">
                    Essai {t.numero}{t.numero === 1 && <span className="ligne__meta"> · compte pour la classe</span>}
                  </span>
                  <span className="ligne__meta">{date.format(new Date(t.fini_le!))}</span>
                </span>
                <span className="tabular text-[15px] font-semibold">
                  {t.justes}/{t.repondues} · {pourcent(t.justes, t.repondues) ?? 0} %
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {modifiable && (
        <div className="mt-10 flex items-center gap-4 border-t border-[var(--hairline)] pt-4">
          <Link href={`/divertissement/quiz/${quiz.id}/modifier`} className="lien-discret">Modifier le quiz</Link>
          <BoutonSupprimerQuiz quizId={quiz.id} />
        </div>
      )}
    </main>
  );
}
