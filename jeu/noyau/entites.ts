import { boiteDe, type Combattant } from "./combattant";
import { chevauche, deplacementX, deplacementY, horsDe, type Boite } from "./collisions";
import { finirCoup } from "./coups";
import type { EntiteDef } from "./definitions";
import { emettre } from "./evenements";
import type { Monde } from "./monde";

/*
 * Entités : projectiles, zones, pièges, grappins… Tout leur comportement
 * vient de leur définition (EntiteDef) ; ce module l'applique, sans
 * jamais connaître une entité par son nom.
 */

/** Vitesse de chute maximale d'une entité soumise à la gravité. */
const CHUTE_MAX = 2400;
/** Petit bond donné au lanceur quand son grappin l'a amené à destination. */
const BOND_GRAPPIN = 900;

export type Entite = {
  /** Identifiant unique dans la partie. */
  id: number;
  /** Place du lanceur. */
  proprio: number;
  /** Clé de la définition dans le personnage du lanceur. */
  def: string;
  /** Centre de la boîte. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  orientation: 1 | -1;
  age: number;
  rebonds: number;
  touchesFaites: number;
  /** Places déjà touchées (remises à zéro à chaque période pour une zone). */
  touches: number[];
  /** Coup du lanceur qui l'a créée (numéro d'exécution) : un grappin en dépend. */
  instance: number;
  /** Décalage par rapport au lanceur (entités attachées). */
  ox: number;
  oy: number;
  accroche: boolean;
  detruite: boolean;
};

export function definitionDe(monde: Monde, e: Entite): EntiteDef {
  const def = monde.combattants[e.proprio]?.perso.entites?.[e.def];
  if (!def) throw new Error(`entité inconnue : ${e.def}`);
  return def;
}

export function boiteEntite(e: { x: number; y: number }, def: EntiteDef): Boite {
  const gauche = e.x - Math.trunc(def.l / 2);
  const haut = e.y - Math.trunc(def.h / 2);
  return { gauche, haut, droite: gauche + def.l, bas: haut + def.h };
}

/** Crée l'entité `id` du personnage de `c`, en (x devant, y au-dessus de ses pieds). */
export function creerEntite(monde: Monde, c: Combattant, id: string, x: number, y: number, orientation: 1 | -1 = c.orientation): Entite {
  const def = c.perso.entites?.[id];
  if (!def) throw new Error(`${c.perso.id} : entité inconnue « ${id} »`);
  if (def.max) {
    const miennes = monde.entites.filter((e) => e.proprio === c.id && e.def === id && !e.detruite);
    for (let i = 0; i <= miennes.length - def.max; i++) detruire(monde, miennes[i], false);
  }
  // Une entité qui heurte les murs naît au niveau de son lanceur et glisse
  // jusqu'à son point d'apparition : lancée à bout portant, elle s'arrête
  // contre le mur au lieu d'apparaître dedans (et de le traverser).
  let dx = orientation * x;
  if ((def.solides ?? "traverser") !== "traverser" && !def.suitLanceur && dx !== 0) {
    const depart = boiteEntite({ x: c.x, y: c.y - y }, def);
    dx = deplacementX(depart, dx, monde.carte.solides);
  }
  const e: Entite = {
    id: monde.prochaineEntite++,
    proprio: c.id,
    def: id,
    x: c.x + dx,
    y: c.y - y,
    vx: orientation * (def.vx ?? 0),
    vy: def.vy ?? 0,
    orientation,
    age: 0,
    rebonds: 0,
    touchesFaites: 0,
    touches: [],
    instance: c.instance,
    ox: dx,
    oy: -y,
    accroche: false,
    detruite: false,
  };
  monde.entites.push(e);
  emettre(monde, { type: "apparition", source: c.id, x: e.x, y: e.y, valeur: e.id, cle: id });
  return e;
}

/** Fait disparaître l'entité ; `suite` : déclencher sa fin (surFin). */
export function detruire(monde: Monde, e: Entite, suite = true): void {
  if (e.detruite) return;
  e.detruite = true;
  emettre(monde, { type: "disparition", source: e.proprio, x: e.x, y: e.y, valeur: e.id, cle: e.def });
  const def = definitionDe(monde, e);
  const proprio = monde.combattants[e.proprio];
  // Un grappin qui disparaît sans avoir accroché laisse son lanceur retomber.
  if (def.grappin && !e.accroche && proprio.instance === e.instance && proprio.coup !== null) finirCoup(proprio);
  if (suite && def.surFin) {
    creerEntite(monde, proprio, def.surFin, (e.x - proprio.x) * e.orientation, proprio.y - e.y, e.orientation);
  }
}

/** Déplace un combattant vers (x, y) d'au plus `pas`, bloqué par les solides. Renvoie la distance restante. */
function tirer(monde: Monde, c: Combattant, x: number, y: number, pas: number): number {
  const dx = x - c.x;
  const dy = y - c.y;
  const d = Math.hypot(dx, dy);
  if (d <= pas) return 0;
  const mx = Math.trunc((dx * pas) / d);
  const my = Math.trunc((dy * pas) / d);
  const b = boiteDe(c);
  const ax = deplacementX(b, mx, monde.carte.solides);
  c.x += ax;
  b.gauche += ax;
  b.droite += ax;
  c.y += deplacementY(b, my, monde.carte.solides);
  return d - pas;
}

