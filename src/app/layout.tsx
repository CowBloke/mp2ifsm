import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";
import { GlassLayer } from "@/components/GlassLayer";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BarreNavigation } from "@/components/BarreNavigation";
import { BoutonRetour } from "@/components/BoutonRetour";
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
  themeColor: "#f7f7f7",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const u = await utilisateurCourant();

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('mp2-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()` }} />
        {/* KaTeX auto-hébergé (public/katex) : aucun CDN, la CSP n'a
            donc pas à autoriser d'origine tierce pour les formules. */}
        <link rel="stylesheet" href="/katex/katex.min.css" />
      </head>
      <body className={u ? "has-navigation" : undefined}>
        <a href="#contenu" className="skip-link">Aller au contenu</a>
        <header className="app-header app-shell">
          <div className="app-header__bar">
            <GlassLayer />
            <Link href="/" className="app-brand" aria-label="MP2I/FSM — Accueil">
              <span className="app-brand__mark" aria-hidden="true">m</span>
              <span>MP2I<span className="app-brand__separator">/</span>FSM</span>
            </Link>
            <div className="app-header__actions">
              {u ? <span className="app-member">{u.display_name}</span> : null}
              {u ? <BoutonRetour /> : null}
              <ThemeToggle />
            </div>
          </div>
        </header>
        <div id="contenu" tabIndex={-1} className="app-content app-shell">{children}</div>
        {u ? <BarreNavigation /> : null}
        {/* Demande de groupe : à chaque connexion tant qu'il manque,
            « Plus tard » la masque pour la session seulement. */}
        {u && u.groupe_colle === null && !u.groupe_reporte ? <DemandeGroupe max={GROUPE_MAX} /> : null}
      </body>
    </html>
  );
}
