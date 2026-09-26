/** Empreinte FNV-1a (32 bits) d'un texte : rapide, stable, sans dépendance. */
export function fnv1a(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) h = Math.imul(h ^ texte.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
