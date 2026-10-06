import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { BarreNavigation } from "@/components/BarreNavigation";
import { DemandeGroupe } from "@/components/Groupe";
import { GROUPE_MAX } from "@/lib/colloscope";
import { utilisateurCourant } from "@/lib/session";

export const metadata: Metadata = {
  title: "MP2I/FSM — Portail de classe",
  description:
    "Fiches de révision, colles, documents partagés, échéances et marché de prédiction de la classe MP2I/FSM.",
  applicationName: "mp2ifsm",
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

  return (
    <html lang="fr" className={GeistSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('mp2-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()` }} />
        {/* Jetons partagés de la plateforme (tweakcn) : couleurs et rayons. */}
        <link rel="stylesheet" href="https://cowbloke.com/theme/tweakcn.css" />
        {/* KaTeX auto-hébergé (public/katex) : aucun CDN, la CSP n'a
            donc pas à autoriser d'origine tierce pour les formules. */}
        <link rel="stylesheet" href="/katex/katex.min.css" />
      </head>
      <body className={u ? "has-navigation" : undefined}>
        <a href="#contenu" className="skip-link">Aller au contenu</a>
        <div id="contenu" tabIndex={-1} className="app-content app-shell">{children}</div>
        {u ? <BarreNavigation /> : null}
        {/* Demande de groupe : à chaque connexion tant qu'il manque,
            « Plus tard » la masque pour la session seulement. */}
        {u && u.groupe_colle === null && !u.groupe_reporte ? <DemandeGroupe max={GROUPE_MAX} /> : null}
      </body>
    </html>
  );
}
