/*
 * Ticket de jeu : prouve au serveur de jeu qui est le joueur, sans qu'il
 * ait besoin de la base ni du cookie de session.
 *
 * Le site (qui connaît la session) le signe ; le serveur de jeu le
 * vérifie. HMAC-SHA256 par WebCrypto (Node et navigateurs), avec le
 * secret de session du site et un préfixe de domaine propre : un ticket
 * ne peut servir à rien d'autre, et aucune autre signature du site ne
 * vaut ticket. Durée de vie courte : on en redemande un à chaque
 * connexion.
 */

export type Ticket = {
  uid: string;
  nom: string;
  role: "member" | "admin";
  /** Expiration, en millisecondes depuis l'époque Unix. */
  exp: number;
};

export const DUREE_TICKET_MS = 2 * 60 * 1000;
const DOMAINE = "mp2ifsm/jeu-ticket:";

const encodeur = new TextEncoder();

function versBase64Url(octets: Uint8Array): string {
  let binaire = "";
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function depuisBase64Url(texte: string): Uint8Array<ArrayBuffer> {
  const b64 = texte.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texte.length + 3) % 4);
  const binaire = atob(b64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

async function cle(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encodeur.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signerTicket(t: Ticket, secret: string): Promise<string> {
  if (!secret) throw new Error("secret de ticket manquant");
  const charge = versBase64Url(encodeur.encode(JSON.stringify(t)));
  const signature = await crypto.subtle.sign("HMAC", await cle(secret), encodeur.encode(DOMAINE + charge));
  return `${charge}.${versBase64Url(new Uint8Array(signature))}`;
}

/** Ticket valide et non expiré, ou null. Ne lève jamais. */
export async function verifierTicket(jeton: string, secret: string, maintenant = Date.now()): Promise<Ticket | null> {
  try {
    if (!secret || typeof jeton !== "string" || jeton.length > 2048) return null;
    const [charge, signature] = jeton.split(".");
    if (!charge || !signature) return null;
    const valide = await crypto.subtle.verify("HMAC", await cle(secret), depuisBase64Url(signature), encodeur.encode(DOMAINE + charge));
    if (!valide) return null;
    const t = JSON.parse(new TextDecoder().decode(depuisBase64Url(charge))) as Ticket;
    if (typeof t.uid !== "string" || typeof t.nom !== "string" || typeof t.exp !== "number") return null;
    if (t.role !== "member" && t.role !== "admin") return null;
    if (t.exp <= maintenant) return null;
    return t;
  } catch {
    return null;
  }
}
