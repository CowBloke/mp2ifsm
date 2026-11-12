import { notFound, redirect } from "next/navigation";
import { LienRetour } from "@/components/LienRetour";
import { EditeurQuiz } from "@/components/quiz/EditeurQuiz";
import { queryOne } from "@/lib/db";
import { listerMatieres } from "@/lib/matieres";
import { lireQuiz, peutModifier, questionsQuiz } from "@/lib/quiz";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modifier le quiz — MP2I/FSM" };

/* Réservé à l'auteur et aux administrateurs. */
export default async function PageModifierQuiz({ params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const quiz = await lireQuiz(Number((await params).id));
  if (!quiz) notFound();
  if (!peutModifier(u, quiz)) redirect(`/divertissement/quiz/${quiz.id}`);

  const [questions, toutes, reponses] = await Promise.all([
    questionsQuiz(quiz.id),
    listerMatieres(),
    queryOne(`select 1 from quiz_reponse r join quiz_tentative t on t.id = r.tentative_id where t.quiz_id = $1 limit 1`, [quiz.id]),
  ]);
  const matieres = toutes.map(({ id, nom }) => ({ id, nom }));
  // Une matière archivée depuis reste proposée pour ne pas l'effacer en silence.
  if (quiz.subject_id !== null && !matieres.some((m) => m.id === quiz.subject_id)) {
    matieres.push({ id: quiz.subject_id, nom: quiz.matiere ?? "Matière archivée" });
  }

  return (
    <main>
      <LienRetour href={`/divertissement/quiz/${quiz.id}`} label="Retour au quiz" />
      <header className="page-heading"><h1>Modifier le quiz</h1></header>
      <EditeurQuiz
        quizId={quiz.id} matieres={matieres} aDesReponses={!!reponses}
        initial={{
          titre: quiz.titre, description: quiz.description,
          matiere: quiz.subject_id === null ? "" : String(quiz.subject_id),
          questions: questions.map((q) => ({
            id: q.id, enonce: q.enonce, explication: q.explication,
            choix: q.choix.map((c) => ({ id: c.id, texte: c.texte, juste: c.juste })),
          })),
        }}
      />
    </main>
  );
}
