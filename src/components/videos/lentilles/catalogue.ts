import type { Contexte, Lentille, Point, Visage } from "./moteur";
import {
  BOUCHE, FRONT, IRIS_D, IRIS_G, MENTON, NEZ, OEIL_D, OEIL_G, OVALE, POLICE,
  autre, boite, bullePensee, coller, dist, grossir, hasard, lisser, milieu, morceau, rectArrondi, tape, texteMeme, vignette, zoomer,
} from "./outils";

/*
 * Lentilles drôles, dans l'esprit des formats qui marchent sur les réseaux
 * (arrêt sur image, zoom dramatique, boom, yeux laser, randomiseur, PNJ…),
 * réécrites pour la prépa. Tout est dessiné et sonorisé par le code :
 * aucune image, aucun son ni texte repris d'ailleurs.
 */

const bouche = (v: Visage) => v.forme.jawOpen ?? 0;
const sourcils = (v: Visage) => Math.max(v.forme.browInnerUp ?? 0, ((v.forme.browOuterUpLeft ?? 0) + (v.forme.browOuterUpRight ?? 0)) / 2);
const sourire = (v: Visage) => ((v.forme.mouthSmileLeft ?? 0) + (v.forme.mouthSmileRight ?? 0)) / 2;
const centre = (v: Visage): Point => milieu(v.pts[FRONT], v.pts[MENTON]);
/** Haut de la tête (au-dessus du front), pour les bulles et étiquettes. */
function sommet(v: Visage): Point {
  const f = v.pts[FRONT], m = v.pts[MENTON];
  return { x: f.x + (f.x - m.x) * 0.35, y: f.y + (f.y - m.y) * 0.35 };
}

/** Front montant : vrai quand `x` passe au-dessus de `seuil`, avec un temps de repos. */
function front(e: { haut: boolean; repos: number }, x: number, seuil: number, t: number, repos = 1.2): boolean {
  const avant = e.haut;
  e.haut = x > seuil ? true : x < seuil * 0.6 ? false : e.haut;
  if (!avant && e.haut && t > e.repos) { e.repos = t + repos; return true; }
  return false;
}

/*
 * Les commandes de la caméra couvrent le bas de l'écran (≈ 35 %) : les
 * légendes restent au-dessus, et sous la zone du haut (≈ 12 %).
 */
const BAS = 0.64;
const HAUT = 0.13;
/* Sur un téléphone allongé, l'image 9:16 est rognée sur les côtés (≈ 10 % chacun). */
const SUR = 0.74;

function aideBas(c: Contexte, texte: string) {
  texteMeme(c.ctx, texte, c.W / 2, c.H * BAS, Math.round(c.W * 0.045), c.W * SUR, { base: "bottom" });
}

function sansVisage(c: Contexte, texte = "Montrez votre visage 👀") {
  c.ctx.fillStyle = "rgba(0,0,0,.25)";
  c.ctx.fillRect(0, 0, c.W, c.H);
  texteMeme(c.ctx, texte, c.W / 2, c.H * 0.45, Math.round(c.W * 0.06), c.W * 0.8);
}

/* --- 1. Arrêt sur image ------------------------------------------------ */

const NARRATIONS = [
  "Oui, c'est moi.\nVous vous demandez sûrement comment j'en suis arrivé là.",
  "Il y a trois mois, j'ai dit : « la prépa, ça va être tranquille ».",
  "Ce jour-là, j'ai appris que le DM n'était pas facultatif.",
  "Petit retour en arrière : tout a commencé avec un « c'est trivial ».",
  "Spoiler : je n'ai toujours pas compris le cours.",
  "Mon colleur m'a dit « on va s'arrêter là ». Il parlait de ma carrière.",
  "Et là, je réalise que la colle, c'était aujourd'hui.",
];

