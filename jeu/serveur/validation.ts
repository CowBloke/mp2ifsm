import type { MessageClient } from "../protocole/messages";

/*
 * Validation stricte des messages de contrôle reçus : forme exacte ou
 * rejet. Le serveur ne fait jamais confiance au client.
 */

const CODE = /^[A-Z0-9]{4}$/;
const IDENT = /^[a-z0-9-]{1,40}$/;

function objet(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function place(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) < 4;
}

export function validerMessage(texte: string): MessageClient | null {
  if (texte.length > 4096) return null;
  let m: unknown;
  try {
    m = JSON.parse(texte);
  } catch {
    return null;
  }
  if (!objet(m) || typeof m.t !== "string") return null;
  switch (m.t) {
    case "bonjour":
      return Number.isInteger(m.v) && typeof m.ticket === "string" && m.ticket.length < 2048
        && (m.contenu === undefined || (typeof m.contenu === "string" && m.contenu.length <= 32))
        // Un client d'avant l'empreinte n'en envoie pas : il sera refusé comme périmé.
        ? { t: "bonjour", v: m.v as number, contenu: typeof m.contenu === "string" ? m.contenu : "", ticket: m.ticket } : null;
    case "creer":
    case "quitter":
    case "lancer":
      return { t: m.t };
    case "rejoindre":
    case "regarder":
      return typeof m.code === "string" && CODE.test(m.code.toUpperCase())
        ? { t: m.t, code: m.code.toUpperCase() } : null;
    case "perso":
    case "carte":
      return typeof m.id === "string" && IDENT.test(m.id) ? { t: m.t, id: m.id } : null;
    case "pret":
      return typeof m.pret === "boolean" ? { t: "pret", pret: m.pret } : null;
    case "bot":
      return place(m.place) && (m.niveau === null || (Number.isInteger(m.niveau) && (m.niveau as number) >= 0 && (m.niveau as number) <= 3))
        ? { t: "bot", place: m.place, niveau: m.niveau as number | null } : null;
    case "persoBot":
      return place(m.place) && typeof m.id === "string" && IDENT.test(m.id) ? { t: "persoBot", place: m.place, id: m.id } : null;
    case "exclure":
      return place(m.place) ? { t: "exclure", place: m.place } : null;
    default:
      return null;
  }
}
