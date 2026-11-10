"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FAMILLES, ErreurExpression, compiler, verifier, type Expression, type Famille } from "@/lib/courbes/expression";
import { CHOIX, JOUEURS_MAX, PAS, VITESSE, VOLEES_MAX, type Reglages } from "@/lib/courbes/monde";
import type { Action } from "@/lib/courbes/salons";
import { simuler, type Fin } from "@/lib/courbes/simulation";
import { affiner, ecrireNombre } from "@/lib/courbes/trace";
import type { VueEvenement, VueJoueur, VueSalon } from "@/lib/courbes/vue";
import { Arene, type Apercu } from "./Arene";
import { Formule } from "./Formule";
import { reglerSon, reveiller, sonActif, sons } from "./son";
import { useBattement, useSalon, useTraces } from "./useSalon";

const ACCUEIL = "/divertissement/curve-fight";
type Agir = (a: Action) => Promise<string | null>;

const teinte = (couleur: number) => ({ "--c": `var(--cf-j${couleur})` }) as React.CSSProperties;

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

function Retour({ libelle, avant }: { libelle: string; avant?: () => void }) {
  return (
    <Link href={ACCUEIL} onClick={avant} aria-label={libelle}
          className="-ml-3 -mt-4 mb-4 grid h-11 w-11 place-items-center rounded-full hover:bg-[var(--muted)]">
      <Chevron />
    </Link>
  );
}

/*
 * Un salon de Curve Fight : l'antichambre (joueurs, réglages), une page
 * comme les autres, puis la partie, en plein écran : la liste des
 * expressions à gauche, le repère à droite.
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
  const basculerSon = () => { reglerSon(!son); setSon(!son); };

  if (fatale) {
    return (
      <main>
        <Retour libelle="Retour aux salons" />
        <header className="page-heading"><h1>{fatale}</h1></header>
        <Link href={ACCUEIL} className="bouton-principal">Retour aux salons</Link>
      </main>
    );
  }
  if (!etat) {
    return (
      <main>
        <Retour libelle="Retour aux salons" />
        <p className="text-[15px] text-[var(--muted-foreground)]" role="status">Connexion au salon {code}…</p>
      </main>
    );
  }
  return etat.phase === "salon"
    ? <Antichambre etat={etat} agir={agir} quitter={quitter} son={son} basculerSon={basculerSon} />
    : <Partie etat={etat} agir={agir} horloge={horloge} quitter={quitter} son={son} basculerSon={basculerSon} />;
}

/* --- Antichambre ----------------------------------------------------------- */

const MODES: { v: Reglages["mode"]; titre: string; detail: string }[] = [
  { v: "classique", titre: "Classique", detail: "Tout le monde se voit." },
  { v: "brouillard", titre: "Brouillard", detail: "Personne ne se voit ; tes courbes dégagent le brouillard sur leur passage." },
];
const TIRS: { v: Reglages["tir"]; titre: string; detail: string }[] = [
  { v: "fonction", titre: "y = f(x)", detail: "Le graphe de f, translaté pour passer par toi." },
  { v: "equadiff", titre: "y′ = f(x, y)", detail: "Tu donnes la pente : la courbe est la solution qui passe par toi." },
];