const arret: Lentille<{ fige: HTMLCanvasElement | null; jusqua: number; texte: string | null; debutTexte: number; s: { haut: boolean; repos: number } }> = {
  cle: "arret", nom: "Arrêt sur image", icone: "⏸️",
  aide: "Touchez l'écran (ou haussez les sourcils) : image figée, narration.",
  init: () => ({ fige: null, jusqua: 0, texte: null, debutTexte: 0, s: { haut: false, repos: 0 } }),
  dessiner(c, e) {
    const declenche = c.toucher || (c.visage ? front(e.s, sourcils(c.visage), 0.55, c.t, 4) : false);
    if (declenche && c.t > e.jusqua) {
      e.fige ??= document.createElement("canvas");
      e.fige.width = c.W; e.fige.height = c.H;
      const x = e.fige.getContext("2d")!;
      x.filter = "sepia(0.55) contrast(1.15) saturate(0.8)";
      x.drawImage(c.cadre, 0, 0);
      e.jusqua = c.t + 4.2;
      e.texte = autre(NARRATIONS, e.texte);
      e.debutTexte = c.t + 0.45;
      c.sons.rayure();
    }
    if (e.fige && c.t < e.jusqua) {
      const k = 1 + Math.min(0.08, (c.t - (e.jusqua - 4.2)) * 0.04);
      c.ctx.save();
      c.ctx.translate(c.W / 2, c.H / 2); c.ctx.scale(k, k); c.ctx.translate(-c.W / 2, -c.H / 2);
      c.ctx.drawImage(e.fige, 0, 0);
      c.ctx.restore();
      vignette(c.ctx, c.W, c.H, 0.55);
      // Bandes de cinéma.
      const b = c.H * 0.07;
      c.ctx.fillStyle = "#000";
      c.ctx.fillRect(0, 0, c.W, b); c.ctx.fillRect(0, c.H - b, c.W, b);
      const t = e.texte ? tape(e.texte, c.t - e.debutTexte, 32) : "";
      if (t) {
        c.ctx.save();
        c.ctx.font = `italic 700 ${Math.round(c.W * 0.05)}px ${POLICE}`;
        texteMeme(c.ctx, t, c.W / 2, c.H * BAS, Math.round(c.W * 0.055), c.W * SUR, { base: "bottom" });
        c.ctx.restore();
      }
      return;
    }
    if (c.t < 3) aideBas(c, "Touchez l'écran pour figer l'image");
  },
};

/* --- 2. Zoom dramatique ------------------------------------------------- */

const zoom: Lentille<{ k: number; jusqua: number; s: { haut: boolean; repos: number } }> = {
  cle: "zoom", nom: "Zoom dramatique", icone: "😱",
  aide: "Ouvrez grand la bouche (ou touchez) : zoom et musique de tragédie.",
  init: () => ({ k: 1, jusqua: 0, s: { haut: false, repos: 0 } }),
  dessiner(c, e) {
    const v = c.visage;
    if ((v && front(e.s, bouche(v), 0.45, c.t, 2.8)) || (c.toucher && c.t > e.jusqua)) {
      e.jusqua = c.t + 2.6;
      c.sons.dramatique();
    }
    const actif = c.t < e.jusqua;
    const cible = actif ? (c.t > e.jusqua - 2.0 ? 2.3 : 1.6) : 1;
    e.k = lisser(e.k, cible, c.dt, actif ? 14 : 5);
    if (e.k > 1.01 && v) {
      const yeux = milieu(v.pts[IRIS_G], v.pts[IRIS_D]);
      const dx = actif ? (Math.random() - 0.5) * c.W * 0.01 : 0;
      zoomer(c.ctx, c.cadre, c.W, c.H, yeux, e.k, dx, 0, actif ? "contrast(1.25) saturate(1.2)" : "none");
      if (actif) {
        vignette(c.ctx, c.W, c.H, 0.75, "60,0,0");
        // Lignes de vitesse façon manga.
        c.ctx.save();
        c.ctx.strokeStyle = "rgba(255,255,255,.35)";
        c.ctx.lineWidth = c.W * 0.004;
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * Math.PI * 2 + c.t * 0.3;
          const r0 = Math.hypot(c.W, c.H) * (0.38 + Math.random() * 0.06), r1 = Math.hypot(c.W, c.H) * 0.7;
          c.ctx.beginPath();
          c.ctx.moveTo(c.W / 2 + Math.cos(a) * r0, c.H / 2 + Math.sin(a) * r0);
          c.ctx.lineTo(c.W / 2 + Math.cos(a) * r1, c.H / 2 + Math.sin(a) * r1);
          c.ctx.stroke();
        }
        c.ctx.restore();
      }
    }
    if (!v) sansVisage(c);
    else if (c.t < 3) aideBas(c, "Ouvrez grand la bouche…");
  },
};

/* --- 3. Sourcils suspects (boom) ---------------------------------------- */

const LEGENDES_BOOM = ["Suspect.", "Hmm.", "Intéressant…", "Pardon ?", "Tu as dit « facile » ?", "Le DM, tu l'as fait ?"];

