import { GROUPE_MAX, groupeValide, jourParis, lundiDe } from "@/lib/colloscope";
import { prochainesColles, semaineColles } from "@/lib/colles";
import { membre } from "../_api";

export const dynamic = "force-dynamic";

/** `?semaine=AAAA-MM-JJ` (n'importe quel jour de la semaine) et `?groupe=N` facultatifs, comme `/colles`. */
export async function GET(request: Request) {
  return membre(async (u) => {
    const p = new URL(request.url).searchParams;
    const demande = Number(p.get("groupe"));
    const groupe = groupeValide(demande) ? demande : u.groupe_colle;
    const lundiCourant = lundiDe(jourParis(new Date()));
    if (groupe === null) {
      return { groupe: null, moi: null, groupe_max: GROUPE_MAX, lundi: lundiCourant, lundi_courant: lundiCourant, semaine: null, a_venir: [] };
    }
    const brut = p.get("semaine") ?? "";
    const lundi = /^\d{4}-\d{2}-\d{2}$/.test(brut) ? lundiDe(brut) : lundiCourant;
    const [semaine, aVenir] = await Promise.all([semaineColles(groupe, lundi), prochainesColles(groupe, 6, 120)]);
    return { groupe, moi: u.groupe_colle, groupe_max: GROUPE_MAX, lundi, lundi_courant: lundiCourant, semaine, a_venir: aVenir };
  });
}
