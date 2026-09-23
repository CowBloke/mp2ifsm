import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TOUS_LES_PERSOS } from "../noyau/contenu";

/*
 * Frontières du code du jeu, vérifiées sur les sources :
 *
 *  - jeu/noyau ne dépend de rien d'extérieur (ni React, ni DOM, ni Pixi,
 *    ni Node) : il doit tourner à l'identique sur le serveur, dans le
 *    navigateur et dans ces tests ;
 *  - le client et le serveur ne s'importent pas l'un l'autre ;
 *  - le site n'entre dans le jeu que par @jeu/client.
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function sources(dossier: string): string[] {
  return (readdirSync(join(RACINE, dossier), { recursive: true }) as string[])
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => join(RACINE, dossier, f));
}

function sansCommentaires(code: string): string {
  // Les « // » précédés de « : » sont des URL (http://…), pas des commentaires.
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function imports(fichier: string): string[] {
  const code = sansCommentaires(readFileSync(fichier, "utf8"));
  return [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)].map((m) => m[1]);
}

/** Dossier de premier niveau visé par un import relatif, ex. "jeu/noyau". */
function cible(fichier: string, specificateur: string): string {
  return relative(RACINE, resolve(dirname(fichier), specificateur));
}

test("jeu/noyau n'importe que jeu/noyau", () => {
  for (const f of sources("jeu/noyau")) {
    for (const i of imports(f)) {
      assert.ok(i.startsWith("."), `${relative(RACINE, f)} importe « ${i} »`);
      assert.ok(cible(f, i).startsWith("jeu/noyau/"), `${relative(RACINE, f)} sort du noyau : « ${i} »`);
    }
  }
});

test("jeu/noyau n'utilise ni le navigateur, ni Node, ni le temps réel, ni le hasard", () => {
  const interdits = /\b(window|document|navigator|globalThis|process|require|performance|setTimeout|setInterval|requestAnimationFrame)\b|Math\.random|Date\.now|new Date\b/;
  for (const f of sources("jeu/noyau")) {
    const trouve = sansCommentaires(readFileSync(f, "utf8")).match(interdits);
    assert.equal(trouve, null, `${relative(RACINE, f)} utilise « ${trouve?.[0]} »`);
  }
});

test("le moteur ne connaît aucun personnage : tout passe par les données", () => {
  const ids = TOUS_LES_PERSOS.map((p) => p.id);
  for (const f of sources("jeu/noyau").filter((f) => !f.includes("/contenu/"))) {
    const code = sansCommentaires(readFileSync(f, "utf8"));
    for (const id of ids) {
      assert.ok(!code.includes(`"${id}"`), `${relative(RACINE, f)} cite le personnage « ${id} »`);
    }
  }
});

test("le client et le serveur de jeu ne s'importent pas l'un l'autre, ni le site", () => {
  for (const [dossier, interdit] of [["jeu/client", "jeu/serveur"], ["jeu/serveur", "jeu/client"]]) {
    for (const f of sources(dossier)) {
      for (const i of imports(f)) {
        assert.ok(!i.startsWith("@/") && !i.startsWith("@jeu/"), `${relative(RACINE, f)} importe « ${i} »`);
        if (i.startsWith(".")) {
          const c = cible(f, i);
          assert.ok(!c.startsWith(interdit) && !c.startsWith("src/"), `${relative(RACINE, f)} importe « ${i} »`);
        }
      }
    }
  }
});

test("jeu/protocole ne dépend que du noyau", () => {
  for (const f of sources("jeu/protocole")) {
    for (const i of imports(f)) {
      assert.ok(i.startsWith("."), `${relative(RACINE, f)} importe « ${i} »`);
      const c = cible(f, i);
      assert.ok(c.startsWith("jeu/protocole/") || c.startsWith("jeu/noyau/"), `${relative(RACINE, f)} importe « ${i} »`);
    }
  }
});

test("le site n'entre dans le jeu que par @jeu/client (et la signature des tickets)", () => {
  const permis = ["@jeu/client", "@jeu/protocole/ticket"];
  for (const f of sources("src")) {
    for (const i of imports(f)) {
      if (i.startsWith("@jeu/")) assert.ok(permis.includes(i), `${relative(RACINE, f)} importe « ${i} »`);
      if (i.startsWith(".")) assert.ok(!cible(f, i).startsWith("jeu/"), `${relative(RACINE, f)} importe « ${i} »`);
    }
  }
});

/** Imports chargés avec le module (ni « import type », ni import() dynamique). */
function importsStatiques(fichier: string): string[] {
  const code = sansCommentaires(readFileSync(fichier, "utf8"));
  const res: string[] = [];
  for (const m of code.matchAll(/^\s*(?:import|export)\s+(type\s+)?[^;]*?\bfrom\s*["']([^"']+)["']/gm)) if (!m[1]) res.push(m[2]);
  for (const m of code.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) res.push(m[1]);
  return res;
}

function resoudre(depuis: string, specificateur: string): string {
  const base = resolve(dirname(depuis), specificateur);
  for (const f of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (/\.tsx?$/.test(f) && existsSync(f)) return f;
  throw new Error(`${relative(RACINE, depuis)} : import introuvable « ${specificateur} »`);
}

test("@jeu/client reste léger : Pixi n'est chargé qu'à l'affichage d'une partie", () => {
  const vus = new Set<string>();
  const pile: [string, string[]][] = [[join(RACINE, "jeu/client/index.ts"), []]];
  while (pile.length > 0) {
    const [f, chemin] = pile.pop()!;
    if (vus.has(f)) continue;
    vus.add(f);
    const ici = [...chemin, relative(RACINE, f)];
    for (const i of importsStatiques(f)) {
      assert.ok(!/^pixi\.js(\/|$)/.test(i), `Pixi importé statiquement depuis la page : ${ici.join(" → ")}`);
      if (i.startsWith(".")) pile.push([resoudre(f, i), ici]);
    }
  }
  assert.ok(vus.size > 5, "le graphe d'imports a bien été parcouru");
});
