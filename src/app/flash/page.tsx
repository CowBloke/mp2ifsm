import { redirect } from "next/navigation";
import { SessionRevision } from "@/components/SessionRevision";
import { queryOne } from "@/lib/db";
import { prochaineCarte } from "@/lib/fiches";
import { FLASH_A_L_HEURE_MS, FLASH_CARTES, jourDeParis } from "@/lib/notifications";
import { composerCarte } from "@/lib/rendu";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

/*
 * Flash du jour : la notification « à la BeReal » ouvre cette page.
 * Trois cartes au plus, piochées dans tous les paquets suivis (dues
 * d'abord, puis neuves au hasard), notées comme une révision normale.
 */
export default async function PageFlash() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  const [c, tirage] = await Promise.all([
    prochaineCarte(u.id, null),
    queryOne<{ heure: string }>(
      `select heure from flash_tirage where jour = $1::date and envoye_at is not null`,
      [jourDeParis(new Date())]),
  ]);

  return (
    <main>
      <SessionRevision
        deckId={null}
        deckSlug={null}
        deckTitre="Flash du jour"
        flash={{
          limite: FLASH_CARTES,
          envoyeA: tirage ? new Date(tirage.heure).toISOString() : null,
          delaiALHeureMs: FLASH_A_L_HEURE_MS,
        }}
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