function Antichambre({ etat, agir, quitter, son, basculerSon }: {
  etat: VueSalon; agir: Agir; quitter: () => void; son: boolean; basculerSon: () => void;
}) {
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
    <main>
      <Retour libelle="Quitter le salon" avant={quitter} />
      <header className="page-heading">
        <h1>Salon <span className="font-mono tracking-[0.08em]">{etat.code}</span></h1>
        <p>Donne ce code à la classe, ou envoie le lien.</p>
      </header>

      <div className="page-stack">
        <div className="page-toolbar -mt-5">
          <button type="button" className="puce" onClick={copier}>{copie ? "Lien copié" : "Copier le lien"}</button>
          <button type="button" className="puce" aria-pressed={son} onClick={basculerSon}>{son ? "Son activé" : "Son coupé"}</button>
        </div>

        <section>
          <h2 className="etiquette">Joueurs · {presents.length}/{JOUEURS_MAX}</h2>
          <ul>
            {etat.joueurs.map((p) => (
              <li key={p.id} className={`ligne min-h-[56px] ${p.present ? "" : "opacity-50"}`} style={teinte(p.couleur)}>
                <span className="cf-pion" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate ligne__titre">
                  {p.nom}{p.id === etat.moi && <span className="ligne__meta"> · toi</span>}
                </span>
                {p.id === etat.hote && <span className="ligne__meta">Hôte</span>}
                {!p.present && <span className="ligne__meta">absent</span>}
                {hote && p.id !== etat.moi && !p.bot && (
                  <button type="button" className="lien-discret" onClick={() => faire({ t: "exclure", id: p.id })}>Exclure</button>
                )}
              </li>
            ))}
          </ul>
          {hote && (
            <div className="page-toolbar mt-3">
              <button type="button" className="puce" onClick={() => faire({ t: "bot", delta: 1 })}
                      disabled={etat.joueurs.length >= JOUEURS_MAX}>Ajouter un bot</button>
              <button type="button" className="puce" onClick={() => faire({ t: "bot", delta: -1 })}
                      disabled={!etat.joueurs.some((p) => p.bot)}>Retirer un bot</button>
            </div>
          )}
        </section>

        <section aria-label="Réglages du salon" className="flex flex-col gap-7">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.01em]">Réglages</h2>
            {!hote && <p className="mt-1 text-[14px] text-[var(--muted-foreground)]">Choisis par {nomHote}.</p>}
          </div>

          <Groupe titre="Mode de jeu">
            <div className="grid gap-2 sm:grid-cols-2">
              {MODES.map((m) => (
                <Option key={m.v} actif={r.mode === m.v} verrou={!hote} titre={m.titre} detail={m.detail}
                        onClick={() => regler({ mode: m.v })} />
              ))}
            </div>
          </Groupe>

          <Groupe titre="Ce qu’on écrit">
            <div className="grid gap-2 sm:grid-cols-2">
              {TIRS.map((m) => (
                <Option key={m.v} actif={r.tir === m.v} verrou={!hote} titre={m.titre} detail={m.detail} mono
                        onClick={() => regler({ tir: m.v })} />
              ))}
            </div>
          </Groupe>

          <Groupe titre="Aides">
            <Bascule actif={r.apercu} verrou={!hote} titre="Aperçu de la courbe"
                     detail={r.apercu ? "Ta courbe se trace pendant que tu écris" : "Rien n’est tracé : il faut la voir de tête"}
                     onClick={() => regler({ apercu: !r.apercu })} />
            <Bascule actif={!r.repereMuet} verrou={!hote} titre="Graduations et coordonnées"
                     detail={r.repereMuet ? "Repère muet : tout à l’œil" : "Le repère est gradué"}
                     onClick={() => regler({ repereMuet: !r.repereMuet })} />
          </Groupe>

          <Groupe titre="Fonctions autorisées" aide="Les opérations + − × ÷ et les puissances le sont toujours.">
            {FAMILLES.map((f) => {
              const actif = r.familles.includes(f.cle);
              const suivantes: Famille[] = actif ? r.familles.filter((x) => x !== f.cle) : [...r.familles, f.cle];
              return (
                <Bascule key={f.cle} actif={actif} verrou={!hote} titre={f.nom} detail={f.fonctions.join("  ")} mono
                         onClick={() => regler({ familles: suivantes })} />
              );
            })}
          </Groupe>

          <div className="grid gap-7 sm:grid-cols-2">
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
        </section>

        <div className="flex flex-col gap-3">
          {erreur && <p role="alert" className="text-[14px] font-medium text-[var(--destructive)]">{erreur}</p>}
          {hote ? (
            <button type="button" className="bouton-principal" disabled={presents.length < 2}
                    onClick={() => faire({ t: "lancer" })}>
              {presents.length < 2 ? "Il faut au moins deux joueurs" : "Lancer la partie"}
            </button>
          ) : (
            <p className="text-[15px] text-[var(--muted-foreground)]" role="status">{nomHote} lance la partie quand tout le monde est là.</p>
          )}
          <Regles />
        </div>
      </div>
    </main>
  );
}

function Groupe({ titre, aide, children }: { titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="etiquette mb-2">{titre}</h3>
      {children}
      {aide && <p className="mt-2 text-[13px] text-[var(--muted-foreground)]">{aide}</p>}
    </div>
  );
}

