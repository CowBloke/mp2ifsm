// Publie du contenu dans la rubrique Cours (route /api/cours/publier).
//
//   COURS_TOKEN=... node --experimental-strip-types scripts/publier-cours.ts <commande> [options]
//
//   chapitre --cle maths-ch6 --titre "Complexes" [--matiere Maths] [--numero 6] [--resume "..."] [--position 6]
//   fichier  --chapitre maths-ch6 --cle cours --titre "Cours" [--genre cours|correction|dm|td|autre] chemin.pdf
//   paquets  --chapitre maths-ch6 slug-paquet-1 slug-paquet-2 ...
//   retirer-fichier  --chapitre maths-ch6 --cle cours
//   retirer-chapitre --cle maths-ch6
//   liste
//
// MP2_URL change le serveur (https://mp2ifsm.com par défaut). Le texte de
// chaque page est extrait localement avec pdftotext (poppler-utils) pour
// l'assistant de recherche.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const base = (process.env.MP2_URL ?? "https://mp2ifsm.com").replace(/\/$/, "");
const jeton = process.env.COURS_TOKEN;
if (!jeton) { console.error("COURS_TOKEN manquant"); process.exit(2); }

const [commande, ...reste] = process.argv.slice(2);
const options: Record<string, string> = {};
const positionnels: string[] = [];
for (let i = 0; i < reste.length; i++) {
  if (reste[i].startsWith("--")) options[reste[i].slice(2)] = reste[++i] ?? "";
  else positionnels.push(reste[i]);
}

async function appeler(init: RequestInit) {
  const r = await fetch(`${base}/api/cours/publier`, {
    ...init, headers: { authorization: `Bearer ${jeton}`, ...(init.headers ?? {}) },
  });
  const corps = await r.json().catch(() => ({}));
  if (!r.ok) { console.error(`Refusé (${r.status}) : ${corps.erreur ?? "réponse illisible"}`); process.exit(1); }
  return corps;
}
const json = (corps: unknown) => appeler({
  method: "POST", body: JSON.stringify(corps), headers: { "content-type": "application/json" },
});

switch (commande) {
  case "chapitre":
    console.log(await json({ action: "chapitre", ...options }));
    break;
  case "fichier": {
    const chemin = positionnels[0];
    if (!chemin) { console.error("Chemin du PDF manquant"); process.exit(2); }
    // pdftotext sépare les pages par un saut de page (\f).
    const pages = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", chemin, "-"], { maxBuffer: 256 * 1024 * 1024 })
      .toString("utf8").split("\f");
    if (pages.at(-1)?.trim() === "") pages.pop();
    const form = new FormData();
    form.set("meta", JSON.stringify({ genre: "cours", ...options }));
    form.set("pages", JSON.stringify(pages));
    form.set("fichier", new File([new Uint8Array(readFileSync(chemin))], basename(chemin), { type: "application/pdf" }));
    const r = await appeler({ method: "POST", body: form });
    console.log(`Publié : fichier ${r.id}, ${r.pages} pages indexées`);
    break;
  }
  case "paquets":
    console.log(await json({ action: "paquets", chapitre: options.chapitre, slugs: positionnels }));
    break;
  case "retirer-fichier":
    console.log(await json({ action: "retirer-fichier", chapitre: options.chapitre, cle: options.cle }));
    break;
  case "retirer-chapitre":
    console.log(await json({ action: "retirer-chapitre", cle: options.cle }));
    break;
  case "liste": {
    const r = await appeler({ method: "GET" });
    for (const c of r.chapitres) {
      console.log(`${c.cle}  ${c.matiere ?? "—"} · ${c.titre}`);
      for (const f of c.fichiers) console.log(`    ${f.cle} (${f.genre}, ${f.pages} p.) ${f.titre}`);
      for (const p of c.paquets) console.log(`    paquet ${p.slug}`);
    }
    break;
  }
  default:
    console.error("Commandes : chapitre, fichier, paquets, retirer-fichier, retirer-chapitre, liste");
    process.exit(2);
}