const boom: Lentille<{ jusqua: number; legende: string | null; s: { haut: boolean; repos: number } }> = {
  cle: "boom", nom: "Sourcils suspects", icone: "🤨",
  aide: "Haussez les sourcils : BOOM, zoom et légende.",
  init: () => ({ jusqua: 0, legende: null, s: { haut: false, repos: 0 } }),
  dessiner(c, e) {
    const v = c.visage;
    if ((v && front(e.s, sourcils(v), 0.5, c.t, 1.6)) || (c.toucher && c.t > e.jusqua)) {
      e.jusqua = c.t + 1.3;
      e.legende = autre(LEGENDES_BOOM, e.legende);
      c.sons.boom();
    }
    if (c.t < e.jusqua && v) {
      const p = 1 - (e.jusqua - c.t) / 1.3; // 0 → 1
      const k = 1.9 - Math.min(0.5, p * 0.6);
      const sec = Math.max(0, 1 - p * 3) * c.W * 0.03;
      const yeux = milieu(v.pts[IRIS_G], v.pts[IRIS_D]);
      zoomer(c.ctx, c.cadre, c.W, c.H, { x: yeux.x, y: yeux.y - v.largeur * 0.1 }, k,
        (Math.random() - 0.5) * sec, (Math.random() - 0.5) * sec, "saturate(2.2) contrast(1.5)");
      if (p < 0.12) { c.ctx.fillStyle = "rgba(255,255,255,.55)"; c.ctx.fillRect(0, 0, c.W, c.H); }
      vignette(c.ctx, c.W, c.H, 0.6);
      if (e.legende) texteMeme(c.ctx, e.legende, c.W / 2, c.H * BAS, Math.round(c.W * 0.085), c.W * SUR, { base: "bottom" });
      return;
    }
    if (!v) sansVisage(c);
    else if (c.t < 3) aideBas(c, "Haussez les sourcils…");
  },
};

/* --- 4. Yeux laser ------------------------------------------------------ */

const laser: Lentille<{ force: number; son: number }> = {
  cle: "laser", nom: "Yeux laser", icone: "🔴",
  aide: "Ouvrez la bouche pour tirer. Le mode « je vais tout valider ».",
  init: () => ({ force: 0, son: 0 }),
  dessiner(c, e) {
    const v = c.visage;
    if (!v) { sansVisage(c); return; }
    const tir = bouche(v) > 0.35 || c.toucher;
    e.force = lisser(e.force, tir ? 1 : 0, c.dt, tir ? 12 : 6);
    if (tir && c.t > e.son) { c.sons.laser(); e.son = c.t + 0.45; }
    if (e.force > 0.05) {
      // « Deep fried » : couleurs cramées pendant le tir.
      c.ctx.save();
      c.ctx.globalAlpha = e.force;
      c.ctx.filter = "saturate(3) contrast(1.7) brightness(1.1)";
      c.ctx.drawImage(c.cadre, 0, 0);
      c.ctx.restore();
    }
    const dir = { x: (v.pts[1].x - v.pts[168].x) * 3, y: (v.pts[1].y - v.pts[168].y) * 0.8 + v.largeur * 0.25 };
    const n = Math.hypot(dir.x, dir.y) || 1;
    const L = Math.hypot(c.W, c.H) * 1.2;
    c.ctx.save();
    c.ctx.globalCompositeOperation = "lighter";
    for (const i of [IRIS_G, IRIS_D]) {
      const o = v.pts[i];
      const r = v.largeur * (0.07 + 0.08 * e.force);
      const g = c.ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * 2.4);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.25, "rgba(255,40,40,.95)");
      g.addColorStop(1, "rgba(255,0,0,0)");
      c.ctx.fillStyle = g;
      c.ctx.beginPath(); c.ctx.arc(o.x, o.y, r * 2.4, 0, Math.PI * 2); c.ctx.fill();
      // Éclat en étoile.
      c.ctx.strokeStyle = "rgba(255,120,120,.8)";
      c.ctx.lineWidth = Math.max(2, v.largeur * 0.008);
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 4 + c.t * 2;
        const l = r * (3.5 + e.force * 4);
        c.ctx.beginPath(); c.ctx.moveTo(o.x - Math.cos(a) * l, o.y - Math.sin(a) * l); c.ctx.lineTo(o.x + Math.cos(a) * l, o.y + Math.sin(a) * l); c.ctx.stroke();
      }
      if (e.force > 0.1) {
        const fin = { x: o.x + (dir.x / n) * L, y: o.y + (dir.y / n) * L };
        for (const [w, col] of [[v.largeur * 0.12 * e.force, "rgba(255,0,0,.35)"], [v.largeur * 0.05 * e.force, "rgba(255,60,60,.8)"], [v.largeur * 0.016 * e.force, "#fff"]] as const) {
          c.ctx.strokeStyle = col; c.ctx.lineWidth = w; c.ctx.lineCap = "round";
          c.ctx.beginPath(); c.ctx.moveTo(o.x, o.y); c.ctx.lineTo(fin.x, fin.y); c.ctx.stroke();
        }
      }
    }
    c.ctx.restore();
    if (c.t < 3) aideBas(c, "Ouvrez la bouche pour tirer");
  },
};

