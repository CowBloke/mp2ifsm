import { ErreurMetier } from "@/lib/errors";
import {
  aProuver, classementToilet, codeInvitation, derniersPassages, mesStats, toiletVisible,
} from "@/lib/toilet";
import { lirePeriode, prochainStatut, statutPour } from "@/lib/toilet-statuts";
import { membre } from "../_api";

export const dynamic = "force-dynamic";

/**
 * Toilet!, comme `/toilet` : mon statut, le classement de la période,
 * les derniers passages et ceux qui attendent leur photo. Rubrique
 * cachée : 404 pour qui n'est pas passé par le lien secret.
 * Les passages s'enregistrent par les routes du site (`/api/toilet/*`).
 */
export async function GET(request: Request) {
  const periode = lirePeriode(new URL(request.url).searchParams.get("periode"));
  return membre(async (u) => {
    if (!(await toiletVisible(u.id))) throw new ErreurMetier("INTROUVABLE");
    const [stats, lignes, fil, code, sansPhoto] = await Promise.all([
      mesStats(u.id), classementToilet(periode), derniersPassages(20), codeInvitation(), aProuver(u.id),
    ]);
    const statut = statutPour(stats.total);
    const prochain = prochainStatut(stats.total);
    return {
      periode,
      stats,
      statut,
      prochain,
      progression: prochain ? (stats.total - statut.seuil) / (prochain.seuil - statut.seuil) : 1,
      classement: lignes.map((l) => ({
        pseudo: l.display_name, n: l.n, photos: l.photos, total: l.total,
        statut: statutPour(l.total), moi: l.user_id === u.id,
      })),
      fil: fil.map((p) => ({
        id: p.id, pseudo: p.display_name, creeLe: p.cree_le, photo: p.photo,
        peutSupprimer: p.user_id === u.id || u.role === "admin",
      })),
      aProuver: sansPhoto,
      lien: code ? `/toilet/rejoindre/${code}` : null,
    };
  });
}
