import http2 from "node:http2";
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";

/*
 * Notifications vers l'app iOS par APNs (HTTP/2, jeton JWT ES256).
 * Sans dépendance : node:http2 et node:crypto. Module pur : il envoie et
 * dit ce qui s'est passé ; notifications.ts tient la base.
 *
 * Configuration (absente : rien ne part vers les iPhone, le reste marche) :
 *   APNS_KEY_ID, APNS_TEAM_ID  identifiants de la clé (compte développeur Apple)
 *   APNS_KEY_PATH              fichier .p8 de la clé (600, hors du dépôt)
 *   APNS_TOPIC                 identifiant de l'app (com.leodiotax.mp2ifsm par défaut)
 *   APNS_URL                   tests seulement : remplace les serveurs d'Apple
 */

export type EnvironnementApns = "sandbox" | "production";
export type ResultatApns = "ok" | "perime" | "echec";
export type NotifApns = { titre: string; corps: string; url: string; tag: string };

type Config = { cle: KeyObject; keyId: string; teamId: string; topic: string };

let config: Config | null | undefined;

function lireConfig(): Config | null {
  if (config !== undefined) return config;
  const { APNS_KEY_ID: keyId, APNS_TEAM_ID: teamId, APNS_KEY_PATH: chemin } = process.env;
  if (!keyId || !teamId || !chemin) return (config = null);
  try {
    config = {
      cle: createPrivateKey(readFileSync(chemin, "utf8")), keyId, teamId,
      topic: process.env.APNS_TOPIC || "com.leodiotax.mp2ifsm",
    };
  } catch (err) {
    console.error("APNs : clé illisible, notifications iOS coupées :", (err as Error).message);
    config = null;
  }
  return config;
}

export function apnsConfigure(): boolean {
  return lireConfig() !== null;
}

// Apple demande de réutiliser le même jeton entre 20 et 60 minutes.
let jwt: { valeur: string; cree: number } | null = null;

function jetonApns(c: Config): string {
  const maintenant = Math.floor(Date.now() / 1000);
  if (jwt && maintenant - jwt.cree < 40 * 60) return jwt.valeur;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const entete = `${b64({ alg: "ES256", kid: c.keyId })}.${b64({ iss: c.teamId, iat: maintenant })}`;
  const signature = sign("sha256", Buffer.from(entete), { key: c.cle, dsaEncoding: "ieee-p1363" });
  jwt = { valeur: `${entete}.${signature.toString("base64url")}`, cree: maintenant };
  return jwt.valeur;
}

const sessions = new Map<string, http2.ClientHttp2Session>();

function origine(env: EnvironnementApns): string {
  return process.env.APNS_URL
    || (env === "production" ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com");
}

function sessionPour(o: string): http2.ClientHttp2Session {
  let s = sessions.get(o);
  if (!s || s.closed || s.destroyed) {
    s = http2.connect(o);
    s.on("error", () => sessions.delete(o));
    s.on("close", () => sessions.delete(o));
    s.unref();
    sessions.set(o, s);
  }
  return s;
}

/** Ferme les connexions ouvertes (tests). */
export function fermerApns(): void {
  for (const s of sessions.values()) s.close();
  sessions.clear();
}

/** Contenu exact envoyé à Apple. */
export function charge(n: NotifApns): string {
  return JSON.stringify({
    aps: { alert: { title: n.titre, body: n.corps }, sound: "default", "thread-id": n.tag },
    url: n.url,
  });
}

export async function pousserApns(jeton: string, env: EnvironnementApns, n: NotifApns): Promise<ResultatApns> {
  const c = lireConfig();
  if (!c || !/^[0-9a-f]{64,200}$/i.test(jeton)) return "echec";
  try {
    const { statut, raison } = await new Promise<{ statut: number; raison?: string }>((resoudre, rejeter) => {
      const req = sessionPour(origine(env)).request({
        ":method": "POST",
        ":path": `/3/device/${jeton}`,
        authorization: `bearer ${jetonApns(c)}`,
        "apns-topic": c.topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        // Une notification périmée n'a pas d'intérêt (le rappel des fiches surtout).
        "apns-expiration": String(Math.floor(Date.now() / 1000) + 6 * 3600),
        "apns-collapse-id": n.tag.slice(0, 64),
        "content-type": "application/json",
      });
      let statut = 0, corps = "";
      req.setTimeout(10_000, () => { req.close(); rejeter(new Error("délai APNs dépassé")); });
      req.on("response", (h) => { statut = Number(h[":status"]); });
      req.setEncoding("utf8");
      req.on("data", (d) => { corps += d; });
      req.on("end", () => {
        let raison: string | undefined;
        try { raison = corps ? JSON.parse(corps).reason : undefined; } catch { /* corps vide ou illisible */ }
        resoudre({ statut, raison });
      });
      req.on("error", rejeter);
      req.end(charge(n));
    });
    if (statut === 200) return "ok";
    // App désinstallée, notifications coupées, ou jeton d'un autre environnement.
    if (statut === 410 || raison === "BadDeviceToken" || raison === "Unregistered" || raison === "DeviceTokenNotForTopic") {
      return "perime";
    }
    if (raison === "ExpiredProviderToken") jwt = null;
    console.error("APNs :", statut, raison);
    return "echec";
  } catch (err) {
    console.error("APNs :", (err as Error).message);
    return "echec";
  }
}

/** Tests : oublie la configuration lue et le jeton en mémoire. */
export function reinitialiserApns(): void {
  config = undefined;
  jwt = null;
  fermerApns();
}