/* --- 5. Randomiseur prépa ----------------------------------------------- */

const QUESTIONS: { q: string; r: string[] }[] = [
  { q: "Ton école dans deux ans", r: ["L'X (dans tes rêves)", "Centrale, en 5/2", "Une école à Douai", "L3 de philo", "Reconversion : boulangerie", "Une start-up crypto", "L'ENS (de la vie)", "Encore en prépa"] },
  { q: "Ta note au prochain DS", r: ["4,5 (et c'est bien)", "−2, record historique", "20 (t'as copié)", "Copie blanche artistique", "7, « des idées »", "Hors barème"] },
  { q: "Ce que pense ton colleur", r: ["« C'est trivial. »", "« Vous êtes sûr ? »", "« On va s'arrêter là. »", "« C'est du cours. »", "« Effacez tout. »", "« Bon courage. »"] },
  { q: "Ton heure de coucher ce soir", r: ["23 h (menteur)", "3 h 12", "Jamais", "Pendant la colle", "Demain 6 h, debout 6 h 05"] },
  { q: "Ton moral après le DM", r: ["Forme indéterminée 0/0", "Tend vers 0", "Non mesurable", "Négatif mais borné", "Divergent"] },
  { q: "Ta vraie passion", r: ["Le café", "Dire « ouais ouais »", "Recopier le corrigé", "Le colloscope", "Dormir en amphi", "Les pauses de 10 min qui durent 1 h"] },
];

type EtatRandom = { q: typeof QUESTIONS[number] | null; debut: number; fin: number; affiche: string; prochain: number; s: { haut: boolean; repos: number } };

const random: Lentille<EtatRandom> = {
  cle: "random", nom: "Randomiseur prépa", icone: "🎰",
  aide: "Touchez l'écran ou ouvrez la bouche : le destin choisit pour vous.",
  init: () => ({ q: null, debut: 0, fin: 0, affiche: "", prochain: 0, s: { haut: false, repos: 0 } }),
  dessiner(c, e) {
    const v = c.visage;
    const relance = c.toucher || (v ? front(e.s, bouche(v), 0.45, c.t, 1) : false);
    if ((relance || !e.q) && (c.t > e.fin + 0.6 || !e.q)) {
      e.q = autre(QUESTIONS, e.q);
      e.debut = c.t; e.fin = c.t + 3.2; e.prochain = 0;
    }
    if (!e.q) return;
    const tourne = c.t < e.fin;
    if (tourne && c.t >= e.prochain) {
      e.affiche = autre(e.q.r, e.affiche);
      // Ralentit vers la fin, comme une roue.
      const p = (c.t - e.debut) / (e.fin - e.debut);
      e.prochain = c.t + 0.05 + p * p * 0.35;
      c.sons.tic(p > 0.8);
      if (c.t + (0.05 + p * p * 0.35) >= e.fin) c.sons.fanfare();
    }
    const T = Math.round(c.W * 0.048);
    const p = v ? sommet(v) : { x: c.W / 2, y: c.H * 0.25 };
    const y = Math.max(c.H * (HAUT + 0.1), p.y - T * 1.2);
    c.ctx.save();
    c.ctx.font = `700 ${T}px ${POLICE}`;
    const w = Math.min(c.W * SUR, Math.max(c.ctx.measureText(e.affiche).width, c.W * 0.4) + T * 1.6);
    rectArrondi(c.ctx, p.x - w / 2, y - T * 0.9, w, T * 1.8, T * 0.5);
    c.ctx.fillStyle = tourne ? "rgba(20,20,20,.85)" : "#fe2c55";
    c.ctx.fill();
    c.ctx.fillStyle = "#fff"; c.ctx.textAlign = "center"; c.ctx.textBaseline = "middle";
    c.ctx.fillText(e.affiche, p.x, y, w - T);
    c.ctx.restore();
    texteMeme(c.ctx, e.q.q, c.W / 2, c.H * HAUT, Math.round(c.W * 0.06), c.W * SUR);
  },
};

/* --- 6. Pensées intrusives ---------------------------------------------- */

