"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COULEURS_PLACES, NOMS_NIVEAUX, catalogue, type EtatSalon, type PlaceVue } from "@jeu/client";
import { CadreJeu } from "./CadreJeu";
import { EcranJeu } from "./EcranJeu";
import { obtenirConnexion, useEtatConnexion } from "./connexion";

/*
 * Salon : les quatre places, le choix du personnage, « prêt », les
 * réglages de l'hôte (carte, bots, lancement). Quand la partie démarre,
 * l'écran de jeu prend toute la place ; à la fin, retour ici.
 */

const NIVEAUX = NOMS_NIVEAUX;
const CATALOGUE = catalogue();
const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

export function Salon({ code, urlJeu, spectateur = false }: { code: string; urlJeu: string | null; spectateur?: boolean }) {
  const router = useRouter();
  const connexion = obtenirConnexion(urlJeu);
  const etat = useEtatConnexion(connexion);
  const demande = useRef<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);

  // Entrer dans le salon (ou le regarder) une fois connecté.
  useEffect(() => {
    if (etat.statut !== "connecte") return;
    if (etat.salon?.code === code) return;
    const cle = `${spectateur ? "regarder" : "rejoindre"}:${code}`;
    if (demande.current === cle) return;
    demande.current = cle;
    connexion.effacerErreur();
    connexion.envoyer({ t: spectateur ? "regarder" : "rejoindre", code });
  }, [etat.statut, etat.salon?.code, code, spectateur, connexion]);

  function quitter() {
    connexion.envoyer({ t: "quitter" });
    demande.current = null;
    router.push("/jeu", { scroll: false });
  }

  const salon = etat.salon?.code === code ? etat.salon : null;
  const moi = salon?.places.findIndex((p) => p?.uid === etat.uid) ?? -1;

  if (etat.partie && salon) {
    return <EcranJeu mode="reseau" connexion={connexion} partie={etat.partie} etat={etat} quitter={quitter} />;
  }

  return (
    <CadreJeu retour={{ href: "/jeu", libelle: "Quitter le salon", avant: () => connexion.envoyer({ t: "quitter" }) }}>
      {!salon ? (
        <div className="mt-10 text-center">
          {etat.erreur ? (
            <p className="text-[15px] text-[#ffb3b5]">{etat.erreur}</p>
          ) : etat.statut === "refuse" ? (
            <p className="text-[15px] text-[#ffb3b5]">{etat.refus}</p>
          ) : (
            <p className="text-[15px] text-white/60">Connexion au salon {code}…</p>
          )}
        </div>
      ) : (
        <VueSalon salon={salon} moi={moi} uid={etat.uid} spectateur={spectateur}
                  envoyer={connexion.envoyer} copie={copie}
                  copier={(quoi, texte) => {
                    navigator.clipboard?.writeText(texte).then(() => setCopie(quoi)).catch(() => setCopie(null));
                    setTimeout(() => setCopie(null), 1800);
                  }} />
      )}
      {salon && etat.erreur ? (
        <button type="button" onClick={() => connexion.effacerErreur()}
                className="mt-4 w-full rounded-xl bg-[#ff5a5f]/15 px-4 py-3 text-left text-[13px] text-[#ffb3b5]">
          {etat.erreur} <span className="text-white/40">(fermer)</span>
        </button>
      ) : null}
    </CadreJeu>
  );
}

type Envoyer = ReturnType<typeof obtenirConnexion>["envoyer"];