function adversaires(monde: Monde, e: Entite): Combattant[] {
  return monde.combattants.filter((c) => c.id !== e.proprio && !c.ko && !c.horsJeu);
}

function deplacer(monde: Monde, e: Entite, def: EntiteDef): void {
  if (def.suitLanceur) {
    const p = monde.combattants[e.proprio];
    e.x = p.x + e.ox;
    e.y = p.y + e.oy;
    return;
  }
  if (e.accroche) return;
  if (def.gravite) e.vy = Math.min(e.vy + def.gravite, CHUTE_MAX);
  const mode = def.solides ?? "traverser";
  if (mode === "traverser" && !def.grappin) {
    e.x += e.vx;
    e.y += e.vy;
    return;
  }
  const b = boiteEntite(e, def);
  const dx = deplacementX(b, e.vx, monde.carte.solides);
  const contactX = dx !== e.vx;
  e.x += dx;
  b.gauche += dx;
  b.droite += dx;
  // Les objets posés (pièges) tiennent aussi sur les plateformes.
  const plateformes = mode === "arreter" ? monde.carte.plateformes : [];
  const dy = deplacementY(b, e.vy, monde.carte.solides, plateformes);
  const contactY = dy !== e.vy;
  e.y += dy;
  if (!contactX && !contactY) return;

  if (def.grappin) {
    e.accroche = true;
    e.vx = e.vy = 0;
    return;
  }
  switch (mode) {
    case "arreter":
      if (contactX) e.vx = 0;
      if (contactY) e.vy = 0;
      break;
    case "rebondir":
      if (contactX) e.vx = -e.vx;
      if (contactY) e.vy = -Math.trunc((e.vy * 750) / 1000);
      if (contactX && e.vx !== 0) e.orientation = e.vx > 0 ? 1 : -1;
      if (++e.rebonds > (def.rebonds ?? 0)) detruire(monde, e);
      break;
    case "detruire":
      detruire(monde, e);
      break;
  }
}

/** Un tick pour toutes les entités (avant la résolution des coups). */
export function avancerEntites(monde: Monde): void {
  for (const e of monde.entites) {
    if (e.detruite) continue;
    const def = definitionDe(monde, e);
    const proprio = monde.combattants[e.proprio];
    e.age++;
    if (def.periode && e.age % def.periode === 0) e.touches = [];

    deplacer(monde, e, def);
    if (e.detruite) continue;

    if (def.grappin && e.accroche) {
      // Le lanceur est tiré tant que son coup dure ; interrompu, il lâche prise.
      if (proprio.instance !== e.instance || proprio.coup === null || proprio.ko) {
        detruire(monde, e, false);
        continue;
      }
      if (tirer(monde, proprio, e.x, e.y + proprio.perso.stats.hauteur / 2, def.grappin.vitesse) === 0) {
        finirCoup(proprio);
        proprio.vx = 0;
        proprio.vy = -BOND_GRAPPIN;
        detruire(monde, e, false);
        continue;
      }
    }

    if (def.declencheur && e.age >= def.declencheur.armement) {
      const r = def.declencheur.rayon;
      const proche = adversaires(monde, e).find((c) => Math.hypot(c.x - e.x, c.y - proprio.perso.stats.hauteur / 2 - e.y) <= r
        || chevauche(boiteDe(c), boiteEntite(e, def)));
      if (proche) {
        emettre(monde, { type: "declenchement", source: e.proprio, cible: proche.id, x: e.x, y: e.y, cle: e.def });
        detruire(monde, e);
        continue;
      }
    }

    if (def.attraction) {
      for (const c of adversaires(monde, e)) {
        if (c.invulnerable > 0) continue;
        const cy = c.y - c.perso.stats.hauteur / 2;
        if (Math.hypot(c.x - e.x, cy - e.y) <= def.attraction.rayon) tirer(monde, c, e.x, c.y + (e.y - cy), def.attraction.force);
      }
    }

    if (def.bouclier) {
      const b = boiteEntite(e, def);
      for (const autre of monde.entites) {
        if (autre.detruite || autre.proprio === e.proprio) continue;
        const d = definitionDe(monde, autre);
        if (!d.touche || d.bouclier || (autre.vx === 0 && autre.vy === 0)) continue;
        if (chevauche(b, boiteEntite(autre, d))) detruire(monde, autre);
      }
    }

    if (e.age >= def.duree) detruire(monde, e);
    else if (horsDe(boiteEntite(e, def), monde.carte.zoneVie)) detruire(monde, e, false);
  }
}

/** Retire les entités détruites (fin de tick). */
export function nettoyerEntites(monde: Monde): void {
  if (monde.entites.some((e) => e.detruite)) monde.entites = monde.entites.filter((e) => !e.detruite);
}
