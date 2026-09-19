import { test } from "node:test";
import assert from "node:assert/strict";
import { apercuIntervalles, noter, noterProjection, versDb, NOTES, noteDepuisCle, formatIntervalle } from "../src/lib/fsrs";
import { jetonRevision, verifierRevision } from "../src/lib/revision-token";
import { detecterType, cheminDe } from "../src/lib/stockage";
import { rendreContenu } from "../src/lib/rendu";
import { ecrireApkg, lireApkg, texteVersHtml } from "../src/lib/anki";
import { lireFormulaire } from "../src/lib/uploads";

process.env.SESSION_SECRET = "test-only-secret";

test("FSRS previews match all scheduled answers for new and mature cards", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  const mature = versDb(noter(null, NOTES[3].note, new Date("2026-09-01T12:00:00Z")).card);
  for (const etat of [null, mature]) {
    const previews = apercuIntervalles(etat, now);
    for (const [i, { note }] of NOTES.entries()) {
      const result = noter(etat, note, now);
      assert.equal(formatIntervalle(result.card.due, now), previews[i].intervalle);
      assert.ok(result.card.stability > 0);
      assert.equal(result.card.reps, (etat?.reps ?? 0) + 1);
    }
  }
  assert.equal(noteDepuisCle("toString"), null);
  assert.equal(noteDepuisCle("__proto__"), null);
});

test("review tokens bind the user, card, version and preview time", () => {
  const now = new Date();
  const token = jetonRevision("user-a", 12, 3, now);
  assert.deepEqual(verifierRevision(token, "user-a", 12), { now, reps: 3 });
  assert.throws(() => verifierRevision(token, "user-b", 12));
  assert.throws(() => verifierRevision(token, "user-a", 13));
  assert.throws(() => verifierRevision(token + "x", "user-a", 12));
  assert.throws(() => verifierRevision(jetonRevision("user-a", 12, 3, new Date(0)), "user-a", 12));
});

test("rendering escapes HTML and refuses external media", () => {
  const html = rendreContenu('<script>alert(1)</script> $x^2$ ![](https://example.org/pixel) ![](/api/fiches/image/42)');
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('src="https:'));
  assert.ok(html.includes('src="/api/fiches/image/42"'));
  assert.ok(html.includes('class="katex"'));
});

test("storage paths and signatures do not trust filenames or claimed MIME", () => {
  assert.throws(() => cheminDe("/tmp", "../../passwd"));
  assert.equal(detecterType(Buffer.from("<script>bad</script>"), "application/pdf"), null);
  assert.equal(detecterType(Buffer.from("%PDF-1.7\n"), "text/html"), "application/pdf");
});

test("Anki round trip retains images, literal HTML, newlines and maths", async () => {
  const source = 'a < b & c\n![](diagram.png)\n$$x^2$$';
  const data = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const archive = await ecrireApkg("Images", [{ recto: source, verso: "$y$" }], new Map([["diagram.png", data]]));
  const result = await lireApkg(archive);
  assert.equal(result.notes[0].recto, source.replace("diagram.png", "anki-media:diagram.png"));
  assert.deepEqual(result.medias.get("diagram.png"), data);
  assert.ok(texteVersHtml("$x$").includes("\\(x\\)"));
});

test("multipart parser rejects cross-site and oversized chunked bodies", async () => {
  await assert.rejects(lireFormulaire(new Request("http://localhost/upload", {
    method: "POST", headers: { origin: "https://hostile.invalid" }, body: "x",
  }), 20));
  await assert.rejects(lireFormulaire(new Request("http://localhost/upload", {
    method: "POST", body: new Uint8Array(70000),
  }), 20));
});

test("thinking time cannot make a newly scheduled learning card already overdue", () => {
  const shown = new Date("2026-09-19T12:00:00Z");
  const submitted = new Date("2026-09-19T12:30:00Z");
  const result = noterProjection(null, NOTES[0].note, shown, submitted);
  assert.ok(result.card.due.getTime() > submitted.getTime());
  assert.equal(formatIntervalle(result.card.due, submitted), apercuIntervalles(null, shown)[0].intervalle);
  assert.equal(result.card.last_review?.toISOString(), submitted.toISOString());
});
