import { redirect } from "next/navigation";
import { FormulaireAuth } from "@/components/FormulaireAuth";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageInscription() {
  if (await utilisateurCourant()) redirect("/");
  return <FormulaireAuth mode="inscription" />;
}
