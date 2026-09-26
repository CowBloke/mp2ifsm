import { test } from "node:test";
import assert from "node:assert/strict";
import { creerBot, NIVEAUX_BOT, type Controleur } from "../noyau/bots/bot";
import { CARTES, PERSOS, PERSOS_ENTRAINEMENT } from "../noyau/contenu";
import { TOUTES } from "../noyau/entrees";
import { avancerMonde, creerMonde, empreinteMonde, type Monde } from "../noyau/monde";
import { REGLAGES_STANDARD, type Reglages } from "../noyau/regles";

/*
 * Bots : ils doivent jouer (frapper, revenir sur la scène), aller au bout
 * d'une partie, être parfaitement reproductibles à graine égale, et un
 * niveau plus élevé doit gagner plus souvent.
 */

const CORBICEPS = PERSOS[0];
const MANNEQUIN = PERSOS_ENTRAINEMENT[0];

/** Joue jusqu'à la fin de la partie (ou `max` ticks) ; entrées vérifiées à chaque tick. */
function jouer(m: Monde, controleurs: (Controleur | null)[], max = 30_000): { touches: number; chutes: number } {
  let touches = 0;
  let chutes = 0;
  while (m.phase !== "finPartie" && m.tick < max) {
    const entrees = m.combattants.map((c) => {
      const e = controleurs[c.id]?.(m, c.id) ?? 0;
      assert.equal(e & ~TOUTES, 0, "entrée hors des bits valides");
      return e;
    });
    avancerMonde(m, entrees);
    for (const e of m.evenements) {
      if (e.type === "touche") touches++;
      if (e.type === "chute") chutes++;
    }
  }
  return { touches, chutes };
}

function duelBots(niveaux: [number, number], graine: number, reglages: Reglages = REGLAGES_STANDARD) {
  const m = creerMonde(CARTES[0], [CORBICEPS, CORBICEPS], reglages);
  const bots = niveaux.map((n, i) => creerBot(n, graine * 7 + i));
  const bilan = jouer(m, bots);
  return { m, ...bilan };
}

test("deux bots vont au bout d'une partie en se frappant, sans entrée invalide", () => {
  const { m, touches } = duelBots([1, 1], 1);
  assert.equal(m.phase, "finPartie");
  assert.ok(touches > 20, `${touches} coups portés`);
});

test("à graine égale, une partie de bots se rejoue à l'identique", () => {
  const a = duelBots([2, 1], 42);
  const b = duelBots([2, 1], 42);
  assert.equal(empreinteMonde(a.m), empreinteMonde(b.m));
  assert.equal(a.m.tick, b.m.tick);
  const c = duelBots([2, 1], 43);
  assert.notEqual(empreinteMonde(c.m), empreinteMonde(a.m), "une autre graine, une autre partie");
});

for (let niveau = 0; niveau < NIVEAUX_BOT.length; niveau++) {
  test(`bot niveau ${niveau} : il va chercher le mannequin et le frappe`, () => {
    const m = creerMonde(CARTES[0], [CORBICEPS, MANNEQUIN], { ...REGLAGES_STANDARD, dureeDecompte: 0 });
    const bot = creerBot(niveau, 5);
    for (let t = 0; t < 600; t++) avancerMonde(m, [bot(m, 0), 0]);
    assert.ok(m.combattants[1].pv < MANNEQUIN.stats.pv, `aucun dégât en 10 s (niveau ${niveau})`);
  });
}

test("jeté hors de l'arène, un bot revient sur la scène au lieu de tomber", () => {
  const carte = CARTES[0];
  const bord = Math.max(...carte.solides.map((s) => s.droite));
  const sol = carte.solides[0].haut;
  let reussites = 0;
  for (let essai = 0; essai < 8; essai++) {
    const m = creerMonde(carte, [CORBICEPS, MANNEQUIN], { ...REGLAGES_STANDARD, dureeDecompte: 0 });
    const [c] = m.combattants;
    // Projeté loin du bord, un peu sous le niveau du plateau, doubles sauts disponibles.
    c.x = bord + 20_000 + essai * 2000;
    c.y = sol + 3000;
    c.vx = 1200;
    c.vy = 400;
    const bot = creerBot(1 + (essai % 3), essai + 1);
    let chute = false;
    for (let t = 0; t < 400 && !c.auSol; t++) {
      avancerMonde(m, [bot(m, 0), 0]);
      if (m.evenements.some((e) => e.type === "chute")) chute = true;
    }
    if (c.auSol && !chute) reussites++;
  }
  assert.ok(reussites >= 7, `${reussites}/8 retours sur la scène`);
});

test("un bot expert bat un bot facile la plupart du temps", () => {
  let victoires = 0;
  const parties = 8;
  for (let i = 0; i < parties; i++) {
    // Places alternées : aucun avantage de position.
    const expertEnPremier = i % 2 === 0;
    const { m } = duelBots(expertEnPremier ? [3, 0] : [0, 3], 100 + i);
    const expert = expertEnPremier ? 0 : 1;
    if (m.vainqueur === expert) victoires++;
  }
  assert.ok(victoires >= 6, `l'expert gagne ${victoires}/${parties}`);
});

test("quatre bots sur la même carte : une partie complète, rapide à simuler", () => {
  const m = creerMonde(CARTES[0], [CORBICEPS, CORBICEPS, CORBICEPS, CORBICEPS], REGLAGES_STANDARD);
  const bots = [0, 1, 2, 3].map((n) => creerBot(n, 9 + n));
  const debut = performance.now();
  const { touches } = jouer(m, bots, 40_000);
  const ms = performance.now() - debut;
  assert.equal(m.phase, "finPartie");
  assert.ok(touches > 30);
  console.log(`  partie à 4 bots : ${m.tick} ticks en ${Math.round(ms)} ms (${((ms / m.tick) * 1000).toFixed(1)} µs par tick)`);
  assert.ok(ms / m.tick < 1, "moins d'une milliseconde par tick, bots compris");
});