const PENSEES = [
  "Et si je devenais influenceur ?",
  "Le prof a dit « évident » il y a 20 min. Toujours pas évident.",
  "Quatre cafés, ça compte comme un repas ?",
  "Mes parents pensent que je travaille, là.",
  "Si je ferme les yeux 5 min, ça compte comme une nuit ?",
  "Le DM est pour demain. Le demain d'avant-hier.",
  "Je hoche la tête depuis une heure. Je n'ai rien compris.",
  "Peut-être que le droit, c'était pas si mal.",
  "Mon cerveau a quitté le groupe.",
  "Ma seule relation stable : le colloscope.",
  "J'ai dit « oui c'est clair » par pur réflexe.",
  "Je pourrais tout plaquer et élever des chèvres.",
  "Pourquoi j'ai levé la main ?",
  "Ce soir je dors tôt. (Non.)",
];

const pensees: Lentille<{ texte: string | null; depuis: number }> = {
  cle: "pensees", nom: "Pensées intrusives", icone: "💭",
  aide: "Vos vraies pensées s'affichent au-dessus de votre tête. Touchez pour la suivante.",
  init: () => ({ texte: null, depuis: 0 }),
  dessiner(c, e) {
    const v = c.visage;
    if (!e.texte || c.toucher || c.t - e.depuis > 4.5) { e.texte = autre(PENSEES, e.texte); e.depuis = c.t; }
    if (!v) { sansVisage(c); return; }
    const s = sommet(v);
    const T = Math.round(c.W * 0.045);
    const x = Math.max(c.W * 0.4, Math.min(c.W * 0.6, s.x + v.largeur * 0.15));
    bullePensee(c.ctx, tape(e.texte, c.t - e.depuis, 30) || " ", x, s.y - T * 0.5, c.W * 0.62, T, { x: s.x, y: s.y + T }, c.H * HAUT);
  },
};

/* --- 7. PNJ ------------------------------------------------------------- */

const REPLIQUES = [
  "Bonjour, aventurier. Tu cherches la salle de colle ? Moi aussi. Depuis septembre.",
  "Je peux te vendre un DM corrigé. Trois cafés. Pas de remboursement.",
  "Quête disponible : « Comprendre l'électrocinétique ». Récompense : aucune.",
  "Au nord, il y a un DS. Beaucoup y sont allés. Peu sont revenus.",
  "Mon moral se régénère uniquement pendant les vacances.",
  "Tu as fait le DM ? Moi non plus. On est alliés maintenant.",
  "Je dis toujours la même phrase. C'est ça, la prépa.",
];

const pnj: Lentille<{ i: number; depuis: number; moral: number; blip: number; parle: { haut: boolean; repos: number } }> = {
  cle: "pnj", nom: "PNJ", icone: "🎮",
  aide: "Vous devenez un PNJ de jeu vidéo. Ouvrez la bouche ou touchez pour la réplique suivante.",
  init: () => ({ i: Math.floor(Math.random() * REPLIQUES.length), depuis: 0, moral: 100, blip: 0, parle: { haut: false, repos: 0 } }),
  dessiner(c, e) {
    const v = c.visage;
    const ligne = REPLIQUES[e.i];
    if (c.toucher || (v && front(e.parle, bouche(v), 0.35, c.t, 1.5) && c.t - e.depuis > ligne.length / 30)) {
      e.i = (e.i + 1) % REPLIQUES.length; e.depuis = c.t;
      e.moral = Math.max(3, e.moral - 17);
      if (e.moral <= 3) c.sons.aie();
    }
    // Teint « jeu vidéo » : postérisé et un peu terne.
    c.ctx.save();
    c.ctx.filter = "saturate(0.7) contrast(1.15)";
    c.ctx.drawImage(c.cadre, 0, 0);
    c.ctx.restore();
    const T = Math.round(c.W * 0.04);
    if (v) {
      const s = sommet(v);
      const y = Math.max(c.H * HAUT + T, s.y - T * 2);
      c.ctx.save();
      c.ctx.font = `700 ${T}px ${POLICE}`;
      c.ctx.textAlign = "center"; c.ctx.textBaseline = "bottom";
      c.ctx.fillStyle = "#ffe14d"; c.ctx.strokeStyle = "#000"; c.ctx.lineWidth = T * 0.2;
      const nom = "Élève de prépa · Niv. 1";
      c.ctx.strokeText(nom, s.x, y); c.ctx.fillText(nom, s.x, y);
      // Barre de moral.
      const bw = Math.min(c.W * 0.5, Math.max(c.W * 0.35, v.largeur * 0.9)), bh = T * 0.55;
      c.ctx.fillStyle = "#000"; c.ctx.fillRect(s.x - bw / 2 - 3, y + T * 0.2 - 3, bw + 6, bh + 6);
      c.ctx.fillStyle = "#3b0d0d"; c.ctx.fillRect(s.x - bw / 2, y + T * 0.2, bw, bh);
      c.ctx.fillStyle = e.moral > 40 ? "#46d160" : e.moral > 15 ? "#f5b800" : "#ff3b3b";
      c.ctx.fillRect(s.x - bw / 2, y + T * 0.2, (bw * e.moral) / 100, bh);
      c.ctx.font = `700 ${Math.round(T * 0.7)}px ${POLICE}`;
      c.ctx.fillStyle = "#fff"; c.ctx.textBaseline = "top";
      c.ctx.fillText(`MORAL ${Math.round(e.moral)} %`, s.x, y + T * 0.95);
      c.ctx.restore();
    }
    // Boîte de dialogue en bas, texte qui s'écrit avec des blips.
    const visible = tape(ligne, c.t - e.depuis, 30);
    if (visible.length < ligne.length && c.t > e.blip) { c.sons.blip(); e.blip = c.t + 0.07; }
    const bx = c.W * 0.05, bw = c.W * SUR, bh = T * 5.2, by = c.H * BAS - bh;
    c.ctx.save();
    c.ctx.fillStyle = "rgba(10,14,40,.88)"; c.ctx.strokeStyle = "#fff"; c.ctx.lineWidth = Math.max(3, T * 0.15);
    rectArrondi(c.ctx, bx, by, bw, bh, T * 0.4); c.ctx.fill(); c.ctx.stroke();
    c.ctx.font = `700 ${T}px ${POLICE}`;
    c.ctx.fillStyle = "#fff"; c.ctx.textAlign = "left"; c.ctx.textBaseline = "top";
    const mots = visible.split(" ");
    let l = "", yy = by + T * 0.7;
    for (const m of mots) {
      const essai = l ? `${l} ${m}` : m;
      if (c.ctx.measureText(essai).width > bw - T * 1.6 && l) { c.ctx.fillText(l, bx + T * 0.8, yy); yy += T * 1.3; l = m; } else l = essai;
    }
    c.ctx.fillText(l, bx + T * 0.8, yy);
    if (visible.length === ligne.length && Math.floor(c.t * 2) % 2 === 0) {
      c.ctx.textAlign = "right"; c.ctx.fillText("▼", bx + bw - T * 0.7, by + bh - T * 1.5);
    }
    c.ctx.restore();
  },
};

