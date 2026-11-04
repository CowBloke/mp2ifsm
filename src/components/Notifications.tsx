"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Dialogue } from "@/components/Dialogue";
import { definirPrefsNotif, envoyerNotifTest, type PrefsNotif } from "@/lib/actions-notifications";
import {
  abonnementActuel, activerNotifications, desactiverNotifications, detecterAppareil,
  ecrireLocal, enregistrerServiceWorker, lireLocal, resynchroniser,
  type Appareil, type InvitationInstallation,
} from "@/lib/push-client";

/*
 * Notifications : trois fenêtres, une seule par chargement de page.
 *
 *   1. Installation (mobile, hors app) : « installer comme une app ? »,
 *      puis un tutoriel propre à l'appareil. Sur iPhone/iPad c'est
 *      obligatoire pour recevoir des notifications.
 *   2. Flash du jour : chaque jour, à une heure surprise (la même pour
 *      toute la classe), une notif propose 3 cartes. Posée une fois.
 *   3. Notifications (dans l'app installée, flash déjà répondu) :
 *      devoirs et messages de la classe.
 *
 * Les réponses « installation » et « notifications » sont gardées sur
 * l'appareil (localStorage) ; celle du flash est en base.
 */

const CLE_INSTALL = "mp2-install";
const CLE_NOTIFS = "mp2-notifs-refus";
const CLE_FLASH_SESSION = "mp2-flash-plus-tard";
const JOUR = 86_400_000;

type ReponseInstall = { reponse: "oui" | "plus-tard" | "non"; at: number };

function installeAttendu(): boolean {
  const r = lireLocal<ReponseInstall>(CLE_INSTALL);
  if (!r) return true;
  if (r.reponse === "non") return false;
  // « Plus tard » : redemandé après 3 jours. Tutoriel vu sans installer : 14 jours.
  return Date.now() - r.at > (r.reponse === "plus-tard" ? 3 : 14) * JOUR;
}

function flashReporte(): boolean {
  try { return sessionStorage.getItem(CLE_FLASH_SESSION) === "1"; } catch { return false; }
}

/* ------------------------------------------------------------------ */
/* Orchestrateur (layout)                                              */
/* ------------------------------------------------------------------ */

type Fenetre = null | "installation" | "tutoriel" | "flash" | "notifications";

export function InvitationsNotifications({
  flashRepondu, enAttente,
}: {
  flashRepondu: boolean;
  /** Une autre fenêtre (groupe de colles) est déjà ouverte : on attend. */
  enAttente: boolean;
}) {
  const [appareil, setAppareil] = useState<Appareil | null>(null);
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  // Jamais pendant une révision (ni le flash lui-même).
  const enRevision = /^\/flash|\/reviser$/.test(usePathname() ?? "");

  useEffect(() => {
    void enregistrerServiceWorker();
    void resynchroniser().catch(() => {});
    const a = detecterAppareil();
    setAppareil(a);
    if (enAttente || enRevision) return;

    const minuteur = window.setTimeout(async () => {
      if (a.mobile && !a.installe && installeAttendu()) { setFenetre("installation"); return; }

      // Le flash n'a de sens que si cet appareil peut recevoir des notifs.
      const permission = a.pushPossible ? Notification.permission : "denied";
      if (!flashRepondu && a.pushPossible && permission !== "denied" && !flashReporte()) {
        setFenetre("flash"); return;
      }

      if (a.installe && a.pushPossible && permission === "default") {
        const refus = lireLocal<number>(CLE_NOTIFS);
        const abo = await abonnementActuel().catch(() => null);
        if (!abo && (!refus || Date.now() - refus > 30 * JOUR)) setFenetre("notifications");
      }
    }, 1200);
    return () => window.clearTimeout(minuteur);
  }, [flashRepondu, enAttente, enRevision]);

  if (!appareil || !fenetre) return null;
  const fermer = () => setFenetre(null);

  if (fenetre === "installation") {
    return (
      <Dialogue titre="Installer l’app MP2I/FSM ?" onFermer={() => {
        ecrireLocal(CLE_INSTALL, { reponse: "plus-tard", at: Date.now() }); fermer();
      }}>
        <div className="flex items-start gap-3">
          <img src="/icons/icon-192.png" alt="" width={56} height={56} className="shrink-0 rounded-[14px]" />
          <p className="text-[15px] leading-relaxed text-[var(--muted-foreground)]">
            Ajoutez le portail à votre écran d’accueil pour l’ouvrir comme une vraie app et recevoir
            les <strong className="text-[var(--foreground)]">notifications</strong> : devoirs à rendre,
            messages importants de la classe, fiches du jour…
          </p>
        </div>
        {appareil.os === "ios" && (
          <p className="mt-3 text-[13px] text-[var(--muted-foreground)]">
            Sur iPhone et iPad, les notifications ne marchent qu’une fois l’app installée.
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" className="bouton-principal" onClick={() => {
            ecrireLocal(CLE_INSTALL, { reponse: "oui", at: Date.now() });
            setFenetre("tutoriel");
          }}>
            Oui, montrez-moi comment
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="h-11 rounded-[var(--radius-md)] border text-[14px] font-medium"
                    onClick={() => { ecrireLocal(CLE_INSTALL, { reponse: "plus-tard", at: Date.now() }); fermer(); }}>
              Plus tard
            </button>
            <button type="button" className="h-11 rounded-[var(--radius-md)] text-[14px] font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                    onClick={() => { ecrireLocal(CLE_INSTALL, { reponse: "non", at: Date.now() }); fermer(); }}>
              Non merci
            </button>
          </div>
        </div>
      </Dialogue>
    );
  }

  if (fenetre === "tutoriel") {
    return (
      <Dialogue titre="Installer l’app" onFermer={fermer}>
        <TutorielInstallation appareil={appareil} onFini={fermer} />
      </Dialogue>
    );
  }

  if (fenetre === "flash") {
    return <FenetreFlash onFermer={fermer} />;
  }

  return <FenetreNotifications onFermer={fermer} />;
}

