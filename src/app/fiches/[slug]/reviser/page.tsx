import { notFound, redirect } from "next/navigation";
import { SessionRevision } from "@/components/SessionRevision";
import { lirePaquet, prochaineCarte } from "@/lib/fiches";
import { rendreContenu } from "@/lib/rendu";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

/*
 * La première carte est rendue côté serveur avec la page ; les
 * suivantes arrivent par action serveur, déjà composées. La session
 * démarre donc sans aller-retour supplémentaire.
 */
export default async function PageRevision({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  const paquet = await lirePaquet(slug, u.id);
  if (!paquet) notFound();

  const c = await prochaineCarte(u.id, paquet.id);

  return (
    <main>
      <SessionRevision
        deckId={paquet.id}
        deckSlug={paquet.slug}
        deckTitre={paquet.titre}
        carteInitiale={
          c && {
            jeton: c.jeton,
            cardId: c.card_id,
            rectoHtml: rendreContenu(c.recto),
            versoHtml: rendreContenu(c.verso),
            auteur: c.auteur,
            signalee: c.signalee,
            apercu: c.apercu,
            restant: c.restant,
            nouvelle: c.etat === null,
          }
        }
      />
    </main>
  );
}
