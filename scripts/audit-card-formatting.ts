/** Audit live cards, or a private JSON snapshot supplied as the first argument. */
import { readFile } from "node:fs/promises";
import pg from "pg";
import { composerCarte, decouper } from "../src/lib/rendu";
import { restaurerClozeImporte } from "../src/lib/cloze";
type Card = { id: string; recto: string; verso: string; anki_guid: string | null };
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const cards: Card[] = process.argv[2] ? JSON.parse(await readFile(process.argv[2], "utf8"))
    : (await pool.query("select id,recto,verso,anki_guid from card where deleted_at is null order by id")).rows;
  const issues: Array<{ id: string; issue: string }> = [];
  let views = 0;
  for (const card of cards) {
    const c = restaurerClozeImporte(card.recto, card.verso, card.anki_guid);
    const composed = composerCarte(c.recto, c.verso);
    for (const html of [composed.rectoHtml, composed.rectoReveleHtml, composed.versoHtml, ...composed.trousHtml]) {
      views++;
      if (/katex-error|color:#cc0000|\{\{c\d|\[\.\.\.\]/.test(html)) issues.push({ id: card.id, issue: "TeX error or unprocessed cloze" });
    }
    for (const source of [c.recto, c.verso]) for (const p of decouper(source)) {
      if (p.type === "texte" && /\\[a-zA-Z]|(?<!\\)\$|\}\}/.test(p.valeur)) issues.push({ id: card.id, issue: "Unrendered math or damaged delimiter" });
    }
  }
  console.log(JSON.stringify({ cards: cards.length, views, issues }, null, 2));
  if (issues.length) process.exitCode = 1;
} finally { await pool.end(); }
