import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/session";
export const dynamic = "force-dynamic";

export default async function PageAdmin() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  if (u.role !== "admin") redirect("/profil");
  redirect("/profil?onglet=admin");
}