function Option({ actif, verrou, titre, detail, mono, onClick }: {
  actif: boolean; verrou: boolean; titre: string; detail: string; mono?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" role="radio" aria-checked={actif} disabled={verrou} onClick={onClick} className="cf-option">
      <span className={`block text-[16px] font-semibold ${mono ? "font-mono" : ""}`}>{titre}</span>
      <span className="mt-1 block text-[13px] leading-snug text-[var(--muted-foreground)]">{detail}</span>
    </button>
  );
}

function Bascule({ actif, verrou, titre, detail, mono, onClick }: {
  actif: boolean; verrou: boolean; titre: string; detail: string; mono?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={actif} disabled={verrou} onClick={onClick} className="cf-bascule">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{titre}</span>
        <span className={`block truncate text-[13px] text-[var(--muted-foreground)] ${mono ? "font-mono" : ""}`}>{detail}</span>
      </span>
      <span className="cf-bascule__piste" aria-hidden="true" />
    </button>
  );
}

function Segments<T extends string | number>({ valeur, options, verrou, onChange }: {
  valeur: T; options: { v: T; nom: string }[]; verrou: boolean; onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={valeur === o.v} disabled={verrou}
                className="puce disabled:cursor-default" onClick={() => onChange(o.v)}>
          {o.nom}
        </button>
      ))}
    </div>
  );
}

export function Regles() {
  return (
    <details className="cf-regles">
      <summary>Comment on joue</summary>
      <ul>
        <li>Chacun écrit une expression en secret. Selon le salon, ta courbe se trace pendant que tu écris, ou pas du tout.</li>
        <li>Ta courbe part de toi, à gauche et à droite : c’est le graphe de f, translaté verticalement pour passer par ta position.</li>
        <li>Quand tout le monde est prêt, les expressions sont dévoilées, puis toutes les courbes se tracent en même temps, à la même vitesse.</li>
        <li>Une courbe qui touche un joueur l’élimine. La courbe d’un joueur éliminé s’arrête net : le chemin le plus court gagne les duels.</li>
        <li>Une courbe s’arrête sur un obstacle (elle y creuse un cratère), au bord de l’arène, hors de son domaine de définition ou sur un saut de plus de 1.5.</li>
        <li>Les survivants rejouent jusqu’à ce qu’il n’en reste qu’un ({VOLEES_MAX} volées au plus). Une élimination vaut 1 point, survivre à la manche 2 points.</li>
      </ul>
    </details>
  );
}

/* --- Partie ---------------------------------------------------------------- */

const FINS: Record<Fin, string> = {
  bord: "sort de l’arène", obstacle: "s’arrête sur un obstacle", rupture: "se rompt sur un saut",
  domaine: "sort du domaine de définition", mort: "s’interrompt", longueur: "s’essouffle après 140 unités",
};

type ApercuDetaille = Apercu & {
  /** f(x₀) existe : la courbe part bien du joueur. */
  part: boolean;
  /** Constante ajoutée à f pour passer par le joueur (tir y = f(x)). */
  decalage: number;
  fins: { dir: 1 | -1; fin: Fin }[];
};

