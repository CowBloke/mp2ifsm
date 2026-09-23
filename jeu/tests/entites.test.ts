import { test } from "node:test";
import assert from "node:assert/strict";
import type { CoupDef, EntiteDef } from "../noyau/definitions";
import { ATTAQUE, SPECIAL } from "../noyau/entrees";
import { DUREE_FIN_MANCHE } from "../noyau/regles";
import { SOL, STATS, carte, frappeTest, jouer, monde, perso } from "./outils";

/*
 * Entités génériques : chaque comportement (projectile, rebond, zone,
 * piège, attraction, grappin, bouclier…) vient de la seule définition.
 * A lance depuis 0 vers la droite ; B l'attend en 8000 ou plus loin.
 */

const TOUCHE = { degats: 50, recul: 1000, angle: 0, hitstun: 20 };

function lanceur(entites: Record<string, EntiteDef>, coups: Record<string, CoupDef> = {}) {
  return perso({
    special_neutre: { duree: 20, entites: [{ frame: 2, id: "p", x: 3000, y: 4000 }] },
    ...coups,
  }, {}) as ReturnType<typeof perso> & { entites?: Record<string, EntiteDef> };
}

function duel(entites: Record<string, EntiteDef>, options: { coups?: Record<string, CoupDef>; xB?: number; coupsB?: Record<string, CoupDef>; solides?: ReturnType<typeof carte>["solides"] } = {}) {
  const a = { ...lanceur(entites, options.coups), entites };
  const c = carte({
    apparitions: [{ x: 0, y: SOL }, { x: options.xB ?? 40_000, y: SOL }],
    ...(options.solides ? { solides: [...carte().solides, ...options.solides] } : {}),
  });
  const m = monde([a, perso(options.coupsB ?? {})], { carte: c });
  jouer(m);
  return { m, a: m.combattants[0], b: m.combattants[1] };
}

test("un projectile file droit, touche une fois dans son sens de marche, puis disparaît", () => {
  const { m, b } = duel({ p: { l: 2000, h: 2000, duree: 120, vx: 1500, touche: TOUCHE, touchesMax: 1 } });
  jouer(m, [SPECIAL, 0]);
  jouer(m, [0, 0], 2);
  assert.equal(m.entites.length, 1);
  const x0 = m.entites[0].x;
  jouer(m, [0, 0]);
  assert.equal(m.entites[0].x - x0, 1500);
  for (let t = 0; t < 60 && b.pv === STATS.pv; t++) jouer(m, [0, 0]);
  assert.equal(b.pv, STATS.pv - 50);
  assert.ok(b.vx > 0, "projeté dans le sens du projectile");
  jouer(m, [0, 0]);
  assert.equal(m.entites.length, 0, "détruit après sa touche");
});

test("détruit contre un mur, un projectile laisse place à son explosion, qui repousse vers l'extérieur", () => {
  const entites: Record<string, EntiteDef> = {
    p: { l: 2000, h: 2000, duree: 120, vx: 2000, solides: "detruire", surFin: "boum" },
    boum: { l: 30_000, h: 30_000, duree: 4, touche: { ...TOUCHE, degats: 80, radial: true } },
  };
  // Mur en 20 000 ; B de l'autre côté de l'explosion, en 30 000.
  const { m, b } = duel(entites, { xB: 30_000, solides: [{ gauche: 20_000, haut: 0, droite: 22_000, bas: SOL - 3000 }] });
  jouer(m, [SPECIAL, 0]);
  const cles: string[] = [];
  for (let t = 0; t < 40; t++) {
    jouer(m, [0, 0]);
    for (const e of m.evenements) if (e.type === "apparition") cles.push(e.cle);
  }
  assert.deepEqual(cles, ["p", "boum"]);
  assert.equal(b.pv, STATS.pv - 80);
  assert.ok(b.x > 30_000, "repoussé loin du centre de l'explosion");
});

