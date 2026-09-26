/*
 * Préférences du joueur, propres à ce navigateur : volume et secousses
 * d'écran. Sans Pixi : les menus du site les lisent et les modifient.
 */

export type PreferencesJeu = {
  /** Volume des sons, de 0 (muet) à 1. */
  volume: number;
  /** Secousses d'écran aux impacts (à couper si elles gênent). */
  secousses: boolean;
};

export const PREFERENCES_DEFAUT: PreferencesJeu = { volume: 0.7, secousses: true };

const CLE = "taupe-fighter:preferences";

export function chargerPreferences(): PreferencesJeu {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? "null") as Partial<PreferencesJeu> | null;
    const volume = typeof brut?.volume === "number" && brut.volume >= 0 && brut.volume <= 1 ? brut.volume : PREFERENCES_DEFAUT.volume;
    const secousses = typeof brut?.secousses === "boolean" ? brut.secousses : PREFERENCES_DEFAUT.secousses;
    return { volume, secousses };
  } catch {
    return { ...PREFERENCES_DEFAUT };
  }
}

export function enregistrerPreferences(p: PreferencesJeu): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(p));
  } catch {
    // Stockage indisponible (navigation privée…) : la préférence vaut pour cette page.
  }
}
