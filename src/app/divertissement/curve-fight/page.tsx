import { redirect } from "next/navigation";
import { Accueil } from "@/components/courbes/Accueil";
import { LienRetour } from "@/components/LienRetour";
import { salonsOuverts } from "@/lib/courbes/salons";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curve Fight — MP2I/FSM" };

/*
 * Curve Fight : duel de fonctions. Chacun écrit une expression ; les
 * courbes partent toutes en même temps et éliminent ce qu'elles
 * touchent. Salons en mémoire, classements en base.
 */
export default async function PageCurveFight() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  return (
    <main>
      <LienRetour href="/divertissement" label="Retour au divertissement" />
      <header className="page-heading">
        <h1>Curve Fight</h1>
        <p>Écris une fonction, sans la voir. Sa courbe part de toi : si elle atteint un adversaire avant que la sienne ne t’atteigne, il est éliminé. De 2 à 10 joueurs.</p>
      </header>
      <Accueil salons={salonsOuverts()} />
    </main>
  );
}
