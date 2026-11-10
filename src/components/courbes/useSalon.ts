"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Action } from "@/lib/courbes/salons";
import type { VueSalon, VueTraces } from "@/lib/courbes/vue";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/*
 * Liaison d'un navigateur avec son salon : une attente longue en boucle
 * pour l'état, des POST pour les actions, et le décalage d'horloge avec
 * le serveur (les animations suivent l'heure du serveur).
 */
export function useSalon(code: string) {
  const [etat, setEtat] = useState<VueSalon | null>(null);
  const [fatale, setFatale] = useState<string | null>(null);
  const version = useRef(-1);
  const decalage = useRef(0);
  const arret = useRef<AbortController | null>(null);

  const recevoir = useCallback((v: VueSalon) => {
    if (v.v < version.current) return;
    version.current = v.v;
    decalage.current = v.maintenant - Date.now();
    setEtat(v);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    arret.current = ctrl;
    let echecs = 0;
    (async () => {
      while (!ctrl.signal.aborted) {
        try {
          const r = await fetch(`/api/courbes/salons/${code}?v=${version.current}`,
            { signal: ctrl.signal, cache: "no-store" });
          if (r.status === 401) { window.location.href = "/connexion"; return; }
          const d = await r.json();
          if (r.status === 400) { setFatale(d.erreur ?? "Salon indisponible"); return; }
          if (!r.ok) throw new Error("serveur");
          if (typeof d.v === "number") recevoir(d);
          echecs = 0;
        } catch {
          if (ctrl.signal.aborted) return;
          await pause(Math.min(5000, 600 * ++echecs));
        }
      }
    })();
    return () => ctrl.abort();
  }, [code, recevoir]);

  /** Envoie une action ; renvoie le message d'erreur, ou null. */
  const agir = useCallback(async (action: Action): Promise<string | null> => {
    try {
      const r = await fetch(`/api/courbes/salons/${code}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action),
      });
      const d = await r.json();
      if (!r.ok) return d.erreur ?? "Action refusée";
      if (d.etat) recevoir(d.etat);
      return null;
    } catch {
      return "Connexion perdue, réessaie";
    }
  }, [code, recevoir]);

  /** Quitte le salon : coupe l'attente longue d'abord, pour ne pas y revenir. */
  const quitter = useCallback(() => {
    arret.current?.abort();
    void fetch(`/api/courbes/salons/${code}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: "quitter" }), keepalive: true,
    }).catch(() => undefined);
  }, [code]);

  const horloge = useCallback(() => Date.now() + decalage.current, []);
  return { etat, fatale, agir, quitter, horloge };
}

/** Courbes de la volée n ; rechargées quand le brouillard se lève pour moi. */
export function useTraces(code: string, n: number | undefined, sousVoile: boolean): VueTraces | null {
  const [traces, setTraces] = useState<VueTraces | null>(null);
  useEffect(() => {
    if (!n) { setTraces(null); return; }
    let actif = true;
    (async () => {
      for (let essai = 0; essai < 4 && actif; essai++) {
        try {
          const r = await fetch(`/api/courbes/salons/${code}/traces`, { cache: "no-store" });
          const d: VueTraces = await r.json();
          if (r.ok && d.n === n) { if (actif) setTraces(d); return; }
        } catch { /* nouvel essai */ }
        await pause(500);
      }
    })();
    return () => { actif = false; };
  }, [code, n, sousVoile]);
  return traces;
}

/** Fait re-rendre le composant à intervalle régulier (comptes à rebours). */
export function useBattement(ms: number, actif: boolean): void {
  const [, set] = useState(0);
  useEffect(() => {
    if (!actif) return;
    const id = setInterval(() => set((v) => v + 1), ms);
    return () => clearInterval(id);
  }, [ms, actif]);
}
