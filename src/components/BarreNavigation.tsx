"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
 * Navigation basse, cinq sections de poids égal.
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
  { href: "/documents", label: "Documents",
    icone: "M13 3H6v18h12V8zM13 3v5h5" },
  { href: "/marche", label: "Marché",
    icone: "M4 14h4v6H4zm6-8h4v14h-4zm6 4h4v10h-4z" },
  { href: "/profil", label: "Profil",
    icone: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m0 2c-4 0-7 2-7 4.5V21h14v-2.5c0-2.5-3-4.5-7-4.5" },
];

export function BarreNavigation() {
  const chemin = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-[var(--card)]/95 backdrop-blur
                 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex w-full max-w-[560px]">
        {ONGLETS.map((o) => {
          const actif = o.href === "/" ? chemin === "/" : chemin.startsWith(o.href);
          return (
            <li key={o.href} className="flex-1">
              <Link
                href={o.href}
                aria-current={actif ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[10px]
                            font-medium transition-colors ${
                              actif
                                ? "text-[var(--primary)]"
                                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            }`}
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
