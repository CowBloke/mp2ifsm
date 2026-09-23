"use client";

import { catalogue } from "@jeu/client";
import { ApercuPerso } from "./ApercuPerso";

const CATALOGUE = catalogue();

/** Choix du combattant : l'aperçu animé du personnage choisi, et les fiches de tous. */
export function ChoixPerso({ choisi, choisir }: { choisi: string; choisir: (id: string) => void }) {
  const fiche = CATALOGUE.persos.find((p) => p.id === choisi) ?? CATALOGUE.persos[0];
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f1a]">
        <ApercuPerso perso={fiche.id} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-3 pt-10">
          <p className="text-[22px] font-black leading-tight">{fiche.nom}</p>
          <p className="text-[13px] font-semibold" style={{ color: fiche.couleur }}>{fiche.role}</p>
        </div>
      </div>
      <div className="grid content-start gap-3 sm:grid-cols-2">
        {CATALOGUE.persos.map((p) => (
          <button key={p.id} type="button" onClick={() => choisir(p.id)} aria-pressed={choisi === p.id}
                  className={`rounded-2xl border p-4 text-left transition ${choisi === p.id
                    ? "border-white/60 bg-white/[0.10]" : "border-white/10 bg-white/[0.04] hover:border-white/25"}`}
                  style={choisi === p.id ? { boxShadow: `inset 4px 0 0 ${p.couleur}` } : undefined}>
            <p className="text-[18px] font-extrabold">{p.nom}</p>
            <p className="text-[12px] font-semibold" style={{ color: p.couleur }}>{p.role}</p>
            <p className="mt-1 text-[13px] leading-snug text-white/60">{p.resume}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
