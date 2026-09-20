import "server-only";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import { ErreurMetier } from "./errors";

/*
 * Import / export de paquets Anki (.apkg).
 *
 * Un .apkg est une archive ZIP contenant une base SQLite
 * (`collection.anki2` ou `.anki21`), un index `media` en JSON, et les
 * fichiers médias nommés « 0 », « 1 », … On vise le format hérité, que
 * Anki écrit toujours avec l'option « compatible avec les anciennes
 * versions » ; le format zstd récent (`.anki21b`) n'est pas lu.
 *
 * Conversions à l'entrée : le HTML d'Anki devient du texte, et les
 * notations mathématiques d'Anki (\(…\), \[…\], [latex]…[/latex])
 * deviennent les délimiteurs $…$ / $$…$$ utilisés ici.
 */

const SEP = "\x1f";  // séparateur de champs d'une note Anki

/* ------------------------------------------------------------------ */
/* Nettoyage du HTML Anki                                              */
/* ------------------------------------------------------------------ */

export function htmlVersTexte(html: string): string {
  let t = html;

  // Mathématiques : ramener toutes les notations sur $ et $$.
  t = t.replace(/\[latex\]([\s\S]*?)\[\/latex\]/gi, (_, m) => `$$${m.trim()}$$`);
  t = t.replace(/\[\$\$\]([\s\S]*?)\[\/\$\$\]/gi, (_, m) => `$$${m.trim()}$$`);
  t = t.replace(/\[\$\]([\s\S]*?)\[\/\$\]/gi, (_, m) => `$${m.trim()}$`);
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m.trim()}$`);
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m.trim()}$$`);

  // Preserve images in place using an encoded filename placeholder.
  t = t.replace(/<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi,
    (_, nom: string) => `![](anki-media:${encodeURIComponent(nom)})`);
  t = t.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  // Sauts de ligne avant de retirer le reste des balises.
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/(div|p|li|tr)>/gi, "\n");
  t = t.replace(/<li[^>]*>/gi, "• ");

  t = t.replace(/<[^>]+>/g, "");

  const entites: Record<string, string> = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&quot;": '"', "&#39;": "'", "&apos;": "'",
  };
  t = t.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (m) => entites[m] ?? m);
  t = t.replace(/&#(\d+);/g, (_, n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : "�");

  return t.replace(/\n{3,}/g, "\n\n").trim();
}

