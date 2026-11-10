import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/*
 * Une route API ne doit jamais importer un module "use server" : Next.js
 * l'enregistrerait comme « worker » de ces actions et pourrait lui
 * transférer les appels d'action venus des pages (réponse `{}`, action
 * jamais exécutée). Les routes appellent les fonctions de src/lib.
 */
async function fichiers(dossier: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name);
    if (e.isDirectory()) out.push(...await fichiers(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

test("aucune route API n'importe un module d'actions serveur", async () => {
  const actions = new Set<string>();
  for (const f of await fichiers("src")) {
    if (/^\s*["']use server["']/.test(await readFile(f, "utf8"))) {
      actions.add(f.replace(/^src\//, "@/").replace(/\.tsx?$/, ""));
    }
  }
  assert.ok(actions.size > 0, "les modules d'actions sont bien détectés");
  for (const route of await fichiers("src/app/api")) {
    const source = await readFile(route, "utf8");
    for (const [, cible] of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      assert.ok(!actions.has(cible), `${route} importe ${cible} ("use server")`);
    }
  }
});