test("lancé à bout portant contre un mur, un objet naît contre le mur, pas dedans", () => {
  // Point d'apparition en 8000, dans le mur [5000, 8000] : l'objet s'arrête en 4000, contre sa face.
  const { m } = duel({ p: { l: 2000, h: 2000, duree: 120, vx: 500, solides: "arreter" } }, {
    coups: { special_neutre: { duree: 20, entites: [{ frame: 2, id: "p", x: 8000, y: 4000 }] } },
    solides: [{ gauche: 5000, haut: 0, droite: 8000, bas: SOL - 1 }],
  });
  jouer(m, [SPECIAL, 0]);
  jouer(m, [0, 0], 2);
  assert.equal(m.entites.length, 1);
  assert.equal(m.entites[0].x, 4000);
  jouer(m, [0, 0], 30);
  assert.equal(m.entites[0].x, 4000, "le mur le retient");
});

test("un ballon rebondit sur le sol autant de fois que permis", () => {
  const { m } = duel({ p: { l: 2000, h: 2000, duree: 600, vx: 300, vy: 0, gravite: 200, solides: "rebondir", rebonds: 2 } });
  jouer(m, [SPECIAL, 0]);
  let rebonds = 0;
  let vivant = 0;
  for (let t = 0; t < 400; t++) {
    jouer(m, [0, 0]);
    if (m.entites[0]) {
      vivant = t;
      rebonds = m.entites[0].rebonds;
    }
  }
  assert.equal(rebonds, 2, "deux rebonds…");
  assert.ok(vivant < 399, "…puis il disparaît au troisième contact");
});

test("une zone blesse à chaque période sans interrompre, et pose son statut", () => {
  const zone: EntiteDef = { l: 20_000, h: 20_000, duree: 200, periode: 30, touche: { degats: 10, recul: 0, angle: 0, hitstun: 0, statut: "ralenti" } };
  const { m, b } = duel({ p: zone }, { xB: 5000, coupsB: { neutre: { duree: 300 } } });
  jouer(m, [SPECIAL, ATTAQUE]);
  jouer(m, [0, 0], 95);
  assert.equal(b.pv, STATS.pv - 40, "touché à l'apparition puis toutes les 30 ticks");
  assert.equal(b.coup, "neutre", "une égratignure n'interrompt pas");
  assert.ok(b.statuts.some((s) => s.id === "ralenti"));
});

test("un piège reste inerte pendant son armement, puis se déclenche au passage d'un adversaire", () => {
  const entites: Record<string, EntiteDef> = {
    p: { l: 3000, h: 1000, duree: 1000, gravite: 200, solides: "arreter", declencheur: { rayon: 6000, armement: 30 }, surFin: "piege" },
    piege: { l: 8000, h: 8000, duree: 3, touche: { degats: 30, recul: 0, angle: 0, hitstun: 0, statut: "etourdi" } },
  };
  const { m, b } = duel(entites, { coups: { special_neutre: { duree: 10, entites: [{ frame: 0, id: "p", x: 8000, y: 500 }] } } });
  b.x = 8000; // déjà dessus pendant l'armement
  jouer(m, [SPECIAL, 0]);
  jouer(m, [0, 0], 20);
  assert.equal(b.pv, STATS.pv, "pas encore armé");
  assert.equal(m.entites[0].vy, 0, "posé au sol");
  jouer(m, [0, 0], 15);
  assert.equal(b.pv, STATS.pv - 30, "déclenché");
  assert.ok(b.statuts.some((s) => s.id === "etourdi"));
});

test("une attraction tire les adversaires vers son centre", () => {
  const { m, b } = duel({ p: { l: 1000, h: 1000, duree: 60, attraction: { rayon: 50_000, force: 300 } } }, { xB: 30_000 });
  jouer(m, [SPECIAL, 0]);
  const x = b.x;
  jouer(m, [0, 0], 20);
  assert.ok(b.x < x - 3000, `attiré de ${x - b.x} unités`);
});