/** Noms des fichiers médias référencés par un champ. */
export function mediasReferences(html: string): string[] {
  const noms: string[] = [];
  for (const m of html.matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["']/gi)) {
    noms.push(decodeURIComponent(m[1]));
  }
  return noms;
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export type NoteImportee = {
  guid: string;
  recto: string;
  verso: string;
  medias: string[];   // noms d'origine référencés
};

export type PaquetImporte = {
  nom: string | null;
  notes: NoteImportee[];
  /** nom d'origine -> contenu binaire */
  medias: Map<string, Buffer>;
};

export type CarteCloze = {
  index: number;
  recto: string;
  verso: string;
};

// decoupe et formate les cartes cloze
export function formaterCloze(texte: string, extra = ""): CarteCloze[] {
  const motif = /\{\{\s*c(\d+)\s*::([\s\S]*?)\}\}/gi;
  const indices = new Set<number>();
  for (const m of texte.matchAll(motif)) {
    indices.add(Number(m[1]));
  }
  if (indices.size === 0) return [];

  const tries = Array.from(indices).sort((a, b) => a - b);
  return tries.map((n) => {
    const reponses: string[] = [];
    const recto = texte.replace(motif, (_, numStr: string, corps: string) => {
      const num = Number(numStr);
      const sep = corps.indexOf("::");
      const reponse = (sep !== -1 ? corps.slice(0, sep) : corps).trim();
      const indice = (sep !== -1 ? corps.slice(sep + 2) : "").trim();

      if (num === n) {
        if (reponse) reponses.push(reponse);
        return indice ? `[${indice}]` : "[...]";
      }
      return reponse;
    });

    const repTexte = reponses.join(", ");
    const verso = [repTexte, extra.trim()].filter(Boolean).join("\n\n");
    return {
      index: n,
      recto: recto || "(vide)",
      verso: verso || "(vide)",
    };
  });
}

export async function lireApkg(archive: Buffer): Promise<PaquetImporte> {
  let dossier: string | null = null;
  try {
    const zip = new AdmZip(archive);
    const entrees = zip.getEntries();
    // Bound decompressed storage before extracting any member.
    if (entrees.length > 10000 || entrees.reduce((n, e) => n + e.header.size, 0) > 256 * 1024 ** 2
        || entrees.some(e => e.header.size > 128 * 1024 ** 2)) {
      throw new ErreurMetier("FICHIER_TROP_GROS");
    }
    if (entrees.some(e => e.entryName === "collection.anki21b")) {
      throw new ErreurMetier("APKG_TROP_RECENT");
    }

    const base = entrees.find((e) => e.entryName === "collection.anki21")
             ?? entrees.find((e) => e.entryName === "collection.anki2");
    if (!base) {
      // `.anki21b` = export moderne compressé en zstd, illisible ici.
      throw new ErreurMetier(
        entrees.some((e) => e.entryName.endsWith(".anki21b"))
          ? "APKG_TROP_RECENT" : "APKG_INVALIDE",
      );
    }

    dossier = await mkdtemp(join(tmpdir(), "mp2-apkg-"));
    const chemin = join(dossier, "collection.sqlite");
    await writeFile(chemin, base.getData());

    const db = new Database(chemin, { readonly: true, fileMustExist: true });
    db.pragma("trusted_schema = OFF");
    let notes: NoteImportee[] = [];
    let nom: string | null = null;
    try {
      const col = db.prepare("select decks from col limit 1").get() as
        { decks?: string } | undefined;
      if (col?.decks) {
        try {
          const decks = JSON.parse(col.decks) as Record<string, { name?: string }>;
          // Anki crée toujours un paquet « Default » : on prend le premier autre.
          nom = Object.values(decks).map((d) => d.name)
            .find((n): n is string => !!n && n !== "Default") ?? null;
        } catch { /* champ absent ou format récent : on gardera null */ }
      }

      const lignes = db.prepare("select guid, flds from notes limit 10001").all() as
        Array<{ guid: string; flds: string }>;

      if (lignes.length > 10000) throw new ErreurMetier("FICHIER_TROP_GROS");
      notes = lignes.flatMap(({ guid, flds }) => {
        const champs = flds.split(SEP);
        const indexCloze = champs.findIndex((c) => /\{\{\s*c\d+\s*::/i.test(c));

        if (indexCloze !== -1) {
          const texteHtml = champs[indexCloze] ?? "";
          const extraHtml = champs.filter((_, i) => i !== indexCloze).filter((c) => c.trim()).join("<br>");
          const texte = htmlVersTexte(texteHtml);
          const extra = htmlVersTexte(extraHtml);
          const cartesCloze = formaterCloze(texte, extra);

          if (cartesCloze.length > 0) {
            const medias = [
              ...mediasReferences(texteHtml),
              ...mediasReferences(extraHtml),
            ];
            return cartesCloze.map((c) => ({
              guid: `${guid}-c${c.index}`,
              recto: c.recto || "(vide)",
              verso: c.verso || "(vide)",
              medias,
            }));
          }
        }

        const rectoHtml = champs[0] ?? "";
        const versoHtml = champs.slice(1).filter((c) => c.trim()).join("<br>");
        const recto = htmlVersTexte(rectoHtml);
        const verso = htmlVersTexte(versoHtml);
        // une note sans recto exploitable n'a rien a faire ici
        if (!recto && !verso) return [];
        return [{
          guid,
          recto: recto || "(vide)",
          verso: verso || "(vide)",
          medias: [...mediasReferences(rectoHtml), ...mediasReferences(versoHtml)],
        }];
      });
    } finally {
      db.close();
    }

    // Index des médias : { "0": "schema.png", "1": "courbe.jpg" }
    const medias = new Map<string, Buffer>();
    const index = entrees.find((e) => e.entryName === "media");
    if (index) {
      try {
        const table = JSON.parse(index.getData().toString("utf8")) as Record<string, string>;
        for (const [numero, nomOrigine] of Object.entries(table)) {
          const fichier = zip.getEntry(numero);
          if (fichier && typeof nomOrigine === "string") medias.set(nomOrigine, fichier.getData());
        }
      } catch { /* index illisible : on importe sans les images */ }
    }

    return { nom, notes, medias };
  } finally {
    if (dossier) await rm(dossier, { recursive: true, force: true }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export type NoteAExporter = { recto: string; verso: string; guid?: string | null };

export function texteVersHtml(source: string): string {
  const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return source.split(/(!\[[^\]]*\]\([^\s)]+\)|\$\$[\s\S]*?\$\$|(?<!\\)\$[^$\n]+\$)/g).map(t => {
    const img = /^!\[[^\]]*\]\(([^\s)]+)\)$/.exec(t);
    if (img) return `<img src="${echapper(img[1])}">`;
    if (t.startsWith("$$") && t.endsWith("$$")) return `\\[${echapper(t.slice(2, -2))}\\]`;
    if (t.startsWith("$") && t.endsWith("$")) return `\\(${echapper(t.slice(1, -1))}\\)`;
    return echapper(t).replace(/\n/g, "<br>");
  }).join("");
}

function sfldChecksum(premierChamp: string): number {
  const sha = createHash("sha1").update(premierChamp, "utf8").digest("hex");
  return parseInt(sha.slice(0, 8), 16);
}

function guidAleatoire(): string {
  // Anki utilise un identifiant court base91 ; une base64url de 10
  // caractères remplit le même rôle (unicité) et reste acceptée.
  return createHash("sha1").update(`${Date.now()}:${Math.random()}`)
    .digest("base64url").slice(0, 10);
}

/**
 * Construit un .apkg contenant un paquet et un modèle « Basique »
 * (Recto/Verso), lisible par Anki de bureau et AnkiDroid.
 */
export async function ecrireApkg(
  titre: string,
  notes: NoteAExporter[],
  medias: Map<string, Buffer> = new Map(),
): Promise<Buffer> {
  const dossier = await mkdtemp(join(tmpdir(), "mp2-export-"));
  const chemin = join(dossier, "collection.anki2");

  try {
    const db = new Database(chemin);
    const maintenantMs = Date.now();
    const maintenantS = Math.floor(maintenantMs / 1000);
    const deckId = maintenantMs;
    const modelId = maintenantMs + 1;

    db.exec(`
      create table col (
        id integer primary key, crt integer not null, mod integer not null,
        scm integer not null, ver integer not null, dty integer not null,
        usn integer not null, ls integer not null, conf text not null,
        models text not null, decks text not null, dconf text not null,
        tags text not null);
      create table notes (
        id integer primary key, guid text not null, mid integer not null,
        mod integer not null, usn integer not null, tags text not null,
        flds text not null, sfld integer not null, csum integer not null,
        flags integer not null, data text not null);
      create table cards (
        id integer primary key, nid integer not null, did integer not null,
        ord integer not null, mod integer not null, usn integer not null,
        type integer not null, queue integer not null, due integer not null,
        ivl integer not null, factor integer not null, reps integer not null,
        lapses integer not null, left integer not null, odue integer not null,
        odid integer not null, flags integer not null, data text not null);
      create table revlog (
        id integer primary key, cid integer not null, usn integer not null,
        ease integer not null, ivl integer not null, lastIvl integer not null,
        factor integer not null, time integer not null, type integer not null);
      create table graves (usn integer not null, oid integer not null, type integer not null);
      create index ix_notes_usn on notes (usn);
      create index ix_cards_usn on cards (usn);
      create index ix_cards_nid on cards (nid);
      create index ix_cards_sched on cards (did, queue, due);
      create index ix_notes_csum on notes (csum);
    `);

    const modeles = {
      [String(modelId)]: {
        id: modelId, name: "Basique (mp2ifsm)", type: 0, mod: maintenantS, usn: -1,
        sortf: 0, did: deckId,
        tmpls: [{
          name: "Carte 1", ord: 0,
          qfmt: "{{Recto}}",
          afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Verso}}",
          bqfmt: "", bafmt: "", did: null, bfont: "", bsize: 0,
        }],
        flds: [
          { name: "Recto", ord: 0, sticky: false, rtl: false, font: "Arial", size: 20 },
          { name: "Verso", ord: 1, sticky: false, rtl: false, font: "Arial", size: 20 },
        ],
        css: ".card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }",
        latexPre: "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
        latexPost: "\\end{document}",
        latexsvg: false, req: [[0, "any", [0]]], vers: [], tags: [],
      },
    };

    const paquets = {
      "1": {
        id: 1, name: "Default", mod: maintenantS, usn: -1, lrnToday: [0, 0],
        revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0], collapsed: true,
        browserCollapsed: true, desc: "", dyn: 0, conf: 1, extendNew: 0, extendRev: 0,
      },
      [String(deckId)]: {
        id: deckId, name: titre.replace(/["\\]/g, "").slice(0, 80) || "mp2ifsm",
        mod: maintenantS, usn: -1, lrnToday: [0, 0], revToday: [0, 0],
        newToday: [0, 0], timeToday: [0, 0], collapsed: false, browserCollapsed: false,
        desc: "Exporté depuis mp2ifsm.com", dyn: 0, conf: 1, extendNew: 0, extendRev: 0,
      },
    };

    const dconf = {
      "1": {
        id: 1, mod: 0, name: "Default", usn: 0, maxTaken: 60, autoplay: true,
        timer: 0, replayq: true,
        new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 0],
               order: 1, perDay: 20 },
        rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
        lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
        dyn: false, newMix: 0, newPerDayMinimum: 0, interdayLearningMix: 0,
        reviewOrder: 0, newSortOrder: 0, newGatherPriority: 0, buryInterdayLearning: false,
      },
    };

    db.prepare(`insert into col values (1,?,?,?,11,0,0,0,?,?,?,?,'{}')`).run(
      maintenantS, maintenantS, maintenantMs,
      JSON.stringify({ nextPos: 1, estTimes: true, activeDecks: [1], sortType: "noteFld",
                       timeLim: 0, sortBackwards: false, addToCur: true, curDeck: deckId,
                       newBury: true, newSpread: 0, dueCounts: true, curModel: String(modelId),
                       collapseTime: 1200 }),
      JSON.stringify(modeles), JSON.stringify(paquets), JSON.stringify(dconf),
    );

    const insNote = db.prepare(
      `insert into notes values (?,?,?,?,-1,'',?,?,?,0,'')`);
    const insCarte = db.prepare(
      `insert into cards values (?,?,?,0,?,-1,0,0,?,0,0,0,0,0,0,0,0,'')`);

    const tx = db.transaction((liste: NoteAExporter[]) => {
      liste.forEach((n, i) => {
        const noteId = maintenantMs + 2 + i * 2;
        const flds = `${texteVersHtml(n.recto)}${SEP}${texteVersHtml(n.verso)}`;
        insNote.run(noteId, n.guid || guidAleatoire(), modelId, maintenantS,
                    flds, n.recto, sfldChecksum(n.recto));
        insCarte.run(noteId + 1, noteId, deckId, maintenantS, i + 1);
      });
    });
    tx(notes);

    db.close();

    const zip = new AdmZip();
    zip.addFile("collection.anki2", await readFile(chemin));
    const index: Record<string, string> = {};
    for (const [nom, contenu] of medias) {
      const numero = String(Object.keys(index).length);
      index[numero] = nom;
      zip.addFile(numero, contenu);
    }
    zip.addFile("media", Buffer.from(JSON.stringify(index), "utf8"));
    return zip.toBuffer();
  } finally {
    await rm(dossier, { recursive: true, force: true }).catch(() => {});
  }
}
