import { notFound, redirect } from "next/navigation";
import { FilVideos } from "@/components/videos/FilVideos";
import { utilisateurCourant } from "@/lib/session";
import { listerVideos } from "@/lib/videos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vidéos éducatives — MP2I/FSM" };

/* Fil vertical qui commence à la vidéo choisie, puis les plus anciennes. */
export default async function PageVideo({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ matiere?: string }>;
}) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const id = Number((await params).id);
  const brut = Number((await searchParams).matiere);
  const matiere = Number.isSafeInteger(brut) && brut > 0 ? brut : null;
  const videos = await listerVideos(u.id, matiere);
  const depart = videos.findIndex((v) => v.id === id);
  if (depart < 0) notFound();
  return <FilVideos videos={[...videos.slice(depart), ...videos.slice(0, depart)]}
                    moi={u.id} admin={u.role === "admin"} pseudo={u.display_name} />;
}