/* --- 8. Détecteur de mensonge ------------------------------------------ */

const VERDICTS_FAUX = ["Même le colleur n'y croit pas.", "Sincérité : 2 %.", "Le polygraphe a ri.", "On a tous vu.", "Bien tenté."];
const VERDICTS_VRAI = ["Étonnant.", "Vrai, malheureusement.", "Ça fait mal, mais c'est vrai.", "Respect."];
const AMORCES = ["Dites : « J'ai fait le DM. »", "Dites : « J'ai tout compris au cours. »", "Dites : « Je me couche à 22 h. »", "Dites : « Je relis mes fiches. »"];

type EtatMensonge = { aiguille: number; parle: number; silence: number; verdict: { faux: boolean; texte: string; t: number } | null; amorce: string };

const mensonge: Lentille<EtatMensonge> = {
  cle: "mensonge", nom: "Détecteur de mensonge", icone: "🕵️",
  aide: "Dites une phrase, arrêtez-vous : le verdict tombe.",
  init: () => ({ aiguille: 0.5, parle: 0, silence: 0, verdict: null, amorce: hasard(AMORCES) }),
  dessiner(c, e) {
    const v = c.visage;
    const ouvre = v ? bouche(v) : 0;
    if (ouvre > 0.12) { e.parle += c.dt; e.silence = 0; } else e.silence += c.dt;
    if (c.toucher && !e.verdict) { e.parle = Math.max(e.parle, 0.8); e.silence = 1; }
    if (!e.verdict && e.parle > 0.7 && e.silence > 0.7) {
      const faux = Math.random() < 0.7;
      e.verdict = { faux, texte: hasard(faux ? VERDICTS_FAUX : VERDICTS_VRAI), t: c.t };
      faux ? c.sons.buzzer() : c.sons.ding();
      e.parle = 0;
    }
    if (e.verdict && c.t - e.verdict.t > 3.2) { e.verdict = null; e.amorce = autre(AMORCES, e.amorce); }
    // Cadran en haut : l'aiguille s'affole pendant qu'on parle.
    const cible = e.verdict ? (e.verdict.faux ? 0.95 : 0.05) : e.parle > 0 && ouvre > 0.1 ? 0.5 + (Math.random() - 0.5) * 0.9 : 0.5;
    e.aiguille = lisser(e.aiguille, cible, c.dt, e.verdict ? 8 : 18);
    const R = c.W * 0.18, cx = c.W / 2, cy = c.H * HAUT + R;
    c.ctx.save();
    c.ctx.fillStyle = "rgba(0,0,0,.6)";
    c.ctx.beginPath(); c.ctx.arc(cx, cy, R * 1.12, Math.PI, 0); c.ctx.fill();
    const zones: [number, number, string][] = [[0, 0.33, "#2ecc71"], [0.33, 0.66, "#f1c40f"], [0.66, 1, "#e74c3c"]];
    for (const [a, b, col] of zones) {
      c.ctx.strokeStyle = col; c.ctx.lineWidth = R * 0.18;
      c.ctx.beginPath(); c.ctx.arc(cx, cy, R * 0.9, Math.PI + a * Math.PI, Math.PI + b * Math.PI); c.ctx.stroke();
    }
    const a = Math.PI + e.aiguille * Math.PI;
    c.ctx.strokeStyle = "#fff"; c.ctx.lineWidth = R * 0.05; c.ctx.lineCap = "round";
    c.ctx.beginPath(); c.ctx.moveTo(cx, cy); c.ctx.lineTo(cx + Math.cos(a) * R * 0.85, cy + Math.sin(a) * R * 0.85); c.ctx.stroke();
    c.ctx.restore();
    texteMeme(c.ctx, "VÉRITÉ          MENSONGE", cx, cy + R * 0.08, Math.round(R * 0.16), c.W);
    if (e.verdict) {
      const p = Math.min(1, (c.t - e.verdict.t) * 5);
      const k = 1.6 - 0.6 * p;
      c.ctx.save();
      if (e.verdict.faux && c.t - e.verdict.t < 0.4) { c.ctx.fillStyle = "rgba(255,0,0,.25)"; c.ctx.fillRect(0, 0, c.W, c.H); }
      c.ctx.translate(c.W / 2, c.H * 0.47); c.ctx.rotate(-0.18); c.ctx.scale(k, k);
      const T = Math.round(c.W * 0.11);
      c.ctx.font = `700 ${T}px ${POLICE}`;
      const mot = e.verdict.faux ? "MENSONGE" : "VÉRITÉ";
      const w = c.ctx.measureText(mot).width + T * 0.6;
      c.ctx.strokeStyle = e.verdict.faux ? "#ff2d2d" : "#2ee66b"; c.ctx.lineWidth = T * 0.1;
      c.ctx.strokeRect(-w / 2, -T * 0.7, w, T * 1.4);
      c.ctx.fillStyle = c.ctx.strokeStyle; c.ctx.textAlign = "center"; c.ctx.textBaseline = "middle";
      c.ctx.fillText(mot, 0, 0);
      c.ctx.restore();
      texteMeme(c.ctx, e.verdict.texte, c.W / 2, c.H * BAS, Math.round(c.W * 0.06), c.W * SUR, { base: "bottom" });
    } else {
      aideBas(c, e.amorce);
    }
  },
};

