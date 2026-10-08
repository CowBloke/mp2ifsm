import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

export async function browserCheck(base: string, token: string) {
  const captures = process.env.CAPTURES ?? "/tmp";
  const profile = await mkdtemp("/tmp/mp2-browser-");
  const browser = spawn("/usr/bin/chromium", ["--headless", "--no-sandbox", "--disable-gpu", "--no-first-run",
    "--no-default-browser-check", "--remote-debugging-port=4262", "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", detached: true });
  let ws: WebSocket | undefined;
  try {
    let target: { webSocketDebuggerUrl: string } | undefined;
    for (let i = 0; i < 100; i++) {
      try { target = (await (await fetch("http://127.0.0.1:4262/json")).json()).find((t: { type: string; url: string }) => t.type === "page" && t.url === "about:blank"); if (target) break; } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(target, "Chromium startup");
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => { ws!.onopen = () => resolve(); ws!.onerror = reject; });
    let id = 0;
    const pending = new Map<number, { resolve: (r: any) => void; reject: (e: unknown) => void }>();
    ws.onmessage = event => {
      const result = JSON.parse(String(event.data));
      if (result.id && pending.has(result.id)) {
        const p = pending.get(result.id)!; pending.delete(result.id);
        if (result.error) p.reject(result.error); else p.resolve(result.result);
      }
    };
    function send(method: string, params: Record<string, unknown> = {}): Promise<any> {
      return new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws!.send(JSON.stringify({ id: key, method, params })); });
    }
    async function evaluate(expression: string) {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    }
    async function until(expression: string) {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`!!document.body && (${expression})`)) return;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error(`Browser timed out: ${expression}; ${await evaluate("JSON.stringify({url: location.href, body: document.body.innerText.slice(0, 1200)})")}`);
    }
    await send("Page.enable");
    await send("Network.setCookie", { name: "mp2_session", value: token, url: base, httpOnly: true, sameSite: "Lax" });
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send("Page.navigate", { url: base + "/" });
    await until('document.body.innerText.includes("Bonjour") || document.body.innerText.includes("Bonsoir") || document.body.innerText.includes("Bonne nuit")');
    await until('document.body.innerText.includes("À réviser aujourd’hui") && document.body.innerText.includes("Cette semaine") && !document.querySelector(".skeleton")');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), "dashboard fits mobile viewport");
    assert.ok(await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() !== ""'),
      "shared tweakcn tokens are loaded");
    assert.ok(await evaluate('/Geist/.test(getComputedStyle(document.body).fontFamily)'), "Geist is the body font");
    async function capture(nom: string) {
      const image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      await writeFile(`${captures}/mp2i-portal-${nom}.png`, Buffer.from(image.data, "base64"));
    }
    await capture("dashboard");
    for (const [chemin, nom, texte] of [
      ["/fiches", "fiches", "Fiches"], ["/documents", "documents", "Documents"],
      ["/marche", "marche", "Marché"], ["/colles", "colles", "Colles"],
    ]) {
      await send("Page.navigate", { url: base + chemin });
      await until(`document.querySelector("h1")?.innerText === "${texte}" && !document.querySelector(".skeleton")`);
      assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), `${nom} fits mobile viewport`);
      await capture(nom);
    }
    await send("Page.navigate", { url: base + "/marche" });
    await until('!!document.querySelector(\'a[href^="/marche/"]:not([href="/marche/classement"])\')');
    const premier = await evaluate('document.querySelector(\'a[href^="/marche/"]:not([href="/marche/classement"])\').href');
    await send("Page.navigate", { url: premier });
    await until('document.body.innerText.includes("Montant") || document.body.innerText.includes("gagnante")');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), "market page fits mobile viewport");
    await capture("pari");
    console.log("PASS mobile pages fit the viewport");
    // Le thème se règle depuis le profil (avatar de l'accueil).
    await send("Page.navigate", { url: base + "/profil" });
    await until(`!!document.querySelector('button[aria-label^="Activer le mode "]') && !document.querySelector(".skeleton")`);
    // Laisser React hydrater le bouton avant de cliquer.
    await evaluate('new Promise(r => setTimeout(r, 500))');
    const initialDark = await evaluate('document.documentElement.classList.contains("dark")');
    const expectedDark = !initialDark;
    await evaluate(`document.querySelector('button[aria-label^="Activer le mode "]').click()`);
    await until(`document.documentElement.classList.contains("dark") === ${expectedDark}`);
    await send("Page.reload");
    await until(`document.documentElement.classList.contains("dark") === ${expectedDark} && !!document.querySelector('button[aria-pressed="${expectedDark}"]')`);
    await send("Page.navigate", { url: base + "/marche" });
    await until('document.body.innerText.includes("Proposer un pari")');
    await evaluate('new Promise(r => setTimeout(r, 500))');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Proposer un pari')).click()`);
    await until('document.body.innerText.includes("Envoyer pour validation")');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), "proposal form fits mobile viewport");
    console.log("PASS theme toggle, reload persistence and mobile proposal form");
    await send("Page.navigate", { url: base + "/fiches/integration/reviser" });
    await until('document.body.innerText.includes("Afficher la réponse")');
    // Give React hydration a frame before dispatching keyboard shortcuts.
    await evaluate('new Promise(r => setTimeout(r, 500))');
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await until('document.body.innerText.includes("Difficile") && document.body.innerText.includes("Facile")');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), "review fits mobile viewport");
    const review = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile("/tmp/mp2i-portal-review.png", Buffer.from(review.data, "base64"));
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "3", code: "Digit3", windowsVirtualKeyCode: 51 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "3", code: "Digit3", windowsVirtualKeyCode: 51 });
    await until('document.body.innerText.includes("Session terminée")');
    console.log("PASS Chromium mobile dashboard, space to reveal, 3 to review, session completion");

    // Texte à trous : chaque appui dévoile un seul trou, tiré au hasard.
    await send("Page.navigate", { url: base + "/fiches/trous/reviser" });
    await until('document.body.innerText.includes("Révéler un mot · 3 restants")');
    await evaluate('new Promise(r => setTimeout(r, 500))');
    assert.ok(await evaluate('!document.body.innerText.includes("Rolle")'), "gaps start hidden");
    const appuyer = async () => {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    };
    await appuyer();
    await until('document.querySelectorAll(".trou-revele").length === 1 && document.body.innerText.includes("2 restants")');
    await evaluate(`document.querySelector('.contenu-carte').click()`);
    await until('document.querySelectorAll(".trou-revele").length === 2 && document.body.innerText.includes("1 restant")');
    await evaluate('new Promise(r => setTimeout(r, 400))');  // fin du fondu d'apparition
    await capture("trous");
    await appuyer();
    await until('document.body.innerText.includes("Rolle") && document.body.innerText.includes("Difficile")');
    console.log("PASS cloze card reveals one random gap per press, then the grades");
    await send("Page.navigate", { url: base + "/fiches/formules/reviser" });
    await until('document.querySelectorAll(".trou-formule[data-trou]").length === 2');
    await evaluate('new Promise(r => setTimeout(r, 500))');
    assert.equal(await evaluate('document.querySelectorAll(".katex-error").length'), 0, "formula clozes compose without TeX errors");
    for (const width of [320, 390, 768]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.ok(await evaluate(`document.documentElement.scrollWidth <= ${width}`), `math cards fit ${width}px`);
    }
    await appuyer();
    await until('document.querySelectorAll(".trou-formule.trou-revele").length === 1');
    assert.equal(await evaluate('document.querySelectorAll(".trou-formule.trou-revele .katex").length'), 1, "partial reveal keeps complete KaTeX layout");
    await appuyer();
    await until('document.body.innerText.includes("Difficile")');
    assert.equal(await evaluate('document.querySelectorAll(".katex-error").length'), 0, "revealed fractions and products stay valid");
    await capture("formules");
    console.log("PASS TeX clozes, progressive reveal, fractions, matrices and mobile overflow");

  } finally {
    ws?.close();
    if (browser.exitCode === null) { process.kill(-browser.pid!, "SIGTERM"); await once(browser, "exit"); }
    await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  }
}
