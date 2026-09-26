/*
 * Couleurs des places (J1 à J4) : distinctes, lisibles sur fond sombre
 * comme au vidéoprojecteur, jamais le seul indice (le nom est affiché).
 */

export const COULEURS_PLACES = [0x4f8cff, 0xff5a5f, 0x3ddc84, 0xffc53d] as const;

export function couleurPlace(place: number): number {
  return COULEURS_PLACES[place % COULEURS_PLACES.length];
}

export const POLICE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