/* --- 9. Caricature ----------------------------------------------------- */

const caricature: Lentille<{ k: number }> = {
  cle: "caricature", nom: "Caricature", icone: "🎨",
  aide: "Le portrait express de la place du Tertre. Ressemblance garantie (ou presque).",
  init: () => ({ k: 1 }),
  dessiner(c, e) {
    const v = c.visage;
    if (!v) { sansVisage(c); return; }
    e.k = lisser(e.k, 1, c.dt, 3);
    // Grosse tête ancrée au menton, puis gros nez et grande bouche par-dessus.
    const tete = boite(v, OVALE, 0.28);
    grossir(c.ctx, c.cadre, tete, "car-tete", 1.42, v.pts[MENTON], 0.22);
    const copie = (c.ctx.canvas as HTMLCanvasElement);
    const nez = boite(v, NEZ, 0.55);
    const ch = v.pts[MENTON];
    const deplace = (b: { cx: number; cy: number }) => ({ x: ch.x + (b.cx - ch.x) * 1.42, y: ch.y + (b.cy - ch.y) * 1.42 });
    const bNez = { ...nez, cx: deplace(nez).x, cy: deplace(nez).y, w: nez.w * 1.42, h: nez.h * 1.42 };
    grossir(c.ctx, copie, bNez, "car-nez", 1.85, null, 0.4);
    const bo = boite(v, BOUCHE, 0.45);
    const bBo = { ...bo, cx: deplace(bo).x, cy: deplace(bo).y, w: bo.w * 1.42, h: bo.h * 1.42 };
    grossir(c.ctx, copie, bBo, "car-bouche", 1.3, null, 0.4);
    // Cadre « papier » et signature.
    c.ctx.save();
    c.ctx.strokeStyle = "#f3ead7"; c.ctx.lineWidth = c.W * 0.035;
    c.ctx.strokeRect(c.W * 0.0175, c.W * 0.0175, c.W * 0.965, c.H - c.W * 0.035);
    c.ctx.restore();
    texteMeme(c.ctx, "Portrait express · 15 € · place du Tertre", c.W / 2, c.H * HAUT, Math.round(c.W * 0.045), c.W * SUR, { couleur: "#f3ead7" });
  },
};

