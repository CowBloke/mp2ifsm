import { notFound, redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/session";
import { lireFiltre } from "@/lib/videos";
import { PageFil } from "../fil";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vidéos éducatives — MP2I/FSM" };

/* Fil qui commence à la vidéo choisie (lien partagé, vignette d'un profil). */
export default async function PageVideo({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ matiere?: string; auteur?: string }>;
}) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return <PageFil u={u} filtre={lireFiltre(await searchParams)} depart={id} />;
}
