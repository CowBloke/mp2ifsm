/*
 * Service worker de mp2ifsm.com — notifications uniquement.
 *
 * Aucun cache, aucune interception réseau : le portail reste servi
 * tel quel par le serveur (sessions, argent, révisions toujours à jour).
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corps: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titre || "mp2ifsm", {
    body: d.corps || "",
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const cible = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const f of fenetres) {
      if (new URL(f.url).origin === self.location.origin && "focus" in f) {
        await f.focus();
        if ("navigate" in f) return f.navigate(cible);
        return;
      }
    }
    return self.clients.openWindow(cible);
  })());
});
