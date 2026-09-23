"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NOM_JEU } from "@jeu/client";
import { CadreJeu } from "./CadreJeu";
import { obtenirConnexion, useEtatConnexion } from "./connexion";

/*
 * Accueil du jeu : s'entraîner seul, créer un salon, en rejoindre un ou
 * regarder une partie par son code.
 */
export function Hub({ urlJeu, pseudo }: { urlJeu: string | null; pseudo: string }) {
  const router = useRouter();
  const connexion = obtenirConnexion(urlJeu);
  const etat = useEtatConnexion(connexion);
  const [code, setCode] = useState("");
  /** Code du salon quitté au moment de créer (« » sinon) ; null tant qu'on ne crée pas. */
  const [creation, setCreation] = useState<string | null>(null);
  const codeValide = /^[A-Z0-9]{4}$/.test(code);

  // Le nouveau salon arrive : on y va.
  useEffect(() => {
    if (creation !== null && etat.salon && etat.salon.code !== creation) router.push(`/jeu/salon/${etat.salon.code}`, { scroll: false });
  }, [creation, etat.salon, router]);

  function creer() {
    connexion.effacerErreur();
    setCreation(etat.salon?.code ?? "");
    connexion.envoyer({ t: "creer" });
  }

  return (
    <CadreJeu retour={{ href: "/", libelle: "Portail", avant: () => connexion.fermer() }}>
      <section className="mb-8 text-center">
        <h1 className="bg-gradient-to-r from-[#4f8cff] via-white to-[#ff5a5f] bg-clip-text text-[40px] font-black
                       leading-none tracking-tight text-transparent sm:text-[64px]">
          {NOM_JEU}
        </h1>
        <p className="mt-2 text-[14px] text-white/60">Le jeu de combat de la MP2I · 2 à 4 joueurs · 3 manches</p>
        <p className="mt-1 text-[12px] text-white/40">Connecté·e en tant que {pseudo}</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/jeu/entrainement"
              className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-white/25 hover:bg-white/[0.07]">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#3ddc84]">Seul</p>
          <h2 className="mt-1 text-[22px] font-extrabold">S’entraîner</h2>
          <p className="mt-1 text-[13px] text-white/60">Contre le mannequin ou des bots, sans connexion : pour apprendre les coups.</p>
        </Link>

        <button type="button" onClick={creer} disabled={etat.statut !== "connecte" || creation !== null}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition hover:border-white/25
                           hover:bg-white/[0.07] disabled:opacity-60">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#4f8cff]">Entre amis</p>
          <h2 className="mt-1 text-[22px] font-extrabold">{creation !== null ? "Création…" : "Créer un salon"}</h2>
          <p className="mt-1 text-[13px] text-white/60">
            {etat.statut === "connecte" ? "Un code à quatre caractères à partager, des bots pour compléter."
              : etat.statut === "refuse" ? etat.refus : "Connexion au serveur de jeu…"}
          </p>
        </button>

        <form className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:col-span-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (codeValide) router.push(`/jeu/salon/${code}`, { scroll: false });
              }}>
          <h2 className="text-[18px] font-extrabold">Rejoindre ou regarder</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
                   placeholder="CODE" aria-label="Code du salon" autoCapitalize="characters" inputMode="text"
                   className="w-[140px] rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-center text-[22px] font-black
                              tracking-[0.3em] placeholder:text-white/20 focus:border-[#4f8cff] focus:outline-none" />
            <button type="submit" disabled={!codeValide}
                    className="rounded-xl bg-[#4f8cff] px-5 py-3 text-[14px] font-bold disabled:opacity-40">
              Rejoindre
            </button>
            <button type="button" disabled={!codeValide} onClick={() => router.push(`/jeu/regarder/${code}`, { scroll: false })}
                    className="rounded-xl border border-white/20 px-5 py-3 text-[14px] font-bold disabled:opacity-40">
              Regarder
            </button>
          </div>
        </form>
      </div>

      {etat.erreur ? (
        <p className="mt-4 rounded-xl bg-[#ff5a5f]/15 px-4 py-3 text-[13px] text-[#ffb3b5]">{etat.erreur}</p>
      ) : null}
    </CadreJeu>
  );
}
