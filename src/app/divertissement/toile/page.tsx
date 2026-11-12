import { redirect } from "next/navigation";
import { Toile } from "@/components/place/Toile";
import { styleJeu } from "@/components/divertissement/jeux";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "La Toile — MP2I/FSM" };

/*
 * La Toile : une toile de pixels commune, façon r/place. Chacun pose un
 * pixel puis attend (5 minutes par défaut) ; les administrateurs ont les
 * outils de modération sous la toile. Toute l'interface de pose tient
 * dans l'écran, quelle que soit sa forme : pas de grand en-tête de jeu
 * ici, la barre compacte de la scène en reprend l'icône et le titre.
 */
export default async function PageToile() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  return (
    <main className="jeu" style={styleJeu("toile")}>
      <Toile admin={u.role === "admin"} />
    </main>
  );
}
