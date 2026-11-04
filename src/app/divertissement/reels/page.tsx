import { redirect } from "next/navigation";
import { FilReels } from "@/components/FilReels";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Réels — MP2I/FSM" };

/* Réels : un fil vertical de nombres réels tirés au hasard (blague). */
export default async function PageReels() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  return <FilReels pseudo={u.display_name} />;
}
