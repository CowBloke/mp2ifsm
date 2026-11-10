import assert from "node:assert/strict";
import { test } from "node:test";
import http2 from "node:http2";
import { generateKeyPairSync, verify } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

// Faux serveur APNs (HTTP/2 en clair) : on vérifie ce que le serveur enverrait à Apple.
test("APNs : JWT ES256 valide, en-têtes, contenu et classement des réponses", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const dossier = mkdtempSync(join(tmpdir(), "mp2-apns-"));
  const chemin = join(dossier, "cle.p8");
  writeFileSync(chemin, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });

  const recus: Array<{ entetes: http2.IncomingHttpHeaders; corps: string }> = [];
  const serveur = http2.createServer();
  serveur.on("stream", (flux, entetes) => {
    let corps = "";
    flux.setEncoding("utf8");
    flux.on("data", (d) => { corps += d; });
    flux.on("end", () => {
      recus.push({ entetes, corps });
      const jeton = String(entetes[":path"]).split("/").pop()!;
      if (jeton.startsWith("a")) { flux.respond({ ":status": 200 }); flux.end(); }
      else if (jeton.startsWith("b")) { flux.respond({ ":status": 410 }); flux.end(JSON.stringify({ reason: "Unregistered" })); }
      else { flux.respond({ ":status": 500 }); flux.end(JSON.stringify({ reason: "InternalServerError" })); }
    });
  });
  serveur.listen(0, "127.0.0.1");
  await once(serveur, "listening");
  const port = (serveur.address() as { port: number }).port;

  Object.assign(process.env, {
    APNS_KEY_ID: "ABC123DEFG", APNS_TEAM_ID: "TEAM123456", APNS_KEY_PATH: chemin,
    APNS_TOPIC: "com.exemple.app", APNS_URL: `http://127.0.0.1:${port}`,
  });
  const apns = await import("../src/lib/apns");
  apns.reinitialiserApns();
  try {
    assert.ok(apns.apnsConfigure());
    const notif = { titre: "Fiches du jour", corps: "3 cartes à réviser", url: "/flash", tag: "flash" };

    assert.equal(await apns.pousserApns("a".repeat(64), "sandbox", notif), "ok");
    assert.equal(await apns.pousserApns("b".repeat(64), "sandbox", notif), "perime");
    assert.equal(await apns.pousserApns("c".repeat(64), "production", notif), "echec");
    assert.equal(await apns.pousserApns("pas-hexa", "sandbox", notif), "echec");
    assert.equal(recus.length, 3, "un jeton d'appareil invalide n'est jamais envoyé");

    const [premier] = recus;
    assert.equal(premier.entetes[":path"], `/3/device/${"a".repeat(64)}`);
    assert.equal(premier.entetes["apns-topic"], "com.exemple.app");
    assert.equal(premier.entetes["apns-push-type"], "alert");
    assert.equal(premier.entetes["apns-collapse-id"], "flash");
    assert.ok(Number(premier.entetes["apns-expiration"]) > Date.now() / 1000);
    assert.deepEqual(JSON.parse(premier.corps), {
      aps: { alert: { title: "Fiches du jour", body: "3 cartes à réviser" }, sound: "default", "thread-id": "flash" },
      url: "/flash",
    });

    // Le JWT est signé par la clé .p8 et réutilisé d'un envoi à l'autre.
    const jwt = String(premier.entetes.authorization).replace(/^bearer /, "");
    const [h, c, s] = jwt.split(".");
    assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "ES256", kid: "ABC123DEFG" });
    assert.equal(JSON.parse(Buffer.from(c, "base64url").toString()).iss, "TEAM123456");
    assert.ok(verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" },
                     Buffer.from(s, "base64url")), "signature ES256 vérifiée par la clé publique");
    assert.ok(recus.every((r) => r.entetes.authorization === premier.entetes.authorization));
  } finally {
    apns.reinitialiserApns();
    serveur.close();
    for (const k of ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_KEY_PATH", "APNS_TOPIC", "APNS_URL"]) delete process.env[k];
  }
});

test("APNs non configuré : rien ne part", async () => {
  const apns = await import("../src/lib/apns");
  apns.reinitialiserApns();
  assert.equal(apns.apnsConfigure(), false);
  assert.equal(await apns.pousserApns("a".repeat(64), "sandbox", { titre: "t", corps: "c", url: "/", tag: "x" }), "echec");
});
