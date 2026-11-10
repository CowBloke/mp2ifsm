"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FAMILLES, ErreurExpression, verifier, type Famille } from "@/lib/courbes/expression";
import { CHOIX, JOUEURS_MAX, PAS, VITESSE, VOLEES_MAX, type Reglages } from "@/lib/courbes/monde";
import type { Action } from "@/lib/courbes/salons";
import { COULEURS, type VueEvenement, type VueJoueur, type VueSalon } from "@/lib/courbes/vue";
import { Arene } from "./Arene";
import { Cadre } from "./Cadre";
import { Formule } from "./Formule";
import { reglerSon, reveiller, sonActif, sons } from "./son";
import { useBattement, useSalon, useTraces } from "./useSalon";

const ACCUEIL = "/divertissement/curve-fight";
type Agir = (a: Action) => Promise<string | null>;

/*
 * Un salon de Curve Fight : l'antichambre (joueurs, réglages) puis la
 * partie (arène, saisie, révélation des plans, volée, scores).
 */
export function Salle({ code }: { code: string }) {
  const { etat, fatale, agir, quitter, horloge } = useSalon(code);
  const [son, setSon] = useState(true);
  useEffect(() => setSon(sonActif()), []);

  // Premier geste : le navigateur autorise alors les sons.
  useEffect(() => {
    const geste = () => reveiller();
    window.addEventListener("pointerdown", geste, { once: true });
    return () => window.removeEventListener("pointerdown", geste);
  }, []);

  const boutonSon = (
    <button type="button" className="cf-pastille" aria-pressed={son}
            onClick={() => { reglerSon(!son); setSon(!son); }}>
      {son ? "Son activé" : "Son coupé"}
    </button>
  );

  if (fatale) {
    return (
      <Cadre retour={{ href: ACCUEIL, libelle: "Salons" }}>
        <div className="cf-carte mx-auto mt-16 max-w-md text-center">
          <p className="text-[18px] font-bold">{fatale}</p>
          <Link href={ACCUEIL} className="cf-bouton mt-5">Retour aux salons</Link>
        </div>
      </Cadre>
    );
  }
  if (!etat) {
    return (
      <Cadre retour={{ href: ACCUEIL, libelle: "Salons" }}>
        <p className="cf-pouls mt-24 text-center text-white/60">Connexion au salon {code}…</p>
      </Cadre>
    );
  }

  return (
    <Cadre large retour={{ href: ACCUEIL, libelle: "Quitter", avant: quitter }} droite={boutonSon}>
      {etat.phase === "salon"
        ? <Antichambre etat={etat} agir={agir} />
        : <Partie etat={etat} agir={agir} horloge={horloge} quitter={quitter} />}
    </Cadre>
  );
}

function Pastille({ couleur, taille = 12 }: { couleur: number; taille?: number }) {
  return (
    <span aria-hidden="true" className="inline-block shrink-0 rounded-full"
          style={{ width: taille, height: taille, background: COULEURS[couleur], boxShadow: `0 0 10px ${COULEURS[couleur]}` }} />
  );
}

/* --- Antichambre ----------------------------------------------------------- */

const MODES: { v: Reglages["mode"]; titre: string; detail: string }[] = [
  { v: "classique", titre: "Classique", detail: "Tout le monde se voit. Le plus malin tire le premier." },
  { v: "brouillard", titre: "Brouillard", detail: "Personne ne se voit. Tes courbes dégagent le brouillard sur leur passage." },
];
const TIRS: { v: Reglages["tir"]; titre: string; detail: string }[] = [
  { v: "fonction", titre: "y = f(x)", detail: "Ta courbe est le graphe de f, décalé pour passer par toi." },
  { v: "equadiff", titre: "y′ = f(x, y)", detail: "Tu donnes la pente : la courbe est la solution qui passe par toi." },
];

