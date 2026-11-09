import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BoutonActiver } from "@/components/toilet/Outils";
import { utilisateurCourant } from "@/lib/session";
import { codeInvitation, toiletVisible } from "@/lib/toilet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Toilet! — MP2I/FSM", robots: { index: false, follow: false } };

/*
 * Lien secret d'activation. Un mauvais code répond 404, comme une page
 * qui n'existe pas. L'activation demande un appui : les aperçus de lien
 * des messageries (qui ouvrent l'URL) n'activent rien.
 */
export default async function PageRejoindre({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let attendu: string | null = null;
  try { attendu = await codeInvitation(); } catch { /* migration absente */ }
  if (!attendu || code !== attendu) notFound();

  const u = await utilisateurCourant();
  if (u && (await toiletVisible(u.id))) redirect("/toilet");

  return (
    <main className="reading-column flex min-h-[70vh] flex-col justify-center text-center">
      <p className="text-[64px] leading-none" aria-hidden="true">🚽</p>
      <h1 className="titre-page mt-4">Toilet!</h1>
      <p className="mx-auto mt-3 max-w-sm text-[15px] text-[var(--muted-foreground)]">
        Vous avez trouvé l’entrée secrète du classement des toilettes du bas.
        Chaque passage compte, chaque photo de propreté aussi.
      </p>
      <div className="mx-auto mt-8 w-full max-w-sm">
        {u ? (
          <BoutonActiver code={code} />
        ) : (
          <>
            <p className="mb-4 text-[14px]">Connectez-vous d’abord, puis rouvrez ce lien.</p>
            <Link href="/connexion" className="bouton-principal">Se connecter</Link>
          </>
        )}
      </div>
    </main>
  );
}
