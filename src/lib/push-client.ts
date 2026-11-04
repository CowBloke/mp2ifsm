import { clePubliquePush, enregistrerAbonnement, supprimerAbonnement } from "./actions-notifications";

/*
 * Côté navigateur : détection de l'appareil (pour le tutoriel
 * d'installation) et abonnement Web Push.
 */

export type Os = "ios" | "android" | "mac" | "windows" | "linux" | "autre";
export type Navigateur = "safari" | "chrome" | "edge" | "firefox" | "samsung" | "opera" | "autre";

export type Appareil = {
  os: Os;
  navigateur: Navigateur;
  /** Version d'iOS/iPadOS (16.4 = 16.4), null ailleurs. */
  versionIos: number | null;
  mobile: boolean;
  /** Ouvert depuis l'écran d'accueil / comme app installée. */
  installe: boolean;
  /** Le navigateur sait recevoir des notifications ici et maintenant. */
  pushPossible: boolean;
};

/** Événement `beforeinstallprompt` (Chrome, Edge, Samsung), mis de côté au chargement. */
export type InvitationInstallation = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window { __mp2Installation?: InvitationInstallation | null }
}

export function detecterAppareil(): Appareil {
  const ua = navigator.userAgent;
  const ipad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || ipad;
  const android = /Android/i.test(ua);

  let os: Os = "autre";
  if (ios) os = "ios";
  else if (android) os = "android";
  else if (/Macintosh|Mac OS X/.test(ua)) os = "mac";
  else if (/Windows/.test(ua)) os = "windows";
  else if (/Linux|CrOS/.test(ua)) os = "linux";

  let navigateur: Navigateur = "autre";
  if (ios) {
    navigateur = /CriOS/.test(ua) ? "chrome" : /FxiOS/.test(ua) ? "firefox"
      : /EdgiOS/.test(ua) ? "edge" : /OPiOS|OPT\//.test(ua) ? "opera" : "safari";
  } else if (/SamsungBrowser/.test(ua)) navigateur = "samsung";
  else if (/Edg(A|e)?\//.test(ua)) navigateur = "edge";
  else if (/OPR\/|Opera/.test(ua)) navigateur = "opera";
  else if (/Firefox\//.test(ua)) navigateur = "firefox";
  else if (/Chrome\/|Chromium\//.test(ua)) navigateur = "chrome";
  else if (/Safari\//.test(ua)) navigateur = "safari";

  const v = ua.match(/OS (\d+)[_.](\d+)/);
  const versionIos = ios && v ? Number(v[1]) + Number(v[2]) / 10 : null;

  const installe = window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: fullscreen)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return {
    os, navigateur, versionIos, mobile: ios || android, installe,
    pushPossible: "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
  };
}

/** Libellé court enregistré avec l'abonnement (« iPhone · app », « Android · Chrome »…). */
export function libelleAppareil(a: Appareil): string {
  const os = { ios: /iPhone|iPod/.test(navigator.userAgent) ? "iPhone" : "iPad",
    android: "Android", mac: "Mac", windows: "Windows", linux: "Linux", autre: "Appareil" }[a.os];
  const nav = { safari: "Safari", chrome: "Chrome", edge: "Edge", firefox: "Firefox",
    samsung: "Samsung Internet", opera: "Opera", autre: "navigateur" }[a.navigateur];
  return `${os} · ${a.installe ? "app" : nav}`;
}

export async function enregistrerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

function cleVersOctets(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const brut = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) out[i] = brut.charCodeAt(i);
  return out;
}

export type ResultatActivation = { ok: true } | { ok: false; erreur: string; refuse?: boolean };

/**
 * Demande la permission puis abonne cet appareil.
 *
 * À appeler directement depuis un toucher : Safari n'affiche la
 * demande de permission que pendant un geste de l'utilisateur, d'où
 * l'appel à requestPermission avant tout autre `await`.
 */
export async function activerNotifications(): Promise<ResultatActivation> {
  const appareil = detecterAppareil();
  if (!appareil.pushPossible) {
    return { ok: false, erreur: appareil.os === "ios" && !appareil.installe
      ? "Sur iPhone et iPad, installez d’abord l’app sur l’écran d’accueil."
      : "Ce navigateur ne gère pas les notifications." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, refuse: true, erreur: permission === "denied"
      ? "Notifications bloquées : autorisez-les dans les réglages du navigateur pour mp2ifsm.com."
      : "Notifications non autorisées." };
  }
  try {
    const reg = (await enregistrerServiceWorker()) ?? (await navigator.serviceWorker.ready);
    await navigator.serviceWorker.ready;
    let abo = await reg.pushManager.getSubscription();
    if (!abo) {
      const cle = await clePubliquePush();
      if (!cle.ok) return { ok: false, erreur: cle.erreur };
      abo = await reg.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: cleVersOctets(cle.data.cle),
      });
    }
    const r = await enregistrerAbonnement(abo.toJSON(), libelleAppareil(appareil));
    return r.ok ? { ok: true } : { ok: false, erreur: r.erreur };
  } catch (err) {
    console.error(err);
    return { ok: false, erreur: "Impossible d’activer les notifications sur cet appareil." };
  }
}

/** Abonnement push actuel de cet appareil, s'il existe. */
export async function abonnementActuel(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Remet l'abonnement de cet appareil au nom du membre connecté (silencieux). */
export async function resynchroniser(): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const abo = await abonnementActuel();
  if (abo) await enregistrerAbonnement(abo.toJSON(), libelleAppareil(detecterAppareil()));
}

export async function desactiverNotifications(): Promise<void> {
  const abo = await abonnementActuel();
  if (!abo) return;
  await supprimerAbonnement(abo.endpoint);
  await abo.unsubscribe();
}

/* Petite mémoire locale (par appareil). Le stockage peut être bloqué. */
export function lireLocal<T>(cle: string): T | null {
  try { const v = localStorage.getItem(cle); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
export function ecrireLocal(cle: string, valeur: unknown): void {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch { /* navigation privée */ }
}