function Antichambre({ etat, agir }: { etat: VueSalon; agir: Agir }) {
  const hote = etat.hote === etat.moi;
  const r = etat.reglages;
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const faire = async (a: Action) => setErreur(await agir(a));
  const regler = (reglages: Partial<Reglages>) => faire({ t: "reglages", reglages });
  const presents = etat.joueurs.filter((p) => p.present);
  const nomHote = etat.joueurs.find((p) => p.id === etat.hote)?.nom ?? "l’hôte";

  async function copier() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${ACCUEIL}/salon/${etat.code}`);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch { /* presse-papiers refusé : le code reste affiché */ }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col gap-4">
        <section className="cf-carte text-center">
          <p className="cf-titre-carte">Code du salon</p>
          <p className="cf-logo font-mono text-[64px] tracking-[0.12em]">{etat.code}</p>
          <button type="button" className="cf-bouton-discret mt-3" onClick={copier}>
            {copie ? "Lien copié" : "Copier le lien d’invitation"}
          </button>
        </section>

        <section className="cf-carte">
          <p className="cf-titre-carte">Joueurs · {presents.length}/{JOUEURS_MAX}</p>
          <ul className="flex flex-col gap-2">
            {etat.joueurs.map((p) => (
              <li key={p.id} className={`flex items-center gap-3 rounded-[var(--radius-sm)] bg-white/[0.04] px-3 py-2.5 ${p.present ? "" : "opacity-40"}`}>
                <Pastille couleur={p.couleur} taille={14} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                  {p.nom}{p.id === etat.moi && <span className="font-normal text-white/50"> (toi)</span>}
                </span>
                {p.id === etat.hote && <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--cf-or)]">Hôte</span>}
                {!p.present && <span className="text-[11px] text-white/50">absent</span>}
                {hote && p.id !== etat.moi && !p.bot && (
                  <button type="button" className="text-[12px] text-white/50 underline hover:text-white"
                          onClick={() => faire({ t: "exclure", id: p.id })}>Exclure</button>
                )}
              </li>
            ))}
          </ul>
          {hote && (
            <div className="mt-3 flex items-center gap-2">
              <button type="button" className="cf-bouton-discret flex-1" onClick={() => faire({ t: "bot", delta: 1 })}
                      disabled={etat.joueurs.length >= JOUEURS_MAX}>Ajouter un bot</button>
              <button type="button" className="cf-bouton-discret flex-1" onClick={() => faire({ t: "bot", delta: -1 })}
                      disabled={!etat.joueurs.some((p) => p.bot)}>Retirer un bot</button>
            </div>
          )}
        </section>

        {erreur && <p role="alert" className="text-center text-[14px] font-medium text-[var(--cf-rose)]">{erreur}</p>}
        {hote ? (
          <button type="button" className="cf-bouton h-14 w-full text-[17px]" disabled={presents.length < 2}
                  onClick={() => faire({ t: "lancer" })}>
            {presents.length < 2 ? "Il faut au moins deux joueurs" : "Lancer la partie"}
          </button>
        ) : (
          <p className="cf-pouls text-center text-[14px] text-white/60">En attente de {nomHote}, qui lance la partie…</p>
        )}
        <Regles />
      </div>

      <section className="cf-carte flex flex-col gap-5" aria-label="Réglages du salon">
        <div className="flex items-baseline justify-between">
          <p className="cf-titre-carte mb-0">Réglages</p>
          {!hote && <p className="text-[12px] text-white/45">Choisis par {nomHote}</p>}
        </div>

        <Groupe titre="Mode de jeu">
          <div className="grid gap-2 sm:grid-cols-2">
            {MODES.map((m) => (
              <Option key={m.v} actif={r.mode === m.v} verrou={!hote} titre={m.titre} detail={m.detail}
                      onClick={() => regler({ mode: m.v })} />
            ))}
          </div>
        </Groupe>

        <Groupe titre="Ce que tu saisis">
          <div className="grid gap-2 sm:grid-cols-2">
            {TIRS.map((m) => (
              <Option key={m.v} actif={r.tir === m.v} verrou={!hote} titre={m.titre} detail={m.detail} mono
                      onClick={() => regler({ tir: m.v })} />
            ))}
          </div>
        </Groupe>

        <Groupe titre="Fonctions autorisées" aide="Les opérations + − × ÷ et les puissances le sont toujours.">
          <div className="flex flex-col gap-1.5">
            {FAMILLES.map((f) => {
              const actif = r.familles.includes(f.cle);
              const suivantes: Famille[] = actif ? r.familles.filter((x) => x !== f.cle) : [...r.familles, f.cle];
              return (
                <button key={f.cle} type="button" role="switch" aria-checked={actif} disabled={!hote}
                        className="cf-bouton-discret justify-between disabled:opacity-100"
                        onClick={() => regler({ familles: suivantes })}>
                  <span>{f.nom}</span>
                  <span className={`font-mono text-[12px] font-normal ${actif ? "" : "text-white/35 line-through"}`}>
                    {f.fonctions.join(" ")}
                  </span>
                </button>
              );
            })}
          </div>
        </Groupe>

        <div className="grid gap-5 sm:grid-cols-2">
          <Groupe titre="Temps de réflexion">
            <Segments valeur={r.temps} verrou={!hote} onChange={(temps) => regler({ temps })}
                      options={CHOIX.temps.map((v) => ({ v, nom: v ? `${v} s` : "Libre" }))} />
          </Groupe>
          <Groupe titre="Manches">
            <Segments valeur={r.manches} verrou={!hote} onChange={(manches) => regler({ manches })}
                      options={CHOIX.manches.map((v) => ({ v, nom: String(v) }))} />
          </Groupe>
          <Groupe titre="Obstacles">
            <Segments valeur={r.obstacles} verrou={!hote} onChange={(obstacles) => regler({ obstacles })}
                      options={CHOIX.obstacles.map((v) => ({ v, nom: v[0].toUpperCase() + v.slice(1) }))} />
          </Groupe>
          <Groupe titre="Longueur de l’expression">
            <Segments valeur={r.longueurMax} verrou={!hote} onChange={(longueurMax) => regler({ longueurMax })}
                      options={CHOIX.longueurMax.map((v) => ({ v, nom: v ? `≤ ${v}` : "Libre" }))} />
          </Groupe>
        </div>

        <button type="button" role="switch" aria-checked={r.repereMuet} disabled={!hote}
                className="cf-bouton-discret justify-between disabled:opacity-100"
                onClick={() => regler({ repereMuet: !r.repereMuet })}>
          <span>Repère muet</span>
          <span className="text-[12px] font-normal text-white/60">
            {r.repereMuet ? "Ni graduations ni coordonnées : tout à l’œil" : "Désactivé"}
          </span>
        </button>
      </section>
    </div>
  );
}

function Groupe({ titre, aide, children }: { titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-white/80">{titre}</p>
      {children}
      {aide && <p className="mt-2 text-[12px] text-white/45">{aide}</p>}
    </div>
  );
}

function Option({ actif, verrou, titre, detail, mono, onClick }: {
  actif: boolean; verrou: boolean; titre: string; detail: string; mono?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" role="radio" aria-checked={actif} disabled={verrou} onClick={onClick}
            className={`rounded-[var(--radius-md)] border p-3 text-left transition-colors disabled:cursor-default
                        ${actif ? "border-[var(--cf-cyan)] bg-[rgba(79,216,255,0.1)]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"}`}>
      <span className={`block text-[16px] font-bold ${mono ? "font-mono" : ""} ${actif ? "text-[var(--cf-cyan)]" : ""}`}>{titre}</span>
      <span className="mt-1 block text-[12px] leading-snug text-white/60">{detail}</span>
    </button>
  );
}

function Segments<T extends string | number>({ valeur, options, verrou, onChange }: {
  valeur: T; options: { v: T; nom: string }[]; verrou: boolean; onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="flex gap-1.5">
      {options.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={valeur === o.v} disabled={verrou}
                className="cf-bouton-discret flex-1 px-2 disabled:opacity-100" onClick={() => onChange(o.v)}>
          {o.nom}
        </button>
      ))}
    </div>
  );
}

export function Regles() {
  return (
    <details className="cf-carte text-[14px] leading-relaxed text-white/75">
      <summary className="cursor-pointer text-[14px] font-bold text-white">Comment on joue</summary>
      <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5">
        <li>Chacun écrit une expression en secret. <strong className="text-white">Aucun aperçu</strong> : il faut la calculer de tête.</li>
        <li>Ta courbe part de toi, à gauche et à droite : c’est le graphe de f, décalé verticalement pour passer par ta position.</li>
        <li>Quand tout le monde est prêt, les plans sont dévoilés, puis toutes les courbes se tracent en même temps, à la même vitesse.</li>
        <li>Une courbe qui touche un joueur l’élimine. La courbe d’un joueur éliminé s’arrête net : le chemin le plus court gagne les duels.</li>
        <li>Une courbe s’arrête sur un obstacle (elle y creuse un cratère), au bord de l’arène, hors de son domaine de définition ou sur un saut de plus de 1,5.</li>
        <li>Les survivants rejouent jusqu’à ce qu’il n’en reste qu’un ({VOLEES_MAX} volées au plus). Une élimination vaut 1 point, survivre à la manche 2 points.</li>
      </ul>
    </details>
  );
}

/* --- Partie ---------------------------------------------------------------- */

function Partie({ etat, agir, horloge, quitter }: {
  etat: VueSalon; agir: Agir; horloge: () => number; quitter: () => void;
}) {
  const traces = useTraces(etat.code, etat.tir?.n, etat.voile !== null);
  useBattement(200, etat.phase !== "fin");
  const t = horloge();
  const tir = etat.tir;
  const parId = useMemo(() => new Map(etat.joueurs.map((p) => [p.id, p])), [etat.joueurs]);
  const moi = parId.get(etat.moi);
  const enRevelation = etat.phase === "volee" && !!tir && t < tir.tAnimation;
  const tick = etat.phase === "volee" && tir ? Math.max(0, ((t - tir.tAnimation) / 1000) * VITESSE / PAS) : Infinity;

  // Décompte sonore avant le départ, puis le départ.
  const dernierBip = useRef("");
  const secondes = enRevelation && tir ? Math.ceil((tir.tAnimation - t) / 1000) : 0;
  useEffect(() => {
    if (!tir || etat.phase !== "volee") return;
    const cle = `${tir.n}:${enRevelation ? secondes : "go"}`;
    if (cle === dernierBip.current) return;
    dernierBip.current = cle;
    if (!enRevelation) sons.depart();
    else if (secondes <= 3) sons.decompte();
  }, [tir, etat.phase, enRevelation, secondes]);
  useEffect(() => { if (etat.phase === "fin") sons.victoire(); }, [etat.phase]);

  // Le brouillon survit d'une volée à l'autre : on corrige son tir précédent.
  const brouillon = useState("");
  const surEvenement = (e: VueEvenement) => (e.type === "impact" ? sons.impact() : sons.elimination());
  const r = etat.reglages;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_370px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="cf-pastille font-mono font-bold tracking-widest">{etat.code}</span>
          <span className="cf-pastille">Manche {etat.manche}/{r.manches}</span>
          <span className="cf-pastille">Volée {etat.volee}/{VOLEES_MAX}</span>
          <span className="cf-pastille text-[var(--cf-cyan)]">{r.mode === "brouillard" ? "Brouillard" : "Classique"}</span>
          <span className="cf-pastille font-mono">{r.tir === "equadiff" ? "y′ = f(x, y)" : "y = f(x)"}</span>
          {r.repereMuet && <span className="cf-pastille">Repère muet</span>}
        </div>

        <div className="relative">
          <Arene etat={etat} traces={traces} horloge={horloge} surEvenement={surEvenement} />
          {enRevelation && tir && <Revelation etat={etat} secondes={secondes} />}
          {etat.phase === "finManche" && <FinManche etat={etat} reste={Math.max(0, Math.ceil((etat.transition - t) / 1000))} />}
          {etat.phase === "fin" && <Podium etat={etat} agir={agir} quitter={quitter} />}
          {etat.voile && etat.phase === "preparation" && (
            <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-[12px] text-white/70">
              Brouillard : tu ne vois que ce que tu as dégagé
            </p>
          )}
        </div>

        <Scores etat={etat} tick={tick} />
      </div>

      <aside className="flex min-w-0 flex-col gap-3">
        {etat.phase === "preparation" && <Preparation etat={etat} moi={moi} agir={agir} horloge={horloge} brouillon={brouillon} />}
        {tir && etat.phase !== "preparation" && <Plans etat={etat} tick={tick} />}
        {tir && etat.phase === "preparation" && <Plans etat={etat} tick={Infinity} precedente />}
      </aside>
    </div>
  );
}

function mortsAvant(etat: VueSalon, tick: number): Set<string> {
  const morts = new Set<string>();
  for (const e of etat.tir?.evenements ?? []) if (e.type === "elimination" && e.tick <= tick) morts.add(e.victime);
  return morts;
}

/** Vivant à l'écran : l'état du serveur est en avance sur l'animation. */
function vivantALecran(etat: VueSalon, p: VueJoueur, tick: number): boolean {
  if (!p.enJeu) return false;
  if (p.vivant) return true;
  if (etat.phase !== "volee" || !etat.tir) return false;
  return etat.tir.vivantsAvant.includes(p.id) && !mortsAvant(etat, tick).has(p.id);
}

function Scores({ etat, tick }: { etat: VueSalon; tick: number }) {
  // Le serveur a déjà compté toute la volée : on retient les points pas encore vus à l'écran.
  const aVenir = new Map<string, number>();
  if (etat.phase === "volee") {
    for (const e of etat.tir?.evenements ?? []) {
      if (e.type === "elimination" && e.tick > tick) aVenir.set(e.tueur, (aVenir.get(e.tueur) ?? 0) + 1);
    }
  }
  const joueurs = etat.joueurs.filter((p) => p.enJeu)
    .map((p) => ({ ...p, points: p.points - (aVenir.get(p.id) ?? 0) }))
    .sort((a, b) => b.points - a.points || b.eliminations - a.eliminations);
  const spectateurs = etat.joueurs.filter((p) => !p.enJeu && p.present);
  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {joueurs.map((p) => {
          const vivant = vivantALecran(etat, p, tick);
          return (
            <li key={p.id} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]
                                       ${vivant ? "border-white/15 bg-white/[0.05]" : "border-white/5 bg-transparent opacity-45"}`}>
              <Pastille couleur={p.couleur} />
              <span className={`max-w-[110px] truncate font-semibold ${vivant ? "" : "line-through"}`}>
                {p.id === etat.moi ? "Toi" : p.nom}
              </span>
              <span className="font-mono font-bold text-[var(--cf-or)]">{p.points}</span>
              {etat.phase === "preparation" && vivant && (
                <span className={p.pret || p.bot ? "text-[#5dff9b]" : "cf-pouls text-white/40"}>
                  {p.pret || p.bot ? "prêt" : p.present ? "réfléchit" : "absent"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {spectateurs.length > 0 && (
        <p className="mt-2 text-[12px] text-white/45">
          {spectateurs.length > 1 ? "Spectateurs" : "Spectateur"} : {spectateurs.map((p) => p.nom).join(", ")}
        </p>
      )}
    </div>
  );
}

/* --- Préparation : la saisie ----------------------------------------------- */

function Preparation({ etat, moi, agir, horloge, brouillon: [brouillon, setBrouillon] }: {
  etat: VueSalon; moi: VueJoueur | undefined; agir: Agir; horloge: () => number;
  brouillon: [string, (v: string) => void];
}) {
  const r = etat.reglages;
  const equadiff = r.tir === "equadiff";
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const joue = !!moi && moi.enJeu && moi.vivant;
  const verrouille = etat.monExpression !== null;

  const analyse = useMemo(() => {
    if (!brouillon.trim()) return { ok: false, message: "" };
    try {
      verifier(brouillon, { familles: r.familles, longueurMax: r.longueurMax, equadiff });
      return { ok: true, message: "" };
    } catch (err) {
      return { ok: false, message: err instanceof ErreurExpression ? err.message : "Expression invalide" };
    }
  }, [brouillon, r.familles, r.longueurMax, equadiff]);

  async function valider() {
    if (!analyse.ok) return;
    const e = await agir({ t: "tirer", expression: brouillon });
    setErreur(e);
    if (!e) sons.pret();
  }

  // À la dernière seconde, un brouillon valide part tout seul.
  const reste = etat.echeance ? Math.max(0, etat.echeance - horloge()) : null;
  const envoiAuto = useRef(0);
  useEffect(() => {
    if (reste !== null && reste < 1300 && joue && !verrouille && analyse.ok && envoiAuto.current !== etat.echeance) {
      envoiAuto.current = etat.echeance;
      void agir({ t: "tirer", expression: brouillon });
    }
  });

  function inserer(texte: string) {
    const el = champ.current;
    const debut = el?.selectionStart ?? brouillon.length, fin = el?.selectionEnd ?? brouillon.length;
    setBrouillon(brouillon.slice(0, debut) + texte + brouillon.slice(fin));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(debut + texte.length, debut + texte.length);
    });
  }

  const touches = ["x", ...(equadiff ? ["y"] : []), "^", "(", ")", "π",
    ...FAMILLES.filter((f) => r.familles.includes(f.cle)).flatMap((f) => f.fonctions.map((n) => `${n}(`))];
  const longueur = brouillon.replace(/\s+/g, "").length;
  const attendus = etat.joueurs.filter((p) => p.enJeu && p.vivant && !p.bot);
  const total = r.temps * 1000;

  return (
    <>
      {reste !== null && (
        <div className="flex items-center gap-3 px-1" role="timer" aria-label="Temps de réflexion restant">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full transition-[width] duration-200 ease-linear ${reste < 10_000 ? "bg-[var(--cf-rose)]" : "bg-[var(--cf-cyan)]"}`}
                 style={{ width: `${Math.min(100, (reste / total) * 100)}%` }} />
          </div>
          <p className={`w-14 text-right font-mono text-[20px] font-bold ${reste < 10_000 ? "text-[var(--cf-rose)]" : ""}`}>
            {Math.ceil(reste / 1000)} s
          </p>
        </div>
      )}

      {!joue ? (
        <div className="cf-carte text-[14px] text-white/70">
          <p className="cf-titre-carte">{moi?.enJeu ? "Éliminé" : "Spectateur"}</p>
          {moi?.enJeu
            ? "Ta courbe s’est arrêtée là pour cette manche. Regarde les autres réfléchir : tu reviens à la manche suivante."
            : "La partie a commencé sans toi : tu joueras la prochaine."}
        </div>
      ) : verrouille ? (
        <div className="cf-carte">
          <p className="cf-titre-carte">Ton tir est verrouillé</p>
          <p className="overflow-x-auto py-2 text-[20px]" style={{ color: COULEURS[moi!.couleur] }}>
            <Formule source={etat.monExpression!} equadiff={equadiff} />
          </p>
          <p className="mt-1 text-[13px] text-white/55">
            En attente des autres ({attendus.filter((p) => p.pret).length}/{attendus.length} prêts).
          </p>
          <button type="button" className="cf-bouton-discret mt-3 w-full" onClick={() => agir({ t: "annuler" })}>
            Modifier mon expression
          </button>
        </div>
      ) : (
        <form className="cf-carte flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void valider(); }}>
          <div className="flex items-baseline justify-between">
            <p className="cf-titre-carte mb-0">Ton expression</p>
            {r.longueurMax > 0 && (
              <p className={`font-mono text-[12px] ${longueur > r.longueurMax ? "text-[var(--cf-rose)]" : "text-white/50"}`}>
                {longueur}/{r.longueurMax}
              </p>
            )}
          </div>
          <label className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-[17px] font-bold" style={{ color: COULEURS[moi!.couleur] }}>
              {equadiff ? "y′ =" : "f(x) ="}
            </span>
            <input ref={champ} className="cf-champ" value={brouillon} onChange={(e) => setBrouillon(e.target.value)}
                   placeholder={equadiff ? "0.2y - x/10" : "3sin(x/4) - x/5"} maxLength={120}
                   autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {touches.map((k) => (
              <button key={k} type="button" onClick={() => inserer(k === "π" ? "pi" : k)}
                      className="h-9 rounded-[var(--radius-sm)] border border-white/12 bg-white/[0.05] px-2.5 font-mono text-[13px] hover:bg-white/[0.12]">
                {k}
              </button>
            ))}
          </div>
          <div className="min-h-[52px] rounded-[var(--radius-sm)] bg-black/30 px-3 py-2">
            {analyse.ok ? (
              <p className="overflow-x-auto text-[18px]"><Formule source={brouillon} equadiff={equadiff} /></p>
            ) : (
              <p className={`text-[13px] ${analyse.message ? "text-[var(--cf-rose)]" : "text-white/40"}`}>
                {analyse.message || "L’écriture de ta formule s’affiche ici. Pas la courbe : à toi de la voir de tête."}
              </p>
            )}
          </div>
          {erreur && <p role="alert" className="text-[13px] text-[var(--cf-rose)]">{erreur}</p>}
          <button type="submit" className="cf-bouton w-full" disabled={!analyse.ok}>Verrouiller mon tir</button>
          <p className="text-[12px] leading-relaxed text-white/50">
            {r.repereMuet || moi!.x === null
              ? "Repère muet : estime ta position à l’œil."
              : <>Tu es en <strong className="font-mono text-white">({moi!.x} ; {moi!.y})</strong>. </>}
            {equadiff
              ? " La courbe est la solution de y′ = f(x, y) qui passe par toi, tracée dans les deux sens."
              : " La courbe tracée est y = f(x) − f(x₀) + y₀ : elle part de toi, dans les deux sens."}
          </p>
        </form>
      )}

      {etat.historique.length > 0 && (
        <div className="cf-carte">
          <p className="cf-titre-carte">Tes tirs de la manche</p>
          <ul className="flex flex-col gap-1.5">
            {etat.historique.map((h) => (
              <li key={h.volee}>
                <button type="button" disabled={!joue || verrouille} onClick={() => setBrouillon(h.source)}
                        className="flex w-full items-baseline justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 text-left hover:bg-white/[0.06] disabled:hover:bg-transparent">
                  <span className="min-w-0 truncate font-mono text-[13px]">{h.source}</span>
                  <span className="shrink-0 text-[12px] text-white/50">{h.bilan}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/* --- Volée : plans dévoilés, fil des éliminations -------------------------- */

function Revelation({ etat, secondes }: { etat: VueSalon; secondes: number }) {
  const tir = etat.tir!;
  const parId = new Map(etat.joueurs.map((p) => [p.id, p]));
  const equadiff = etat.reglages.tir === "equadiff";
  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto rounded-[var(--radius-lg)] bg-[rgba(4,6,13,0.82)] p-3 backdrop-blur-[3px] sm:p-5">
      {/* Sur téléphone l'arène est basse : les formules se lisent dans la liste juste dessous. */}
      <div className="my-auto flex flex-col items-center gap-2 sm:my-0 sm:flex-row sm:justify-between sm:gap-3">
        <p className="text-[13px] font-black uppercase tracking-[0.2em] text-white/70 sm:text-[15px]">Les plans sont dévoilés</p>
        <p key={secondes} className="cf-decompte font-mono text-[64px] font-black leading-none text-[var(--cf-or)] sm:text-[44px]">{secondes}</p>
      </div>
      <ul className="mt-3 hidden flex-1 content-center gap-2 sm:grid sm:grid-cols-2">
        {tir.expressions.map((e, i) => {
          const p = parId.get(e.id);
          if (!p) return null;
          return (
            <li key={e.id} className="cf-apparition flex min-w-0 items-center gap-3 rounded-[var(--radius-md)] border bg-black/40 px-3 py-2"
                style={{ animationDelay: `${300 + i * 450}ms`, borderColor: `${COULEURS[p.couleur]}66` }}>
              <Pastille couleur={p.couleur} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold uppercase tracking-wider text-white/55">{p.id === etat.moi ? "Toi" : p.nom}</p>
                <p className="overflow-x-auto whitespace-nowrap text-[15px] sm:text-[18px]" style={{ color: COULEURS[p.couleur] }}>
                  {e.source ? <Formule source={e.source} equadiff={equadiff} /> : <span className="text-white/40">n’a pas tiré</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Plans({ etat, tick, precedente }: { etat: VueSalon; tick: number; precedente?: boolean }) {
  const tir = etat.tir!;
  const parId = new Map(etat.joueurs.map((p) => [p.id, p]));
  const equadiff = etat.reglages.tir === "equadiff";
  const nom = (id: string) => (id === etat.moi ? "Toi" : parId.get(id)?.nom ?? "?");
  const eliminations = tir.evenements.filter((e) => e.type === "elimination" && e.tick <= tick);
  return (
    <>
      <div className="cf-carte">
        <p className="cf-titre-carte">{precedente ? "Volée précédente" : `Plans de la volée ${tir.volee}`}</p>
        <ul className="flex flex-col gap-2">
          {tir.expressions.map((e) => {
            const p = parId.get(e.id);
            if (!p) return null;
            return (
              <li key={e.id} className="flex min-w-0 items-center gap-2.5">
                <Pastille couleur={p.couleur} taille={10} />
                <span className="w-[72px] shrink-0 truncate text-[12px] text-white/60">{nom(e.id)}</span>
                <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[14px]" style={{ color: COULEURS[p.couleur] }}>
                  {e.source ? <Formule source={e.source} equadiff={equadiff} nu /> : <span className="text-white/35">pas de tir</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {!precedente && (
        <div className="cf-carte">
          <p className="cf-titre-carte">Éliminations</p>
          {eliminations.length === 0
            ? <p className="text-[13px] text-white/45">{Number.isFinite(tick) ? "Les courbes avancent…" : "Personne n’a été touché."}</p>
            : (
              <ul className="flex flex-col gap-1.5">
                {eliminations.map((e) => e.type === "elimination" && (
                  <li key={e.victime} className="cf-apparition flex items-center gap-2 text-[14px]">
                    <Pastille couleur={parId.get(e.tueur)?.couleur ?? 0} taille={10} />
                    <strong>{nom(e.tueur)}</strong>
                    <span className="text-white/50">élimine</span>
                    <Pastille couleur={parId.get(e.victime)?.couleur ?? 0} taille={10} />
                    <strong>{nom(e.victime)}</strong>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </>
  );
}

/* --- Fins de manche et de partie ------------------------------------------- */

function FinManche({ etat, reste }: { etat: VueSalon; reste: number }) {
  const gagnant = etat.gagnants.length === 1 ? etat.joueurs.find((p) => p.id === etat.gagnants[0]) : null;
  return (
    <div className="cf-apparition pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
      <div className="rounded-[var(--radius-md)] border border-white/15 bg-[rgba(4,6,13,0.88)] px-5 py-3 text-center backdrop-blur">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/55">Fin de la manche {etat.manche}</p>
        <p className="mt-1 text-[20px] font-black" style={gagnant ? { color: COULEURS[gagnant.couleur] } : undefined}>
          {gagnant ? `${gagnant.id === etat.moi ? "Tu survis" : `${gagnant.nom} survit`} : +2 points`
            : etat.gagnants.length ? "Égalité : plusieurs survivants" : "Plus personne debout"}
        </p>
        <p className="mt-1 text-[12px] text-white/55">Nouvelle arène dans {reste} s</p>
      </div>
    </div>
  );
}

function Podium({ etat, agir, quitter }: { etat: VueSalon; agir: Agir; quitter: () => void }) {
  const classement = etat.joueurs.filter((p) => p.enJeu)
    .sort((a, b) => b.points - a.points || b.eliminations - a.eliminations);
  const premier = classement[0];
  const hote = etat.hote === etat.moi;
  return (
    // Sur téléphone l'arène est trop basse pour le podium : il se pose dessous.
    <div className="mt-3 flex flex-col items-center rounded-[var(--radius-lg)] border border-white/10 bg-[rgba(4,6,13,0.86)] p-4 text-center
                    sm:absolute sm:inset-0 sm:mt-0 sm:overflow-y-auto sm:border-0 sm:backdrop-blur-[3px]">
      <div className="my-auto w-full max-w-md">
        <p className="text-[12px] font-black uppercase tracking-[0.24em] text-white/55">Partie terminée</p>
        {premier && (
          <p className="cf-apparition mt-1 text-[30px] font-black leading-tight sm:text-[44px]" style={{ color: COULEURS[premier.couleur] }}>
            {premier.id === etat.moi ? "Tu gagnes !" : `${premier.nom} gagne !`}
          </p>
        )}
        <ol className="mt-3 flex flex-col gap-1.5 text-left">
          {classement.map((p, i) => (
            <li key={p.id} className="cf-apparition flex items-center gap-3 rounded-[var(--radius-sm)] bg-white/[0.06] px-3 py-2"
                style={{ animationDelay: `${200 + i * 120}ms` }}>
              <span className="w-5 font-mono text-[13px] text-white/50">{i + 1}</span>
              <Pastille couleur={p.couleur} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{p.id === etat.moi ? "Toi" : p.nom}</span>
              <span className="text-[12px] text-white/55">{p.eliminations} élim.</span>
              <span className="w-12 text-right font-mono text-[15px] font-bold text-[var(--cf-or)]">{p.points} pt{p.points > 1 ? "s" : ""}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {hote
            ? <button type="button" className="cf-bouton" onClick={() => agir({ t: "salon" })}>Revenir au salon</button>
            : <p className="cf-pouls self-center text-[13px] text-white/60">L’hôte relance quand il veut…</p>}
          <Link href={`${ACCUEIL}/classement`} onClick={quitter} className="cf-bouton-discret min-h-[48px]">Classement</Link>
        </div>
      </div>
    </div>
  );
}