function Partie({ etat, agir, horloge, quitter, son, basculerSon }: {
  etat: VueSalon; agir: Agir; horloge: () => number; quitter: () => void; son: boolean; basculerSon: () => void;
}) {
  const traces = useTraces(etat.code, etat.tir?.n, etat.voile !== null);
  useBattement(200, etat.phase !== "fin");
  const t = horloge();
  const tir = etat.tir;
  const r = etat.reglages;
  const equadiff = r.tir === "equadiff";
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
  const [brouillon, setBrouillon] = useState("");
  const surEvenement = (e: VueEvenement) => (e.type === "impact" ? sons.impact() : sons.elimination());

  const joue = etat.phase === "preparation" && !!moi && moi.enJeu && moi.vivant;
  const source = etat.monExpression ?? brouillon;
  const analyse = useMemo((): { expr: Expression | null; message: string } => {
    if (!source.trim()) return { expr: null, message: "" };
    try {
      return { expr: verifier(source, { familles: r.familles, longueurMax: r.longueurMax, equadiff }), message: "" };
    } catch (err) {
      return { expr: null, message: err instanceof ErreurExpression ? err.message : "Expression invalide" };
    }
  }, [source, r.familles, r.longueurMax, equadiff]);

  // L'aperçu rejoue la simulation du serveur pour sa seule courbe : ce qui est tracé est ce qui partira.
  const x0 = moi?.x ?? null, y0 = moi?.y ?? null;
  const apercu = useMemo((): ApercuDetaille | null => {
    if (!r.apercu || !joue || !analyse.expr || x0 === null || y0 === null) return null;
    const f = compiler(analyse.expr.arbre);
    const decalage = equadiff ? 0 : y0 - f(x0, 0);
    const res = simuler([{ id: "moi", x: x0, y: y0, expr: analyse.expr }], etat.obstacles, etat.crateres, r.tir);
    return {
      f, equadiff, decalage,
      part: Number.isFinite(equadiff ? f(x0, y0) : decalage),
      branches: res.traces.map((tr) => (equadiff ? tr.pts : affiner(tr.pts, f, decalage))),
      fins: res.traces.map((tr) => ({ dir: tr.dir, fin: tr.fin })),
    };
  }, [r.apercu, r.tir, joue, analyse.expr, x0, y0, equadiff, etat.obstacles, etat.crateres]);

  const premier = [...etat.joueurs].filter((p) => p.enJeu)
    .sort((a, b) => b.points - a.points || b.eliminations - a.eliminations)[0];
  const gagnantManche = etat.gagnants.length === 1 ? parId.get(etat.gagnants[0]) : null;
  const resteTransition = Math.max(0, Math.ceil((etat.transition - t) / 1000));
  const nomDe = (p: VueJoueur) => (p.id === etat.moi ? "Tu" : p.nom);

  let banniere: React.ReactNode = null;
  if (enRevelation) banniere = <>Départ dans <strong key={secondes} className="cf-decompte">{secondes}</strong></>;
  else if (etat.phase === "finManche") {
    banniere = gagnantManche
      ? `${nomDe(gagnantManche)} ${gagnantManche.id === etat.moi ? "survis" : "survit"} à la manche ${etat.manche} · nouvelle arène dans ${resteTransition} s`
      : `${etat.gagnants.length ? "Plusieurs survivants" : "Plus personne debout"} · nouvelle arène dans ${resteTransition} s`;
  } else if (etat.phase === "fin" && premier) banniere = `${nomDe(premier)} ${premier.id === etat.moi ? "gagnes" : "gagne"} la partie`;
  else if (etat.voile && etat.phase === "preparation") banniere = "Brouillard : tu ne vois que ce que tu as dégagé";

  return (
    <div className="cf-jeu">
      <header className="cf-barre">
        <Link href={ACCUEIL} onClick={quitter} aria-label="Quitter la partie" className="cf-barre__bouton"><Chevron /></Link>
        <p className="cf-barre__titre">Curve Fight <span>{etat.code}</span></p>
        <p className="cf-barre__infos">
          Manche {etat.manche}/{r.manches} · Volée {etat.volee}/{VOLEES_MAX}
          <span> · {r.mode === "brouillard" ? "Brouillard" : "Classique"} · {equadiff ? "y′ = f(x, y)" : "y = f(x)"}{r.repereMuet ? " · Repère muet" : ""}</span>
        </p>
        <button type="button" className="cf-barre__bouton" aria-pressed={son} onClick={basculerSon}
                aria-label={son ? "Couper le son" : "Activer le son"}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z" />
            {son ? <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" /> : <path d="m16 9.5 5 5m0-5-5 5" />}
          </svg>
        </button>
      </header>

      <div className="cf-corps">
        <Arene etat={etat} traces={traces} apercu={apercu} horloge={horloge} surEvenement={surEvenement}>
          {banniere && <p className="cf-banniere" role="status">{banniere}</p>}
        </Arene>

        <aside className="cf-panneau" aria-label="Expressions">
          <Etat etat={etat} horloge={horloge} agir={agir} quitter={quitter} enRevelation={enRevelation} secondes={secondes} />
          <ol className="cf-liste">
            {moi?.enJeu && (
              <LigneJoueur etat={etat} p={moi} tick={tick}>
                {joue && (
                  <Saisie etat={etat} moi={moi} agir={agir} horloge={horloge} brouillon={brouillon} setBrouillon={setBrouillon}
                          valide={!!analyse.expr} message={analyse.message} apercu={apercu} />
                )}
              </LigneJoueur>
            )}
            {etat.joueurs.filter((p) => p.enJeu && p.id !== etat.moi).map((p) => (
              <LigneJoueur key={p.id} etat={etat} p={p} tick={tick} />
            ))}
          </ol>

          {moi && !moi.enJeu && (
            <p className="cf-note">La partie a commencé sans toi : tu regardes, et tu joueras la prochaine.</p>
          )}
          {etat.historique.length > 0 && etat.phase === "preparation" && (
            <section className="cf-historique">
              <h2 className="etiquette">Tes tirs de la manche</h2>
              <ul>
                {etat.historique.map((h) => (
                  <li key={h.volee}>
                    <button type="button" disabled={!joue || etat.monExpression !== null} onClick={() => setBrouillon(h.source)}
                            title="Reprendre cette expression">
                      <span className="min-w-0 truncate font-mono text-[14px]">{h.source}</span>
                      <span className="shrink-0 text-[13px] text-[var(--muted-foreground)]">{h.bilan}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {etat.joueurs.some((p) => !p.enJeu && p.present && p.id !== etat.moi) && (
            <p className="cf-note">
              Dans le public : {etat.joueurs.filter((p) => !p.enJeu && p.present && p.id !== etat.moi).map((p) => p.nom).join(", ")}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

/* --- En-tête du panneau : où en est la partie ------------------------------ */

function Etat({ etat, horloge, agir, quitter, enRevelation, secondes }: {
  etat: VueSalon; horloge: () => number; agir: Agir; quitter: () => void; enRevelation: boolean; secondes: number;
}) {
  const r = etat.reglages;
  if (etat.phase === "fin") {
    const classement = etat.joueurs.filter((p) => p.enJeu)
      .sort((a, b) => b.points - a.points || b.eliminations - a.eliminations);
    return (
      <section className="cf-etat">
        <p className="etiquette">Partie terminée</p>
        <ol className="mt-1">
          {classement.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 py-1.5 text-[15px]" style={teinte(p.couleur)}>
              <span className="w-4 text-[13px] text-[var(--muted-foreground)]">{i + 1}</span>
              <span className="cf-pion" aria-hidden="true" />
              <span className={`min-w-0 flex-1 truncate ${i === 0 ? "font-semibold" : ""}`}>{p.id === etat.moi ? "Toi" : p.nom}</span>
              <span className="text-[13px] text-[var(--muted-foreground)]">{p.eliminations} élim.</span>
              <span className="w-12 text-right font-semibold">{p.points} pt{p.points > 1 ? "s" : ""}</span>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-col gap-2">
          {etat.hote === etat.moi
            ? <button type="button" className="bouton-principal !h-12" onClick={() => agir({ t: "salon" })}>Revenir au salon</button>
            : <p className="text-[14px] text-[var(--muted-foreground)]" role="status">L’hôte relance quand il veut.</p>}
          <Link href={`${ACCUEIL}/classement`} onClick={quitter} className="lien-discret self-start">Voir le classement</Link>
        </div>
      </section>
    );
  }

  if (etat.phase === "preparation") {
    const reste = etat.echeance ? Math.max(0, etat.echeance - horloge()) : null;
    const attendus = etat.joueurs.filter((p) => p.enJeu && p.vivant && !p.bot);
    const presse = reste !== null && reste < 10_000;
    return (
      <section className="cf-etat">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-semibold">À vos expressions</p>
          {reste !== null && (
            <p role="timer" aria-label="Temps de réflexion restant"
               className={`text-[22px] font-semibold leading-none ${presse ? "text-[var(--destructive)]" : ""}`}>
              {Math.ceil(reste / 1000)} s
            </p>
          )}
        </div>
        {reste !== null && (
          <div className="barre mt-2.5">
            <span style={{ width: `${Math.min(100, (reste / (r.temps * 1000)) * 100)}%`, transition: "width 200ms linear",
                           background: presse ? "var(--destructive)" : undefined }} />
          </div>
        )}
        <p className="mt-2 text-[13px] text-[var(--muted-foreground)]">
          {attendus.filter((p) => p.pret).length}/{attendus.length} prêt{attendus.length > 1 ? "s" : ""} · les courbes partent quand tout le monde a verrouillé.
        </p>
      </section>
    );
  }

  const titre = etat.phase === "finManche" ? `Fin de la manche ${etat.manche}`
    : enRevelation ? "Expressions dévoilées" : `Volée ${etat.tir?.volee ?? etat.volee}`;
  const detail = etat.phase === "finManche" ? "Les points sont comptés, une nouvelle arène arrive."
    : enRevelation ? `Les courbes partent dans ${secondes} s, toutes à la même vitesse.`
    : "Les courbes avancent toutes à la même vitesse.";
  return (
    <section className="cf-etat">
      <p className="text-[15px] font-semibold">{titre}</p>
      <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">{detail}</p>
    </section>
  );
}

/* --- Une ligne par joueur, comme dans une calculatrice graphique ----------- */

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

function LigneJoueur({ etat, p, tick, children }: {
  etat: VueSalon; p: VueJoueur; tick: number; children?: React.ReactNode;
}) {
  const tir = etat.tir;
  const equadiff = etat.reglages.tir === "equadiff";
  const moi = p.id === etat.moi;
  const vivant = vivantALecran(etat, p, tick);
  const nom = (id: string) => (id === etat.moi ? "toi" : etat.joueurs.find((j) => j.id === id)?.nom ?? "?");

  // Le serveur a déjà compté toute la volée : on retient les points pas encore vus à l'écran.
  const evenements = tir?.evenements ?? [];
  const aVenir = etat.phase === "volee"
    ? evenements.filter((e) => e.type === "elimination" && e.tueur === p.id && e.tick > tick).length : 0;
  const vus = evenements.filter((e) => e.type === "elimination" && e.tick <= tick);
  const touches = vus.flatMap((e) => (e.type === "elimination" && e.tueur === p.id ? [e.victime] : []));
  const victimes = touches.filter((id) => id !== etat.moi).map(nom);
  const bourreau = vus.find((e) => e.type === "elimination" && e.victime === p.id);
  const expression = tir?.expressions.find((e) => e.id === p.id);
  const enPreparation = etat.phase === "preparation";

  let statut = "";
  if (enPreparation && vivant) statut = p.bot || p.pret ? "prêt" : p.present ? "réfléchit" : "absent";
  else if (!vivant) statut = "éliminé";

  return (
    <li className="cf-ligne" style={teinte(p.couleur)} data-eteint={vivant ? undefined : ""}>
      <div className="cf-ligne__marge"><span className="cf-pion" data-barre={vivant ? undefined : ""} aria-hidden="true" /></div>
      <div className="cf-ligne__corps">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 truncate text-[14px] font-semibold">{moi ? "Toi" : p.nom}</p>
          {statut && <p className="shrink-0 text-[13px] text-[var(--muted-foreground)]">{statut}</p>}
          <p className="ml-auto shrink-0 text-[14px] font-semibold" title="Points">{p.points - aVenir}</p>
        </div>
        {children}
        {!children && expression && (
          <p className={`cf-formule ${enPreparation ? "cf-formule--passee" : ""}`}>
            {expression.source
              ? <Formule source={expression.source} equadiff={equadiff} />
              : <span className="text-[14px] text-[var(--muted-foreground)]">n’a pas tiré</span>}
          </p>
        )}
        {!enPreparation && (touches.length > 0 || bourreau) && (
          <p className="mt-0.5 text-[13px] text-[var(--muted-foreground)]">
            {touches.includes(etat.moi) && <>T’élimine. </>}
            {victimes.length > 0 && <>Élimine {victimes.join(", ")}. </>}
            {bourreau && bourreau.type === "elimination" && <>Touché par {nom(bourreau.tueur)}.</>}
          </p>
        )}
        {enPreparation && moi && !vivant && (
          <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">Tu reviens à la manche suivante.</p>
        )}
      </div>
    </li>
  );
}

/* --- La saisie -------------------------------------------------------------- */

function Saisie({ etat, moi, agir, horloge, brouillon, setBrouillon, valide, message, apercu }: {
  etat: VueSalon; moi: VueJoueur; agir: Agir; horloge: () => number;
  brouillon: string; setBrouillon: (v: string) => void;
  valide: boolean; message: string; apercu: ApercuDetaille | null;
}) {
  const r = etat.reglages;
  const equadiff = r.tir === "equadiff";
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const verrouille = etat.monExpression !== null;

  async function valider() {
    if (!valide) return;
    const e = await agir({ t: "tirer", expression: brouillon });
    setErreur(e);
    if (!e) sons.pret();
  }

  // À la dernière seconde, un brouillon valide part tout seul.
  const reste = etat.echeance ? Math.max(0, etat.echeance - horloge()) : null;
  const envoiAuto = useRef(0);
  useEffect(() => {
    if (reste !== null && reste < 1300 && !verrouille && valide && envoiAuto.current !== etat.echeance) {
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

  const touches = ["x", ...(equadiff ? ["y"] : []), "+", "-", "*", "/", "^", "(", ")", "π", "e",
    ...FAMILLES.filter((f) => r.familles.includes(f.cle)).flatMap((f) => f.fonctions.map((n) => `${n}(`))];
  const longueur = brouillon.replace(/\s+/g, "").length;
  const position = r.repereMuet || moi.x === null || moi.y === null ? null : `(${ecrireNombre(moi.x)}\u00a0;\u00a0${ecrireNombre(moi.y)})`;

  // Ce que l'aperçu montre, en clair.
  let lecture: React.ReactNode = null;
  if (apercu && !apercu.part) {
    lecture = (
      <p className="text-[var(--destructive)]">
        {equadiff ? "La pente n’est pas définie là où tu es" : `f n’est pas définie en ton abscisse${position ? ` (x = ${ecrireNombre(moi.x ?? 0)})` : ""}`} : aucune courbe ne partirait.
      </p>
    );
  } else if (apercu) {
    const de = (dir: 1 | -1) => FINS[apercu.fins.find((f) => f.dir === dir)?.fin ?? "bord"];
    lecture = (
      <>
        {!equadiff && (
          <p>
            <span className="cf-trait cf-trait--tirets" aria-hidden="true" /> Ton tir
            {position ? <> : <span className="font-mono">y = f(x){ecrireNombre(apercu.decalage, 2) === "0" ? "" : ` ${apercu.decalage < 0 ? "−" : "+"} ${ecrireNombre(Math.abs(apercu.decalage), 2)}`}</span>, pour passer par toi {position}.</>
                      : " : le graphe translaté pour passer par toi."}
            <br />
            <span className="cf-trait cf-trait--points" aria-hidden="true" /> Le graphe de f, tel quel.
          </p>
        )}
        {equadiff && <p><span className="cf-trait cf-trait--tirets" aria-hidden="true" /> La solution qui passe par toi{position ? ` ${position}` : ""}, sur son champ de pentes.</p>}
        <p>À droite, elle {de(1)} ; à gauche, elle {de(-1)}.</p>
      </>
    );
  } else if (!r.apercu) {
    lecture = (
      <p>
        Pas d’aperçu dans ce salon : la courbe {equadiff ? "sera la solution qui passe par toi" : "sera le graphe de f, translaté pour passer par toi"}
        {position ? ` ${position}` : ""}.
      </p>
    );
  }

  if (verrouille) {
    return (
      <>
        <p className="cf-formule"><Formule source={etat.monExpression!} equadiff={equadiff} /></p>
        <div className="cf-lecture">{lecture}</div>
        <button type="button" className="puce mt-2" onClick={() => agir({ t: "annuler" })}>Modifier mon expression</button>
      </>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void valider(); }}>
      <label className="cf-saisie">
        <span>{equadiff ? "y′ =" : "f(x) ="}</span>
        <input ref={champ} className="champ-nu" value={brouillon} onChange={(e) => setBrouillon(e.target.value)}
               placeholder={equadiff ? "0.2y - x/10" : "3sin(x/4) - x/5"} maxLength={120} aria-label="Ton expression"
               autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" />
        {r.longueurMax > 0 && (
          <small className={longueur > r.longueurMax ? "text-[var(--destructive)]" : ""}>{longueur}/{r.longueurMax}</small>
        )}
      </label>
      <div className="cf-rendu" aria-live="polite">
        {valide ? <Formule source={brouillon} equadiff={equadiff} />
          : <p data-erreur={message ? "" : undefined}>
              {message || "Écris ton expression : elle s’affiche ici en écriture mathématique."}
            </p>}
      </div>
      {valide && lecture && <div className="cf-lecture">{lecture}</div>}
      <div className="cf-clavier" role="group" aria-label="Touches">
        {touches.map((k) => (
          <button key={k} type="button" onClick={() => inserer(k === "π" ? "pi" : k)}>{k === "*" ? "×" : k === "-" ? "−" : k === "/" ? "÷" : k}</button>
        ))}
      </div>
      {erreur && <p role="alert" className="mb-2 text-[13px] text-[var(--destructive)]">{erreur}</p>}
      <button type="submit" className="bouton-principal !h-12" disabled={!valide}>Verrouiller mon tir</button>
    </form>
  );
}
