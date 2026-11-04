import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { BarreNavigation } from "@/components/BarreNavigation";
import { DemandeGroupe } from "@/components/Groupe";
import { GROUPE_MAX } from "@/lib/colloscope";
import { utilisateurCourant } from "@/lib/session";
import { InvitationsNotifications } from "@/components/Notifications";
import { lireEtatNotif } from "@/lib/notif-prefs";

export const metadata: Metadata = {
  title: "MP2I/FSM — Portail de classe",
  description:
    "Fiches de révision, colles, documents partagés, échéances et marché de prédiction de la classe MP2I/FSM.",
  applicationName: "mp2ifsm",
  // Web app installable (écran d'accueil) : indispensable aux notifications sur iOS.
  appleWebApp: { capable: true, title: "MP2I/FSM", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f9f9f9",
};

/*
 * Pas de barre du haut : chaque page porte son propre titre. Le profil
 * (thème, retours, portefeuille) s'ouvre depuis l'avatar de l'accueil.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const u = await utilisateurCourant();
  const notif = u ? await lireEtatNotif(u.id) : null;
  const demandeGroupe = !!u && u.groupe_colle === null && !u.groupe_reporte;

  return (
    <html lang="fr" className={GeistSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('mp2-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()` }} />
        {/* Jetons partagés de la plateforme (tweakcn) : couleurs et rayons. */}
        <link rel="stylesheet" href="https://cowbloke.com/theme/tweakcn.css" />
        {/* KaTeX auto-hébergé (public/katex) : aucun CDN, la CSP n'a
            donc pas à autoriser d'origine tierce pour les formules. */}
        <link rel="stylesheet" href="/katex/katex.min.css" />
        {/* L'invitation d'installation (Chrome, Edge, Samsung) part avant
            l'hydratation : on la met de côté pour le tutoriel. */}
        <script dangerouslySetInnerHTML={{ __html: `addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__mp2Installation=e;dispatchEvent(new Event('mp2-installation'))});addEventListener('appinstalled',function(){window.__mp2Installation=null})` }} />
      </head>
      <body className={u ? "has-navigation" : undefined}>
        <a href="#contenu" className="skip-link">Aller au contenu</a>
        <div id="contenu" tabIndex={-1} className="app-content app-shell">{children}</div>
        {u ? <BarreNavigation /> : null}
        {/* Demande de groupe : à chaque connexion tant qu'il manque,
            « Plus tard » la masque pour la session seulement. */}
        {demandeGroupe ? <DemandeGroupe max={GROUPE_MAX} /> : null}
        {/* Installation de l'app, flash du jour, notifications : une
            fenêtre au plus par page, jamais par-dessus la demande de groupe. */}
        {u && notif ? <InvitationsNotifications flashRepondu={notif.flash_repondu} enAttente={demandeGroupe} /> : null}
      </body>
    </html>
  );
}
