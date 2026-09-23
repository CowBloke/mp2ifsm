import { NOMS_NIVEAUX } from "../noyau/bots/bot";
import { PERSOS } from "../noyau/contenu";
import { tournoi } from "./arene";

/*
 *   npm run jeu:equilibrage -- [niveau 0-3] [parties par duel]
 *
 * Tous les duels entre personnages jouables, joués par des bots. Repères :
 * chaque personnage entre 40 et 60 % au total, aucun duel au-delà de
 * 65/35, une partie de bots autour de 90 s.
 */

const niveau = Number(process.argv[2] ?? 3);
const parties = Number(process.argv[3] ?? 60);
const debut = performance.now();
const t = tournoi(PERSOS, { niveau, parties });
const pct = (x: number, n: number) => `${Math.round((100 * x) / n)} %`.padStart(5);

console.log(`Bots ${NOMS_NIVEAUX[niveau]?.toLowerCase() ?? niveau}, ${parties} parties par duel\n`);
for (const d of t.duels) console.log(`${d.a.padEnd(12)} contre ${d.b.padEnd(12)} ${pct(d.victoiresA, d.parties)}`);
console.log("");
for (const p of PERSOS) console.log(`${p.nom.padEnd(20)} ${pct(t.victoires[p.id] ?? 0, t.jouees[p.id] ?? 1)} des parties gagnées`);
console.log(`\nDurée moyenne d'une partie : ${Math.round(t.dureeMoyenneS)} s (calculé en ${((performance.now() - debut) / 1000).toFixed(1)} s)`);
