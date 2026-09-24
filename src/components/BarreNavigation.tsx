"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { GlassLayer } from "@/components/GlassLayer";

/*
 * Navigation basse, six sections de poids égal.
 *
 * Le marché n'a pas de traitement visuel particulier : c'est une
 * rubrique comme les autres, pour que le site se lise comme un outil
 * de classe qui contient un jeu, et non l'inverse.
 */
const ONGLETS = [
  { href: "/", label: "Accueil",
    icone: "M3 11 12 3l9 8M5 10v10h14V10" },
  { href: "/fiches", label: "Fiches",
    icone: "M4 6h13v13H4zM7 3h13v13" },
  { href: "/colles", label: "Colles",
    icone: "M4 6h16v14H4zM4 10h16M8 3v4m8-4v4" },
  { href: "/documents", label: "Docs",
    icone: "M13 3H6v18h12V8zM13 3v5h5" },
  { href: "/marche", label: "Marché",
    icone: "M4 14h4v6H4zm6-8h4v14h-4zm6 4h4v10h-4z" },
  { href: "/profil", label: "Profil",
    icone: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m0 2c-4 0-7 2-7 4.5V21h14v-2.5c0-2.5-3-4.5-7-4.5" },
];

export function BarreNavigation() {
  const chemin = usePathname();
  const indexActif = ONGLETS.findIndex((o) =>
    o.href === "/" ? chemin === "/" : chemin.startsWith(o.href),
  );

  return (
    <nav aria-label="Navigation principale" className="bottom-nav">
      <GlassLayer />
      <ul
        className="bottom-nav__tabs"
        data-has-active={indexActif >= 0}
        style={{ "--active-tab": Math.max(indexActif, 0) } as CSSProperties}
      >
        {ONGLETS.map((o, index) => {
          const actif = index === indexActif;
          return (
            <li key={o.href} className="min-w-0">
              <Link
                href={o.href}
                aria-current={actif ? "page" : undefined}
                className="bottom-nav__link"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"
                     fill="none" stroke="currentColor" strokeWidth={actif ? 2.1 : 1.6}
                     strokeLinecap="round" strokeLinejoin="round">
                  <path d={o.icone} />
                </svg>
                {o.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