function VueSalon({ salon, moi, uid, spectateur, envoyer, copie, copier }: {
  salon: EtatSalon; moi: number; uid: string | null; spectateur: boolean; envoyer: Envoyer;
  copie: string | null; copier: (quoi: string, texte: string) => void;
}) {
  const hote = salon.hote === uid;
  const place = moi >= 0 ? salon.places[moi] : null;
  const occupees = salon.places.filter(Boolean).length;
  const attente = salon.places.filter((p, i) => p && p.bot === null && p.uid !== salon.hote && !p.pret && i !== -1);
  const lancable = occupees >= 2 && attente.length === 0;
  const origine = typeof location === "undefined" ? "" : location.origin;

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-white/45">Salon</p>
          <p className="text-[52px] font-black leading-none tracking-[0.18em]">{salon.code}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[13px]">
          <button type="button" onClick={() => copier("joueurs", `${origine}/jeu/salon/${salon.code}`)}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 font-medium hover:bg-white/10">
            {copie === "joueurs" ? "Lien copié ✓" : "Copier le lien d’invitation"}
          </button>
          <button type="button" onClick={() => copier("spectateurs", `${origine}/jeu/regarder/${salon.code}`)}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 font-medium hover:bg-white/10">
            {copie === "spectateurs" ? "Lien copié ✓" : "Lien spectateur (projecteur)"}
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {salon.places.map((p, i) => (
          <CartePlace key={i} index={i} place={p} estHote={p?.uid === salon.hote} estMoi={i === moi}
                      hote={hote && salon.etat === "attente"} envoyer={envoyer} />
        ))}
      </section>

      {spectateur || !place ? (
        <p className="text-center text-[14px] text-white/60">
          Vous regardez ce salon{salon.spectateurs > 1 ? ` avec ${salon.spectateurs - 1} autre(s) spectateur(s)` : ""}.
          La partie s’affichera ici dès qu’elle commencera.
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.18em] text-white/50">Votre combattant</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CATALOGUE.persos.map((perso) => {
                const choisi = place.perso === perso.id;
                return (
                  <button key={perso.id} type="button" onClick={() => envoyer({ t: "perso", id: perso.id })}
                          aria-pressed={choisi}
                          className={`rounded-2xl border p-4 text-left transition ${choisi
                            ? "border-white/60 bg-white/[0.10]" : "border-white/10 bg-white/[0.04] hover:border-white/25"}`}
                          style={choisi ? { boxShadow: `inset 4px 0 0 ${perso.couleur}` } : undefined}>
                    <p className="text-[18px] font-extrabold">{perso.nom}</p>
                    <p className="text-[12px] font-semibold" style={{ color: perso.couleur }}>{perso.role}</p>
                    <p className="mt-1 text-[13px] leading-snug text-white/60">{perso.resume}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {hote ? (
            <section className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-white/50">Carte</span>
              {CATALOGUE.cartes.map((c) => (
                <button key={c.id} type="button" onClick={() => envoyer({ t: "carte", id: c.id })}
                        aria-pressed={salon.carte === c.id}
                        className={`rounded-full border px-3 py-1.5 text-[13px] font-medium ${salon.carte === c.id
                          ? "border-white/60 bg-white/15" : "border-white/15 hover:bg-white/10"}`}>
                  {c.nom}
                </button>
              ))}
            </section>
          ) : null}

          <section className="flex flex-wrap items-center gap-3">
            {hote ? (
              <>
                <button type="button" disabled={!lancable} onClick={() => envoyer({ t: "lancer" })}
                        className="rounded-2xl bg-gradient-to-r from-[#4f8cff] to-[#8f7cff] px-8 py-4 text-[18px] font-black
                                   shadow-lg shadow-[#4f8cff]/20 disabled:opacity-40">
                  Lancer la partie
                </button>
                <p className="text-[13px] text-white/55">
                  {occupees < 2 ? "Il faut au moins deux combattants : invitez quelqu’un ou ajoutez un bot."
                    : attente.length > 0 ? `En attente de : ${attente.map((p) => p!.nom).join(", ")}.`
                    : "Tout le monde est prêt."}
                </p>
              </>
            ) : (
              <button type="button" onClick={() => envoyer({ t: "pret", pret: !place.pret })}
                      className={`rounded-2xl px-8 py-4 text-[18px] font-black ${place.pret
                        ? "bg-[#3ddc84] text-[#06210f]" : "bg-white/10 hover:bg-white/15"}`}>
                {place.pret ? "Prêt ✓" : "Je suis prêt"}
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function CartePlace({ index, place, estHote, estMoi, hote, envoyer }: {
  index: number; place: PlaceVue | null; estHote: boolean; estMoi: boolean; hote: boolean; envoyer: Envoyer;
}) {
  const couleur = css(COULEURS_PLACES[index]);
  const perso = place ? CATALOGUE.persos.find((p) => p.id === place.perso) : null;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4"
         style={{ boxShadow: `inset 5px 0 0 ${couleur}` }}>
      <p className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: couleur }}>J{index + 1}</p>
      {place ? (
        <>
          <p className="mt-0.5 truncate text-[20px] font-extrabold">
            {place.nom}{estMoi ? <span className="text-white/40"> (vous)</span> : null}
          </p>
          <p className="text-[13px] text-white/65">{perso?.nom ?? place.perso}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
            {estHote ? <span className="rounded-full bg-[#ffc53d]/20 px-2 py-0.5 text-[#ffd97a]">Hôte</span> : null}
            {place.bot !== null ? <span className="rounded-full bg-white/10 px-2 py-0.5">Bot {NIVEAUX[place.bot]}</span> : null}
            {place.bot === null && !estHote ? (
              <span className={`rounded-full px-2 py-0.5 ${place.pret ? "bg-[#3ddc84]/20 text-[#8cf0b8]" : "bg-white/10 text-white/60"}`}>
                {place.pret ? "Prêt" : "Pas prêt"}
              </span>
            ) : null}
            {!place.connecte ? (
              <span className="rounded-full bg-[#ff5a5f]/20 px-2 py-0.5 text-[#ffb3b5]">
                {place.releve ? "Déconnecté · relevé par un bot" : "Déconnecté"}
              </span>
            ) : null}
          </div>
          {hote && !estHote ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {place.bot !== null ? (
                <>
                  <select value={place.bot} aria-label="Niveau du bot"
                          onChange={(e) => envoyer({ t: "bot", place: index, niveau: Number(e.target.value) })}
                          className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-[12px]">
                    {NIVEAUX.map((n, i) => <option key={n} value={i}>{n}</option>)}
                  </select>
                  <select value={place.perso} aria-label="Personnage du bot"
                          onChange={(e) => envoyer({ t: "persoBot", place: index, id: e.target.value })}
                          className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-[12px]">
                    {CATALOGUE.persos.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>
                  <button type="button" onClick={() => envoyer({ t: "bot", place: index, niveau: null })}
                          className="rounded-lg border border-white/15 px-2 py-1 text-[12px] hover:bg-white/10">
                    Retirer
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => envoyer({ t: "exclure", place: index })}
                        className="rounded-lg border border-white/15 px-2 py-1 text-[12px] hover:bg-white/10">
                  Exclure
                </button>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-0.5 text-[20px] font-extrabold text-white/30">Libre</p>
          {hote ? (
            <button type="button" onClick={() => envoyer({ t: "bot", place: index, niveau: 1 })}
                    className="mt-3 rounded-lg border border-dashed border-white/25 px-3 py-1.5 text-[12px] font-semibold
                               text-white/70 hover:bg-white/10">
              + Ajouter un bot
            </button>
          ) : (
            <p className="text-[13px] text-white/35">En attente d’un joueur…</p>
          )}
        </>
      )}
    </div>
  );
}
