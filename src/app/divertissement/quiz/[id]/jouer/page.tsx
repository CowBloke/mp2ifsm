import { notFound, redirect } from "next/navigation";
import { LienRetour } from "@/components/LienRetour";
import { Jeu } from "@/components/quiz/Jeu";
import { lireQuiz, questionSuivante } from "@/lib/quiz";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quiz — MP2I/FSM" };

/* Tentative en cours, une question à la fois. Sans tentative en cours, retour à la présentation. */
export default async function PageJouer({ params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const quiz = await lireQuiz(Number((await params).id));
  if (!quiz) notFound();
  const question = await questionSuivante(u.id, quiz.id);
  if (!question) redirect(`/divertissement/quiz/${quiz.id}`);

  return (
    <main>
      <LienRetour href={`/divertissement/quiz/${quiz.id}`} label="Quitter (la progression est gardée)" />
      <header className="mb-6">
        <p className="etiquette">{quiz.titre}</p>
      </header>
      <Jeu key={question.tentativeId} quizId={quiz.id} initiale={question} />
    </main>
  );
}
