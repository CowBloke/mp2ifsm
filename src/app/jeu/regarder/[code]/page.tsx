import { notFound } from "next/navigation";
import { exigerJeu, urlServeurJeu } from "../../acces";
import { Salon } from "../../_composants/Salon";

export const dynamic = "force-dynamic";

/** Regarder un salon : toute l'arène, sans aucune prise sur la partie (vidéoprojecteur). */
export default async function PageRegarder({ params }: { params: Promise<{ code: string }> }) {
  await exigerJeu();
  const code = (await params).code.toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) notFound();
  return <Salon code={code} urlJeu={urlServeurJeu()} spectateur />;
}
