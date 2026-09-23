import { TICKS_PAR_SECONDE } from "../noyau/constantes";

/*
 * Horloge du serveur : appelle `pas` 60 fois par seconde. Chaque réveil
 * est recalé sur l'horloge haute résolution (setTimeout dérive) ; un
 * retard est rattrapé dans la limite de quelques ticks, au-delà il est
 * abandonné et signalé plutôt que de s'emballer.
 */

const RATTRAPAGE_MAX = 4;

export type Boucle = { arreter(): void };

export function demarrerBoucle(pas: () => void, surRetard: (ticksPerdus: number) => void = () => {}): Boucle {
  const periode = 1000 / TICKS_PAR_SECONDE;
  let prochain = performance.now() + periode;
  let minuterie: ReturnType<typeof setTimeout> | null = null;
  let active = true;

  function reveil() {
    if (!active) return;
    const maintenant = performance.now();
    let joues = 0;
    while (maintenant >= prochain && joues < RATTRAPAGE_MAX) {
      pas();
      prochain += periode;
      joues++;
    }
    if (maintenant >= prochain) {
      const perdus = Math.floor((maintenant - prochain) / periode) + 1;
      prochain += perdus * periode;
      surRetard(perdus);
    }
    minuterie = setTimeout(reveil, Math.max(0, prochain - performance.now()));
  }

  minuterie = setTimeout(reveil, periode);
  return {
    arreter() {
      active = false;
      if (minuterie) clearTimeout(minuterie);
    },
  };
}
