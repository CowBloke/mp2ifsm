import { notFound, redirect } from "next/navigation";
import { Salle } from "@/components/courbes/Salle";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curve Fight — MP2I/FSM" };

export default async function PageSalon({ params }: { params: Promise<{ code: string }> }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const code = (await params).code.toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) notFound();
  return <Salle code={code} />;
}
