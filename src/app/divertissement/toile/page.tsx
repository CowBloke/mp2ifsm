import { redirect } from "next/navigation";
import { LienRetour } from "@/components/LienRetour";
import { Toile } from "@/components/place/Toile";
import { TAILLE } from "@/lib/place/commun";
import { utilisateurCourant } from "@/lib/session";

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
    <main>
      <LienRetour href="/divertissement" label="Retour au divertissement" />
      <header className="page-heading">
        <h1>La Toile</h1>
        <p>{TAILLE} × {TAILLE} pixels pour toute la classe. Un pixel à la fois : choisis où, choisis la couleur, puis patiente avant le suivant.</p>
      </header>
      <Toile admin={u.role === "admin"} />
    </main>
  );
}