/* --- 10. Double bouche -------------------------------------------------- */

const doubleBouche: Lentille<Record<string, never>> = {
  cle: "bouche", nom: "Double bouche", icone: "👄",
  aide: "Une deuxième bouche, à l'envers, sur le front. Parlez.",
  init: () => ({}),
  dessiner(c) {
    const v = c.visage;
    if (!v) { sansVisage(c); return; }
    const b = boite(v, BOUCHE, 0.5);
    const m = morceau(c.cadre, b, "bouche", 0.4);
    const f = v.pts[FRONT], yeux = milieu(v.pts[IRIS_G], v.pts[IRIS_D]);
    const pos = { x: f.x + (yeux.x - f.x) * 0.35, y: f.y + (yeux.y - f.y) * 0.35 };
    coller(c.ctx, m, pos.x, pos.y, 1.05, v.roll + Math.PI, false);
  },
};

/* --- 11. Lunettes de boss --------------------------------------------- */

/* Lunettes pixel dessinées case par case (motif original). */
const MOTIF = [
  "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "..XXXXXXXXXXXXX.....XXXXXXXXXXXXX..",
  "..XX..XX.XXXXXX.....XX..XX.XXXXXX..",
  "..XXX..XX.XXXXX.....XXX..XX.XXXXX..",
  "...XXXXXXXXXXX.......XXXXXXXXXXX...",
  "....XXXXXXXXX.........XXXXXXXXX....",
];

const lunettes: Lentille<{ actif: boolean; depuis: number }> = {
  cle: "lunettes", nom: "Mode boss", icone: "😎",
  aide: "Souriez franchement : les lunettes tombent. Assumez.",
  init: () => ({ actif: false, depuis: 0 }),
  dessiner(c, e) {
    const v = c.visage;
    if (!v) { sansVisage(c); return; }
    const sr = sourire(v);
    if (!e.actif && (sr > 0.55 || c.toucher)) { e.actif = true; e.depuis = c.t; c.sons.chute(); }
    if (e.actif && sr < 0.2 && c.t - e.depuis > 3 && !c.toucher) e.actif = false;
    const yeux = milieu(v.pts[IRIS_G], v.pts[IRIS_D]);
    const largeur = dist(v.pts[OEIL_G[0]], v.pts[OEIL_D[0]]) * 1.9;
    const p = e.actif ? Math.min(1, (c.t - e.depuis) / 0.9) : 0;
    const y = -largeur + (yeux.y + largeur) * (1 - (1 - p) ** 3);
    if (e.actif) {
      const case_ = largeur / MOTIF[0].length;
      c.ctx.save();
      c.ctx.translate(yeux.x, y);
      c.ctx.rotate(p >= 1 ? v.roll : 0);
      c.ctx.fillStyle = "#000";
      MOTIF.forEach((ligne, j) => {
        for (let i = 0; i < ligne.length; i++) {
          if (ligne[i] === "X") c.ctx.fillRect((i - ligne.length / 2) * case_, (j - 2) * case_, case_ + 0.5, case_ + 0.5);
        }
      });
      // Reflet sur les verres.
      c.ctx.fillStyle = "rgba(255,255,255,.85)";
      for (const [i, j] of [[4, 3], [5, 3], [24, 3], [25, 3], [5, 4], [25, 4]]) c.ctx.fillRect((i - MOTIF[0].length / 2) * case_, (j - 2) * case_, case_, case_);
      c.ctx.restore();
      if (p >= 1) {
        texteMeme(c.ctx, "ASSUME.", c.W / 2, c.H * BAS, Math.round(c.W * 0.1), c.W * SUR, { base: "bottom" });
      }
    }
    if (!e.actif && c.t < 3) aideBas(c, "Souriez…");
  },
};

export const LENTILLES: Lentille<any>[] = [arret, zoom, boom, random, pensees, pnj, mensonge, laser, caricature, doubleBouche, lunettes]; // eslint-disable-line @typescript-eslint/no-explicit-any
export const parCle = (cle: string) => LENTILLES.find((l) => l.cle === cle) ?? null;
