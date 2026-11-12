import { redirect } from "next/navigation";
import { LienRetour } from "@/components/LienRetour";
import { EditeurQuiz } from "@/components/quiz/EditeurQuiz";
import { listerMatieres } from "@/lib/matieres";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nouveau quiz — MP2I/FSM" };

export default async function PageNouveauQuiz() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const matieres = (await listerMatieres()).map(({ id, nom }) => ({ id, nom }));
  return (
    <main>
      <LienRetour href="/divertissement/quiz" label="Retour aux quiz" />
      <header className="page-heading"><h1>Nouveau quiz</h1></header>
      <EditeurQuiz quizId={null} matieres={matieres} />
    </main>
  );
}
