import { redirect } from "next/navigation";
import { Accueil } from "@/components/courbes/Accueil";
import { Cadre } from "@/components/courbes/Cadre";
import { salonsOuverts } from "@/lib/courbes/salons";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curve Fight — MP2I/FSM" };

/*
 * Curve Fight : duel de fonctions. Chacun écrit une expression sans
 * aperçu ; les courbes partent toutes en même temps et éliminent ce
 * qu'elles touchent. Salons en mémoire, classements en base.
 */
export default async function PageCurveFight() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  return (
    <Cadre retour={{ href: "/divertissement", libelle: "Divertissement" }}>
      <Accueil pseudo={u.display_name} salons={salonsOuverts()} />
    </Cadre>
  );
}
