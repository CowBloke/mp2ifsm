import { Container, Graphics, Text, type Application } from "pixi.js";
import type { Carte } from "../../noyau/carte";
import { boiteDe } from "../../noyau/combattant";
import { SOUS_PIXELS } from "../../noyau/constantes";
import { boiteHitbox, hitboxesActives } from "../../noyau/coups";
import type { Monde } from "../../noyau/monde";
import { DUREE_FIN_MANCHE } from "../../noyau/regles";
import { cadrerGroupe, lisser, suivreCible, type Camera } from "../camera";
import type { VueJeu } from "../session-locale";
import { creerVueCombattant, type ContexteEffets, type VueCombattant } from "./combattants";
import { couleurPlace } from "./couleurs";
import { creerRenduEntites } from "./entites";
import { creerDecor, placerDecor, type Decor } from "./decor";
import { creerEffets } from "./effets";
import { creerHud } from "./hud";
import { creerTextes } from "./textes";
import { creerTrainees } from "./trainees";
import { PREFERENCES_DEFAUT, type PreferencesJeu } from "../reglages";
import { creerSons } from "../son/sons";

/*
 * Scène du jeu : couches du monde (décor, emblèmes, traînées,
 * combattants, effets, textes), caméra et interface. Elle ne fait que
 * LIRE la vue fournie par la session ; elle ne modifie jamais la
 * simulation.
 */

/** Hauteur de monde visible pour un joueur, en pixels : fixe le zoom. */
const VUE_HAUTEUR = 780;
/** Spectateur : marges autour des combattants cadrés, en part de la hauteur de vue d'un joueur (le plan le plus serré). */
const MARGES_SPECTATEUR = { x: 0.5, y: 0.36 };

/** Durée des fondus entre manches, en ticks. */
const FONDU = 24;

/** Opacité du voile noir : la fin d'une manche qui en appelle une autre s'assombrit, la suivante s'éclaire. */
function opaciteTransition(m: Monde): number {
  if (m.phase === "decompte") return Math.max(0, 1 - m.phaseTicks / FONDU);
  if (m.phase !== "finManche") return 0;
  const derniere = m.combattants.some((c) => c.victoires >= m.reglages.manchesGagnantes) || m.manche >= m.reglages.manchesMax;
  return derniere ? 0 : Math.max(0, (m.phaseTicks - (DUREE_FIN_MANCHE - FONDU)) / FONDU);
}

/** Taille de l'interface : elle grandit avec l'écran, davantage pour un spectateur (projecteur). */
function echelleInterface(hauteur: number, spectateur: boolean): number {
  // Un téléphone à l'horizontale (≈ 390 px de haut) garde une interface compacte.
  return spectateur ? Math.max(1, Math.min(2.4, hauteur / 640)) : Math.max(0.72, Math.min(2, hauteur / 760));
}
const px = (u: number) => u / SOUS_PIXELS;

export type Scene = {
  dessiner(vue: VueJeu, noms: readonly string[], dtMs: number): void;
  basculerDebug(): void;
  preferences(p: PreferencesJeu): void;
  /** Largeur (px d'écran) à laisser libre de chaque côté en bas : commandes tactiles. */
  reserverBas(px: number): void;
  detruire(): void;
};

/** Scène sans interface ni son, cadrée de plus près : l'aperçu des menus. */
export type OptionsScene = { interface: boolean; sons: boolean; vueHauteur: number };

export const SCENE_JEU: OptionsScene = { interface: true, sons: true, vueHauteur: VUE_HAUTEUR };

