import { redirect } from "next/navigation";
import { LienRetour } from "@/components/LienRetour";
import { Toile } from "@/components/place/Toile";
import { TAILLE } from "@/lib/place/commun";
import { utilisateurCourant } from "@/lib/session";
import { EnTeteJeu } from "@/components/divertissement/EnTeteJeu";
import { styleJeu } from "@/components/divertissement/jeux";

export const dynamic = "force-dynamic";
export const metadata = { title: "La Toile — MP2I/FSM" };

/*
 * La Toile : une toile de pixels commune, façon r/place. Chacun pose un
 * pixel puis attend (5 minutes par défaut) ; les administrateurs ont les
 * outils de modération sous la toile.
 */
export default async function PageToile() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  return (
    <main className="jeu" style={styleJeu("toile")}>
      <EnTeteJeu jeu="toile">
        {TAILLE} × {TAILLE} pixels pour toute la classe. Un pixel à la fois : choisis où, choisis la couleur, puis patiente avant le suivant.
      </EnTeteJeu>
      <Toile admin={u.role === "admin"} />
    </main>
  );
}