/* ------------------------------------------------------------------ */
/* Flash du jour                                                       */
/* ------------------------------------------------------------------ */

function FenetreFlash({ onFermer }: { onFermer: () => void }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [ok, setOk] = useState(false);

  async function oui() {
    setEnCours(true); setErreur(null);
    const r = await activerNotifications();
    if (!r.ok) {
      setErreur(r.erreur); setEnCours(false);
      // Permission refusée : la réponse vaut « non », on ne redemande pas.
      if (r.refuse) await definirPrefsNotif({ flash: false });
      return;
    }
    const p = await definirPrefsNotif({ flash: true });
    setEnCours(false);
    if (!p.ok) { setErreur(p.erreur); return; }
    setOk(true);
  }

  function plusTard() {
    try { sessionStorage.setItem(CLE_FLASH_SESSION, "1"); } catch { /* ignoré */ }
    onFermer();
  }

  if (ok) {
    return (
      <Dialogue titre="C’est noté ⚡" onFermer={onFermer}>
        <p className="text-[15px] leading-relaxed text-[var(--muted-foreground)]">
          Chaque jour, entre 11 h et 21 h 30, la même notif tombe pour toute la classe.
          Ouvrez-la vite : 3 cartes, et un badge « À l’heure » si vous répondez dans les 10 minutes.
        </p>
        <button type="button" className="bouton-principal mt-5" onClick={onFermer}>Parfait</button>
      </Dialogue>
    );
  }

  return (
    <Dialogue titre="⚡ Le flash du jour" onFermer={plusTard}>
      <p className="text-[15px] leading-relaxed text-[var(--muted-foreground)]">
        Une notif par jour, à une <strong className="text-[var(--foreground)]">heure surprise</strong> —
        comme BeReal. Elle ouvre <strong className="text-[var(--foreground)]">2 ou 3 fiches</strong> de vos
        paquets suivis, pas plus. Deux minutes, et c’est fait.
      </p>
      <ul className="mt-4 flex flex-col gap-2 text-[14px]">
        <li className="flex gap-2"><span aria-hidden="true">🎲</span> Même heure pour toute la classe, entre 11 h et 21 h 30</li>
        <li className="flex gap-2"><span aria-hidden="true">🃏</span> Les cartes dues d’abord, sinon des nouvelles</li>
        <li className="flex gap-2"><span aria-hidden="true">⏱️</span> « À l’heure » si vous répondez dans les 10 minutes</li>
      </ul>
      {erreur && <p role="alert" className="mt-3 text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" className="bouton-principal" disabled={enCours} onClick={() => void oui()}>
          {enCours ? "Activation…" : "Oui, je veux le flash"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="h-11 rounded-[var(--radius-md)] border text-[14px] font-medium"
                  onClick={plusTard}>Plus tard</button>
          <button type="button" disabled={enCours}
                  className="h-11 rounded-[var(--radius-md)] text-[14px] font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                  onClick={async () => { await definirPrefsNotif({ flash: false }); onFermer(); }}>
            Non merci
          </button>
        </div>
        <p className="text-center text-[12px] text-[var(--muted-foreground)]">Modifiable à tout moment dans le profil.</p>
      </div>
    </Dialogue>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications (app installée)                                       */
/* ------------------------------------------------------------------ */

function FenetreNotifications({ onFermer }: { onFermer: () => void }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  return (
    <Dialogue titre="Activer les notifications ?" onFermer={() => { ecrireLocal(CLE_NOTIFS, Date.now()); onFermer(); }}>
      <p className="text-[15px] leading-relaxed text-[var(--muted-foreground)]">
        Un rappel la veille des devoirs et DS (à 19 h), et les messages importants de la classe.
        Rien d’autre — chaque type se coupe dans le profil.
      </p>
      {erreur && <p role="alert" className="mt-3 text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" className="bouton-principal" disabled={enCours} onClick={async () => {
          setEnCours(true); setErreur(null);
          const r = await activerNotifications();
          setEnCours(false);
          if (r.ok) onFermer(); else setErreur(r.erreur);
        }}>
          {enCours ? "Activation…" : "Activer"}
        </button>
        <button type="button" className="h-11 rounded-[var(--radius-md)] text-[14px] font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                onClick={() => { ecrireLocal(CLE_NOTIFS, Date.now()); onFermer(); }}>
          Pas maintenant
        </button>
      </div>
    </Dialogue>
  );
}

/* ------------------------------------------------------------------ */
/* Tutoriel d'installation, selon l'appareil                           */
/* ------------------------------------------------------------------ */

const IconePartageIos = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" aria-label="Partager" className="inline -mt-1">
    <path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1" />
  </svg>
);
const IconeAjout = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" aria-hidden="true" className="inline -mt-1">
    <rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" />
  </svg>
);
const IconeMenu = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-label="Menu" className="inline -mt-1">
    <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
  </svg>
);
const IconeInstaller = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline -mt-1">
    <rect x="3" y="4" width="18" height="13" rx="2" /><path d="M12 8v6M9 11l3 3 3-3M8 21h8" />
  </svg>
);

type Etape = React.ReactNode;

function etapesPour(a: Appareil): { etapes: Etape[]; note?: string } {
  const b = (t: string) => <strong>{t}</strong>;
  const ouvrir = <>Ouvrez {b("MP2I/FSM")} depuis l’écran d’accueil, puis acceptez les notifications.</>;

  if (a.os === "ios") {
    const ancien = a.versionIos !== null && a.versionIos < 16.4;
    const ipad = /iPad/.test(navigator.userAgent) || !/iPhone|iPod/.test(navigator.userAgent);
    if (a.navigateur === "safari") {
      return {
        etapes: [
          <>Touchez le bouton {b("Partager")} <IconePartageIos /> {ipad ? "en haut à droite" : "en bas de l’écran"}.</>,
          <>Faites défiler et touchez {b("Sur l’écran d’accueil")} <IconeAjout />.</>,
          <>Touchez {b("Ajouter")} en haut à droite.</>,
          ouvrir,
        ],
        note: ancien ? "Votre iOS est trop ancien pour les notifications web : mettez à jour vers iOS 16.4 ou plus." : undefined,
      };
    }
    return {
      etapes: [
        <>Touchez {b("Partager")} <IconePartageIos /> {a.navigateur === "chrome" ? "dans la barre d’adresse (en haut à droite)" : "dans le menu du navigateur"}.</>,
        <>Choisissez {b("Sur l’écran d’accueil")} <IconeAjout /> (faites défiler si besoin).</>,
        <>Touchez {b("Ajouter")}.</>,
        ouvrir,
      ],
      note: ancien
        ? "Votre iOS est trop ancien pour les notifications web : mettez à jour vers iOS 16.4 ou plus."
        : "Si l’option n’apparaît pas, ouvrez mp2ifsm.com dans Safari et recommencez.",
    };
  }

  if (a.os === "android") {
    if (a.navigateur === "samsung") {
      return { etapes: [
        <>Touchez le menu {b("≡")} en bas à droite.</>,
        <>Choisissez {b("Ajouter la page à")} puis {b("Écran d’accueil")}.</>,
        <>Confirmez avec {b("Ajouter")}.</>,
        ouvrir,
      ] };
    }
    if (a.navigateur === "firefox") {
      return { etapes: [
        <>Touchez le menu <IconeMenu /> en haut ou en bas à droite.</>,
        <>Choisissez {b("Ajouter à l’écran d’accueil")} (ou {b("Installer")}).</>,
        <>Confirmez avec {b("Ajouter")}.</>,
        ouvrir,
      ] };
    }
    return { etapes: [
      <>Touchez le menu <IconeMenu /> en haut à droite.</>,
      <>Choisissez {b("Installer l’application")} (ou {b("Ajouter à l’écran d’accueil")}).</>,
      <>Confirmez avec {b("Installer")}.</>,
      ouvrir,
    ] };
  }

  if (a.os === "mac" && a.navigateur === "safari") {
    return { etapes: [
      <>Dans la barre des menus, ouvrez {b("Fichier")}.</>,
      <>Choisissez {b("Ajouter au Dock…")} puis {b("Ajouter")}.</>,
      <>Ouvrez MP2I/FSM depuis le Dock et autorisez les notifications.</>,
    ], note: "Nécessite macOS Sonoma (14) ou plus récent." };
  }

  if (a.navigateur === "firefox") {
    return { etapes: [
      <>Firefox sur ordinateur n’installe pas les sites, mais les notifications marchent directement ici.</>,
    ] };
  }

  if (a.navigateur === "edge") {
    return { etapes: [
      <>Cliquez sur l’icône {b("Installer")} <IconeInstaller /> à droite de la barre d’adresse,</>,
      <>ou ouvrez le menu {b("…")} → {b("Applications")} → {b("Installer ce site en tant qu’application")}.</>,
      <>Confirmez avec {b("Installer")}.</>,
    ] };
  }

  return { etapes: [
    <>Cliquez sur l’icône {b("Installer")} <IconeInstaller /> à droite de la barre d’adresse,</>,
    <>ou ouvrez le menu <IconeMenu /> → {b("Caster, enregistrer et partager")} → {b("Installer la page en tant qu’application")}.</>,
    <>Confirmez avec {b("Installer")}.</>,
  ] };
}

export function TutorielInstallation({ appareil, onFini }: { appareil: Appareil; onFini: () => void }) {
  const [invitation, setInvitation] = useState<InvitationInstallation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [actif, setActif] = useState(false);

  useEffect(() => {
    // Chrome, Edge et Samsung proposent l'installation en un toucher.
    // iOS n'émet jamais cette invitation ; un émulateur pourrait.
    if (appareil.os === "ios") return;
    setInvitation(window.__mp2Installation ?? null);
    const surInvitation = () => setInvitation(window.__mp2Installation ?? null);
    window.addEventListener("mp2-installation", surInvitation);
    return () => window.removeEventListener("mp2-installation", surInvitation);
  }, [appareil.os]);

  if (appareil.installe) {
    return (
      <div>
        <p className="text-[15px] text-[var(--muted-foreground)]">L’app est déjà installée sur cet appareil.</p>
        <button type="button" className="bouton-principal mt-5" onClick={onFini}>Fermer</button>
      </div>
    );
  }

  const { etapes, note } = etapesPour(appareil);
  const directOk = appareil.pushPossible && !appareil.mobile;

  return (
    <div>
      {invitation && (
        <>
          <button type="button" className="bouton-principal" onClick={async () => {
            await invitation.prompt();
            const choix = await invitation.userChoice;
            window.__mp2Installation = null;
            setInvitation(null);
            if (choix.outcome === "accepted") onFini();
          }}>
            Installer maintenant
          </button>
          <p className="mt-4 text-[13px] text-[var(--muted-foreground)]">Ou à la main :</p>
        </>
      )}
      <ol className="mt-2 flex flex-col gap-3">
        {etapes.map((e, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-snug">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--secondary)] text-[13px] font-semibold text-[var(--secondary-foreground)]">
              {i + 1}
            </span>
            <span className="pt-0.5">{e}</span>
          </li>
        ))}
      </ol>
      {note && <p className="mt-4 text-[13px] text-[var(--muted-foreground)]">{note}</p>}
      {erreur && <p role="alert" className="mt-3 text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}
      <div className="mt-5 flex flex-col gap-2">
        {directOk && (
          <button type="button" className="h-11 rounded-[var(--radius-md)] border text-[14px] font-medium"
                  disabled={actif} onClick={async () => {
                    setActif(true); setErreur(null);
                    const r = await activerNotifications();
                    setActif(false);
                    if (r.ok) onFini(); else setErreur(r.erreur);
                  }}>
            Activer les notifications sans installer
          </button>
        )}
        <button type="button" className={invitation ? "lien-discret justify-center" : "bouton-principal"} onClick={onFini}>
          J’ai compris
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Profil : réglages des notifications                                 */
/* ------------------------------------------------------------------ */

type EtatAppareil = "chargement" | "actif" | "inactif" | "bloque" | "installer" | "impossible";

export function ReglagesNotifications({ initial }: { initial: PrefsNotif }) {
  const [appareil, setAppareil] = useState<Appareil | null>(null);
  const [etat, setEtat] = useState<EtatAppareil>("chargement");
  const [prefs, setPrefs] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [tutoriel, setTutoriel] = useState(false);
  const [enCours, demarrer] = useTransition();

  async function rafraichir() {
    const a = detecterAppareil();
    setAppareil(a);
    if (!a.pushPossible) { setEtat(a.os === "ios" && !a.installe ? "installer" : "impossible"); return; }
    if (Notification.permission === "denied") { setEtat("bloque"); return; }
    const abo = await abonnementActuel().catch(() => null);
    setEtat(abo && Notification.permission === "granted" ? "actif" : "inactif");
  }
  useEffect(() => { void rafraichir(); }, []);

  function basculer(cle: keyof PrefsNotif, valeur: boolean) {
    const avant = prefs;
    setPrefs({ ...prefs, [cle]: valeur });
    demarrer(async () => {
      const r = await definirPrefsNotif({ [cle]: valeur });
      if (!r.ok) { setPrefs(avant); setMessage(r.erreur); }
    });
  }

  const statut: Record<EtatAppareil, string> = {
    chargement: "…",
    actif: "Activées sur cet appareil",
    inactif: "Désactivées sur cet appareil",
    bloque: "Bloquées dans les réglages du navigateur",
    installer: "Installez l’app pour les recevoir",
    impossible: "Non prises en charge par ce navigateur",
  };

  return (
    <section aria-label="Notifications">
      <h2 className="etiquette mb-2">Notifications</h2>

      <div className="ligne">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="ligne__titre">Cet appareil</span>
          <span className="ligne__meta">{statut[etat]}</span>
        </span>
        {etat === "inactif" && (
          <button type="button" disabled={enCours} className="puce" onClick={async () => {
            setMessage(null);
            const r = await activerNotifications();
            if (!r.ok) setMessage(r.erreur);
            await rafraichir();
          }}>Activer</button>
        )}
        {etat === "actif" && (
          <button type="button" disabled={enCours} className="puce" onClick={async () => {
            await desactiverNotifications(); await rafraichir();
          }}>Désactiver</button>
        )}
        {(etat === "installer" || (appareil && !appareil.installe && appareil.mobile && etat !== "actif")) && (
          <button type="button" className="puce" onClick={() => setTutoriel(true)}>Installer</button>
        )}
      </div>

      <label className="ligne cursor-pointer">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="ligne__titre">⚡ Flash du jour</span>
          <span className="ligne__meta">3 fiches à une heure surprise, chaque jour</span>
        </span>
        <input type="checkbox" checked={prefs.flash} disabled={enCours}
               onChange={(e) => basculer("flash", e.target.checked)}
               className="h-5 w-5 shrink-0 accent-[var(--primary)]" />
      </label>
      <label className="ligne cursor-pointer">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="ligne__titre">Devoirs et DS</span>
          <span className="ligne__meta">La veille à 19 h</span>
        </span>
        <input type="checkbox" checked={prefs.devoirs} disabled={enCours}
               onChange={(e) => basculer("devoirs", e.target.checked)}
               className="h-5 w-5 shrink-0 accent-[var(--primary)]" />
      </label>
      <label className="ligne cursor-pointer">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="ligne__titre">Messages de la classe</span>
          <span className="ligne__meta">Quand un admin publie un message important</span>
        </span>
        <input type="checkbox" checked={prefs.messages} disabled={enCours}
               onChange={(e) => basculer("messages", e.target.checked)}
               className="h-5 w-5 shrink-0 accent-[var(--primary)]" />
      </label>

      {etat === "actif" && (
        <button type="button" disabled={enCours} className="lien-discret" onClick={() => demarrer(async () => {
          setMessage(null);
          const r = await envoyerNotifTest();
          setMessage(!r.ok ? r.erreur : r.data.appareils > 0
            ? "Notification envoyée — elle arrive dans quelques secondes."
            : "Aucun appareil n’a pu être joint. Désactivez puis réactivez.");
        })}>
          Envoyer une notification de test
        </button>
      )}
      {message && <p role="status" className="mt-1 text-[13px] text-[var(--muted-foreground)]">{message}</p>}

      {tutoriel && appareil && (
        <Dialogue titre="Installer l’app" onFermer={() => setTutoriel(false)}>
          <TutorielInstallation appareil={appareil} onFini={() => setTutoriel(false)} />
        </Dialogue>
      )}
    </section>
  );
}
