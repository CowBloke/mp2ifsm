"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
 * Navigation basse : cinq rubriques de poids égal, barre plate.
 * Le profil n'est pas un onglet : on l'ouvre depuis l'avatar de l'accueil.
 */
const ONGLETS: { href: string; label: string; icone: string; aussi?: string[] }[] = [
  { href: "/", label: "Accueil", icone: "M3 11 12 3l9 8M5 10v10h14V10" },
  { href: "/fiches", label: "Fiches", icone: "M4 6h13v13H4zM7 3h13v13" },
  { href: "/colles", label: "Colles", icone: "M4 6h16v14H4zM4 10h16M8 3v4m8-4v4" },
  { href: "/documents", label: "Documents", icone: "M13 3H6v18h12V8zM13 3v5h5" },
  {
    href: "/divertissement", label: "Divertissement",
    icone: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1",
    // Le marché et les réels vivent sous cet onglet.
    aussi: ["/marche"],
  },
];

export function BarreNavigation() {
  const chemin = usePathname();

  return (
    <nav aria-label="Navigation principale" className="bottom-nav">
      <ul className="bottom-nav__tabs">
        {ONGLETS.map((o) => {
          const actif = o.href === "/" ? chemin === "/"
            : [o.href, ...(o.aussi ?? [])].some((h) => chemin.startsWith(h));
          return (
            <li key={o.href} className="min-w-0">
              <Link href={o.href} aria-current={actif ? "page" : undefined} className="bottom-nav__link">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
                     fill="none" stroke="currentColor" strokeWidth={actif ? 2 : 1.6}
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
