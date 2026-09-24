import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

export async function browserCheck(base: string, token: string) {
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
    await until('document.body.innerText.includes("Prochaines colles") && document.body.innerText.includes("Fiches suivies") && !document.querySelector(".skeleton")');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), "dashboard fits mobile viewport");
    const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile("/tmp/mp2i-portal-dashboard.png", Buffer.from(screenshot.data, "base64"));
    await until(`!!document.querySelector('button[aria-label^="Activer le mode "]')`);
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
  } finally {
    ws?.close();
    if (browser.exitCode === null) { process.kill(-browser.pid!, "SIGTERM"); await once(browser, "exit"); }
    await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  }
}
