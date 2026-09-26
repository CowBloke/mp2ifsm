"use client";

import { useState } from "react";
import { COULEURS_PLACES, NOMS_NIVEAUX, catalogue, type AdversaireEntrainement, type OptionsEntrainement } from "@jeu/client";
import { CadreJeu } from "./CadreJeu";
import { ChoixPerso } from "./ChoixPerso";
import { EcranJeu } from "./EcranJeu";

/*
 * Entraînement hors ligne : on choisit son combattant, la carte et un à
 * trois adversaires (mannequin immobile ou bot), puis tout se joue dans
 * le navigateur, sans serveur.
 */

const CATALOGUE = catalogue();
const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

export function Entrainement({ pseudo }: { pseudo: string }) {
  const [perso, setPerso] = useState(CATALOGUE.persos[0].id);
  const [carte, setCarte] = useState(CATALOGUE.cartes[0].id);
  const [adversaires, setAdversaires] = useState<AdversaireEntrainement[]>([{ perso: CATALOGUE.persos[0].id, niveau: 1 }]);
  const [partie, setPartie] = useState<OptionsEntrainement | null>(null);

  if (partie) return <EcranJeu mode="entrainement" options={partie} quitter={() => setPartie(null)} />;

  function modifier(i: number, a: AdversaireEntrainement | null) {
    setAdversaires((liste) => (a === null ? liste.filter((_, j) => j !== i) : liste.map((x, j) => (j === i ? a : x))));
  }

  return (
    <CadreJeu retour={{ href: "/jeu", libelle: "Accueil du jeu" }}>
      <h1 className="text-[32px] font-black leading-tight">Entraînement</h1>
      <p className="mb-6 text-[14px] text-white/60">Hors ligne, dans votre navigateur. Le mannequin ne se défend pas : idéal pour apprendre les coups.</p>

      <section className="mb-6">
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.18em] text-white/50">Votre combattant</h2>
        <ChoixPerso choisi={perso} choisir={setPerso} />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.18em] text-white/50">Adversaires</h2>
        <div className="grid gap-2">
          {adversaires.map((a, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
                 style={{ boxShadow: `inset 4px 0 0 ${css(COULEURS_PLACES[i + 1])}` }}>
              <span className="w-8 text-[12px] font-black" style={{ color: css(COULEURS_PLACES[i + 1]) }}>J{i + 2}</span>
              <select value={a.niveau === null ? "mannequin" : String(a.niveau)} aria-label="Adversaire"
                      onChange={(e) => modifier(i, { ...a, niveau: e.target.value === "mannequin" ? null : Number(e.target.value) })}
                      className="rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[13px]">
                <option value="mannequin">Mannequin (immobile)</option>
                {NOMS_NIVEAUX.map((n, niveau) => <option key={n} value={niveau}>Bot {n.toLowerCase()}</option>)}
              </select>
              {a.niveau !== null ? (
                <select value={a.perso} aria-label="Personnage du bot" onChange={(e) => modifier(i, { ...a, perso: e.target.value })}
                        className="rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[13px]">
                  {CATALOGUE.persos.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
              ) : null}
              {adversaires.length > 1 ? (
                <button type="button" onClick={() => modifier(i, null)}
                        className="ml-auto rounded-lg border border-white/15 px-2 py-1 text-[12px] hover:bg-white/10">
                  Retirer
                </button>
              ) : null}
            </div>
          ))}
          {adversaires.length < 3 ? (
            <button type="button" onClick={() => setAdversaires([...adversaires, { perso: CATALOGUE.persos[0].id, niveau: 1 }])}
                    className="rounded-xl border border-dashed border-white/25 px-3 py-2 text-left text-[13px] font-semibold text-white/70
                               hover:bg-white/10">
              + Ajouter un adversaire
            </button>
          ) : null}
        </div>
      </section>

      <section className="mb-8 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-white/50">Carte</span>
        {CATALOGUE.cartes.map((c) => (
          <button key={c.id} type="button" onClick={() => setCarte(c.id)} aria-pressed={carte === c.id}
                  className={`rounded-full border px-3 py-1.5 text-[13px] font-medium ${carte === c.id
                    ? "border-white/60 bg-white/15" : "border-white/15 hover:bg-white/10"}`}>
            {c.nom}
          </button>
        ))}
      </section>

      <button type="button" onClick={() => setPartie({ pseudo, perso, carte, adversaires })}
              className="self-start rounded-2xl bg-gradient-to-r from-[#3ddc84] to-[#4f8cff] px-8 py-4 text-[18px] font-black
                         text-[#06140c] shadow-lg shadow-[#3ddc84]/20">
        Combattre
      </button>
    </CadreJeu>
  );
}
