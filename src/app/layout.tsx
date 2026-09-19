import { ThemeToggle } from "@/components/ThemeToggle";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BarreNavigation } from "@/components/BarreNavigation";
import { utilisateurCourant } from "@/lib/session";

export const metadata: Metadata = {
  title: "MP2I/FSM — Portail de classe",
  description:
    "Fiches de révision, documents partagés, échéances et marché de prédiction de la classe MP2I/FSM.",
  applicationName: "mp2ifsm",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
      <body>
        <ThemeToggle />
        <div className="mx-auto w-full max-w-[560px] px-4">{children}</div>
        {u ? <BarreNavigation /> : null}
      </body>
    </html>
  );
}
