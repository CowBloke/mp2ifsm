import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/session";
import { lireFiltre } from "@/lib/videos";
import { PageFil } from "./fil";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vidéos éducatives — MP2I/FSM" };

/* L'onglet Vidéos ouvre directement le fil, comme une app de vidéos. */
export default async function PageVideos({ searchParams }: { searchParams: Promise<{ matiere?: string; auteur?: string }> }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  return <PageFil u={u} filtre={lireFiltre(await searchParams)} />;
}
