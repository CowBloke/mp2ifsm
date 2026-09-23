"use client";

import Link from "next/link";
import { NOM_JEU } from "@jeu/client";

/*
 * Cadre commun des menus du jeu : plein écran, sombre, au-dessus de la
 * navigation du site (qui reste accessible par « retour »).
 */
export function CadreJeu({ retour, children }: {
  retour: { href: string; libelle: string; avant?: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#07090f] text-white
                    bg-[radial-gradient(ellipse_at_top,rgba(79,140,255,0.16),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(255,90,95,0.12),transparent_55%)]">
      <div className="mx-auto flex min-h-full max-w-[1040px] flex-col px-4 pb-10 pt-3 sm:px-6">
        <header className="mb-6 flex items-center justify-between gap-3">
          <Link href={retour.href} onClick={retour.avant}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[13px] font-medium hover:bg-white/10">
            ← {retour.libelle}
          </Link>
          <p className="text-[12px] font-black tracking-[0.28em] text-white/45">{NOM_JEU.toUpperCase()}</p>
        </header>
        {children}
      </div>
    </div>
  );
}