export function creerScene(app: Application, options: OptionsScene = SCENE_JEU): Scene {
  const monde = new Container();
  const coucheDecor = new Container();
  const coucheArriere = new Container();
  const trainees = creerTrainees();
  const coucheEntites = new Container();
  const coucheCombattants = new Container();
  const coucheEffets = new Container();
  const coucheTextes = new Container();
  const debug = new Graphics();
  monde.addChild(coucheDecor, coucheArriere, coucheEntites, trainees.graphics, coucheCombattants, coucheEffets, coucheTextes, debug);
  const ecran = new Container();
  app.stage.addChild(monde, ecran);
  const entites = creerRenduEntites(coucheEntites);

  // Mise en scène de cinéma (ultimes) : bandes noires et titre.
  const bandes = new Graphics();
  const titre = new Text({
    text: "",
    style: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 44, fontWeight: "700", fill: 0xf4ecd8, letterSpacing: 10 },
  });
  titre.anchor.set(0.5);
  const coucheHud = new Container();
  // Voile noir des transitions entre manches, sous l'interface.
  const voile = new Graphics();
  ecran.addChild(voile, bandes, titre, coucheHud);
  let cinema = 0;
  let texteCinema = "";

  const effets = creerEffets(coucheEffets);
  const textes = creerTextes(coucheTextes);
  const ctx: ContexteEffets = { monde, arriere: coucheArriere, textes, trainees, effets };
  const hud = creerHud(coucheHud);
  const sons = options.sons ? creerSons() : null;
  coucheHud.visible = options.interface;
  let prefs: PreferencesJeu = { ...PREFERENCES_DEFAUT };
  let reserve = 0;
  const camera: Camera = { x: 0, y: 0 };
  let hauteurVue = 0;
  let carte: Carte | null = null;
  let decor: Decor | null = null;
  let temps = 0;
  let vues: VueCombattant[] = [];
  let signature = "";
  let premiere = true;
  let afficherDebug = false;

  function reconstruire(vue: VueJeu, noms: readonly string[]) {
    const m = vue.monde;
    if (m.carte !== carte) {
      coucheDecor.removeChildren().forEach((c) => c.destroy({ children: true }));
      decor = creerDecor(m.carte);
      coucheDecor.addChild(decor.conteneur);
      carte = m.carte;
      premiere = true;
    }
    const s = m.combattants.map((c) => c.perso.id).join() + "|" + noms.join() + "|" + vue.local;
    if (s === signature) return;
    for (const v of vues) {
      coucheCombattants.removeChild(v.conteneur);
      v.detruire();
    }
    // Deux exemplaires du même personnage : palettes différentes.
    vues = m.combattants.map((c, i) => {
      const variante = m.combattants.slice(0, i).filter((o) => o.perso.id === c.perso.id).length;
      return creerVueCombattant(c, variante, couleurPlace(i), noms[i] ?? `J${i + 1}`, ctx);
    });
    // Le joueur local passe devant les autres.
    vues.forEach((v, i) => { if (i !== vue.local) coucheCombattants.addChild(v.conteneur); });
    if (vues[vue.local]) coucheCombattants.addChild(vues[vue.local].conteneur);
    signature = s;
  }

  return {
    basculerDebug() {
      afficherDebug = !afficherDebug;
    },

    reserverBas(px) {
      reserve = px;
    },

    preferences(p) {
      prefs = { ...p };
      sons?.volume(p.volume);
    },

    detruire() {
      sons?.detruire();
    },

    dessiner(vue, noms, dtMs) {
      const m = vue.monde;
      temps += dtMs;
      reconstruire(vue, noms);

      for (const e of vue.evenements) {
        const source = m.combattants[e.source];
        const vueSource = vues[e.source];
        switch (e.type) {
          case "touche":
          case "armure":
            effets.etincelles(px(e.x), px(e.y), source?.orientation ?? 1, e.valeur, vueSource?.apparence.etincelles ?? couleurPlace(e.source));
            effets.secousse(Math.min(16, 2 + e.valeur / 9));
            vues[e.cible]?.flash();
            vueSource?.touche(e);
            break;
          case "ko":
            effets.etincelles(px(e.x), px(e.y), source?.orientation ?? 1, 220, 0xffffff);
            effets.secousse(22);
            break;
          case "contre":
            effets.etincelles(px(e.x), px(e.y), -(m.combattants[e.cible]?.orientation ?? 1), 120, 0xffd166);
            effets.secousse(8);
            vueSource?.contre(e);
            break;
          case "atterrissage":
            if (e.valeur > 1500) effets.poussiere(px(e.x), px(e.y), 6);
            break;
          case "dash":
            effets.poussiere(px(e.x), px(e.y), 4);
            break;
          case "saut":
            if (e.valeur === 1) effets.poussiere(px(e.x), px(e.y), 3);
            break;
        }
      }

      m.combattants.forEach((c, i) => {
        const p = vue.positions[i] ?? c;
        vues[i]?.maj(c, m, px(p.x), px(p.y), vue.alpha, dtMs);
      });
      entites.maj(m, vue.positionsEntites, vues.map((v) => v.main()), vue.alpha, dtMs);
      effets.maj(dtMs);
      trainees.maj(dtMs);
      textes.maj(dtMs);

      // Caméra : sur le joueur local, ou toute l'arène pour un spectateur.
      const largeur = app.screen.width;
      const hauteur = app.screen.height;
      const l = m.carte.limites;
      const limites = { gauche: px(l.gauche), haut: px(l.haut), droite: px(l.droite), bas: px(l.bas) };
      let echelle: number;
      let cx: number;
      let cy: number;
      const local = m.combattants[vue.local];
      if (local) {
        echelle = hauteur / options.vueHauteur;
        const p = vue.positions[vue.local];
        cx = px(p.x);
        cy = px(p.y - local.perso.stats.hauteur / 2);
      } else {
        // Spectateur : le plan suit le groupe, et zoome selon son étendue.
        const points = m.combattants.flatMap((c, i) => {
          if (c.horsJeu) return [];
          const p = vue.positions[i] ?? c;
          return [{ x: px(p.x), y: px(p.y - c.perso.stats.hauteur / 2) }];
        });
        const cadre = cadrerGroupe(points, largeur / hauteur, limites, {
          margeX: MARGES_SPECTATEUR.x * options.vueHauteur, margeY: MARGES_SPECTATEUR.y * options.vueHauteur, hauteurMin: options.vueHauteur,
        });
        hauteurVue = premiere ? cadre.hauteurVue : lisser(hauteurVue, cadre.hauteurVue, dtMs, 450);
        echelle = hauteur / hauteurVue;
        cx = cadre.x;
        cy = cadre.y;
      }
      suivreCible(camera, cx, cy, premiere ? Infinity : dtMs, largeur / echelle, hauteur / echelle, limites);
      premiere = false;
      const d = prefs.secousses ? effets.decalage() : { x: 0, y: 0 };
      monde.scale.set(echelle);
      monde.position.set(largeur / 2 - camera.x * echelle + d.x, hauteur / 2 - camera.y * echelle + d.y);
      if (decor) {
        placerDecor(decor, camera.x, camera.y);
        decor.animer(temps);
      }
      sons?.maj(m, vue.evenements, { x: camera.x, demiLargeur: largeur / echelle / 2 }, vue.local);

      // Boîtes de collision et de coups (touche H).
      debug.clear();
      if (afficherDebug) {
        for (const c of m.combattants) {
          if (c.horsJeu) continue;
          const b = boiteDe(c);
          debug.rect(px(b.gauche), px(b.haut), px(b.droite - b.gauche), px(b.bas - b.haut))
            .stroke({ width: 2, color: 0x3ddc84 });
          for (const hb of hitboxesActives(c)) {
            const h = boiteHitbox(c, hb);
            debug.rect(px(h.gauche), px(h.haut), px(h.droite - h.gauche), px(h.bas - h.haut))
              .fill({ color: 0xff3b3b, alpha: 0.35 }).stroke({ width: 2, color: 0xff3b3b });
          }
        }
        const z = m.carte.zoneVie;
        debug.rect(px(z.gauche), px(z.haut), px(z.droite - z.gauche), px(z.bas - z.haut))
          .stroke({ width: 4, color: 0xff3b3b, alpha: 0.5 });
      }

      const k = echelleInterface(hauteur, !local);
      coucheHud.scale.set(k);
      if (options.interface) {
        hud.resolution(k * app.renderer.resolution);
        hud.maj(m, noms, largeur / k, hauteur / k, dtMs, reserve / k);
      }

      // Entre deux manches : fondu au noir, puis retour sur l'arène.
      const noir = opaciteTransition(m);
      voile.clear();
      if (noir > 0) voile.rect(0, 0, largeur, hauteur).fill({ color: 0x000000, alpha: noir });

      // Cinéma : les bandes entrent quand un coup le demande, et ressortent.
      const scene = m.combattants.map((c, i) => (c.coup !== null ? vues[i]?.apparence.effets[c.coup]?.cinema : undefined)).find(Boolean);
      if (scene) texteCinema = scene;
      cinema = Math.max(0, Math.min(1, cinema + (scene ? dtMs / 250 : -dtMs / 350)));
      // Le titre s'inscrit dans la bande du bas : les cartouches s'effacent le temps de la scène.
      hud.voiler(cinema);
      bandes.clear();
      titre.visible = cinema > 0.6;
      if (cinema > 0) {
        const h = hauteur * 0.13 * (1 - (1 - cinema) ** 3);
        bandes.rect(0, 0, largeur, h).fill(0x000000).rect(0, hauteur - h, largeur, h).fill(0x000000);
        titre.text = texteCinema;
        titre.alpha = (cinema - 0.6) / 0.4;
        titre.position.set(largeur / 2, hauteur - h / 2);
        titre.scale.set(Math.min(1, (h * 0.8) / 44));
      }
    },
  };
}
