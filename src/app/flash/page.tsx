import { redirect } from "next/navigation";
import { SessionRevision } from "@/components/SessionRevision";
import { prochaineCarte } from "@/lib/fiches";
import { FLASH_CARTES } from "@/lib/notifications";
import { composerCarte } from "@/lib/rendu";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

/*
 * Fiches du jour : le rappel quotidien ouvre cette page. Trois cartes
 * au plus, piochées dans tous les paquets suivis (dues d'abord, puis
 * neuves au hasard), notées comme une révision normale.
 */
export default async function PageFichesDuJour() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  const c = await prochaineCarte(u.id, null);

  return (
    <main>
      <SessionRevision
        deckId={null}
        deckSlug={null}
        deckTitre="Fiches du jour"
        flash={{ limite: FLASH_CARTES }}
        carteInitiale={
          c && {
            jeton: c.jeton,
            cardId: c.card_id,
            ...composerCarte(c.recto, c.verso),
            auteur: c.auteur,
            signalee: c.signalee,
            apercu: c.apercu,
            restant: c.restant,
            nouvelle: c.etat === null,
            paquet: c.deck_titre,
          }
        }
      />
    </main>
  );
}
