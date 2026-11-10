"use client";

import Link from "next/link";

/*
 * Cadre de Curve Fight : plein écran, sombre, au-dessus de la navigation
 * du site. Le jeu a sa propre ambiance (tableau noir et néons), les
 * rayons et la police restent ceux de la plateforme.
 */
export function Cadre({ retour, large, droite, children }: {
  retour: { href: string; libelle: string; avant?: () => void };
  large?: boolean;
  droite?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="cf-cadre fixed inset-0 z-[60] overflow-y-auto text-white">
      <div className={`mx-auto flex min-h-full flex-col px-4 pb-10 pt-3 sm:px-6 ${large ? "max-w-[1320px]" : "max-w-[980px]"}`}>
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link href={retour.href} onClick={retour.avant} className="cf-pastille">← {retour.libelle}</Link>
          <div className="flex items-center gap-2">
            {droite}
            <p className="hidden text-[11px] font-black tracking-[0.3em] text-white/40 sm:block">CURVE FIGHT</p>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