test("un grappin accroché tire son lanceur et termine son coup ; raté, il le laisse retomber", () => {
  const grappin: EntiteDef = { l: 1000, h: 1000, duree: 30, vx: 2500, vy: -2500, solides: "arreter", grappin: { vitesse: 2000 } };
  const coups = { special_haut: { duree: 60, mouvement: [{ de: 0, a: 59, vx: 0, vy: 0, gravite: 0 }], entites: [{ frame: 2, id: "p", x: 2000, y: 6000 }] } };
  // Plafond atteignable en haut à droite.
  const touche = duel({ p: grappin }, { coups, solides: [{ gauche: 5000, haut: 20_000 - 200_000, droite: 200_000, bas: SOL - 30_000 }] });
  const y0 = touche.a.y;
  jouer(touche.m, [SPECIAL | 4, 0]); // HAUT = 4
  for (let t = 0; t < 60 && touche.a.coup !== null; t++) jouer(touche.m, [0, 0]);
  assert.equal(touche.a.coup, null, "arrivé : le coup est fini");
  assert.ok(touche.a.y < y0 - 10_000, "tiré vers le haut");

  const rate = duel({ p: grappin }, { coups });
  jouer(rate.m, [SPECIAL | 4, 0]);
  jouer(rate.m, [0, 0], 33);
  assert.equal(rate.a.coup, null, "grappin perdu : le lanceur ne reste pas suspendu");
});

test("un bouclier anéantit les projectiles adverses", () => {
  const tir: EntiteDef = { l: 2000, h: 2000, duree: 120, vx: 1500, touche: TOUCHE, touchesMax: 1 };
  const mur: EntiteDef = { l: 2000, h: 20_000, duree: 200, bouclier: true };
  const b = { ...perso({ special_neutre: { duree: 10, entites: [{ frame: 0, id: "mur", x: 4000, y: 5000 }] } }), entites: { mur } };
  const a = { ...perso({ special_neutre: { duree: 20, entites: [{ frame: 2, id: "p", x: 3000, y: 4000 }] } }), entites: { p: tir } };
  const m = monde([a, b], { carte: carte({ apparitions: [{ x: 0, y: SOL }, { x: 40_000, y: SOL }] }) });
  jouer(m);
  jouer(m, [SPECIAL, SPECIAL]);
  jouer(m, [0, 0], 40);
  assert.equal(m.combattants[1].pv, STATS.pv, "le tir s'est brisé sur le mur");
});

test("au-delà du maximum par lanceur, le plus ancien exemplaire disparaît", () => {
  const { m } = duel({ p: { l: 1000, h: 1000, duree: 1000, max: 2 } }, { coups: { special_neutre: { duree: 4, entites: [{ frame: 0, id: "p", x: 0, y: 0 }] } } });
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) {
    jouer(m, [SPECIAL, 0]);
    ids.push(m.entites[m.entites.length - 1].id);
    jouer(m, [0, 0], 6);
  }
  assert.deepEqual(m.entites.map((e) => e.id), ids.slice(1));
});

test("un contre anéantit le projectile, sans dégât, et déclenche la riposte", () => {
  const coupsB = {
    special_neutre: { duree: 60, contre: { de: 0, a: 50, riposte: "riposte" } },
    riposte: { duree: 20, hitboxes: [frappeTest({ de: 50, a: 50 })] },
  };
  const { m, b } = duel({ p: { l: 2000, h: 2000, duree: 120, vx: 1500, touche: TOUCHE, touchesMax: 1 } }, { coupsB });
  jouer(m, [SPECIAL, SPECIAL]);
  for (let t = 0; t < 40 && b.coup !== "riposte"; t++) jouer(m, [0, 0]);
  assert.equal(b.coup, "riposte");
  assert.equal(b.pv, STATS.pv);
  jouer(m, [0, 0]);
  assert.equal(m.entites.length, 0);
});

test("une nouvelle manche efface toutes les entités", () => {
  const { m, b } = duel({ p: { l: 1000, h: 1000, duree: 10_000 } }, { coups: { special_neutre: { duree: 4, entites: [{ frame: 0, id: "p", x: 0, y: 0 }] } } });
  jouer(m, [SPECIAL, 0]);
  assert.equal(m.entites.length, 1);
  b.pv = 0;
  b.ko = true;
  jouer(m, [0, 0], DUREE_FIN_MANCHE + 2);
  assert.equal(m.manche, 2);
  assert.equal(m.entites.length, 0);
});
