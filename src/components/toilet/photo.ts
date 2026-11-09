"use client";

/*
 * Réduction des photos dans le navigateur (1600 px, JPEG) : quelques
 * centaines de ko au lieu de plusieurs Mo, ce qui compte dans les
 * toilettes du bas où le wifi passe mal. Les formats du téléphone
 * (HEIC…) ressortent en JPEG. L'aperçu est une URL data:, seule forme
 * d'image locale que la CSP autorise.
 */
const COTE_MAX = 1600;

export type Photo = { blob: Blob; apercu: string };

export async function reduirePhoto(fichier: File): Promise<Photo> {
  const bitmap = await createImageBitmap(fichier);
  const echelle = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * echelle);
  canvas.height = Math.round(bitmap.height * echelle);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((ok, ko) =>
    canvas.toBlob(b => (b ? ok(b) : ko(new Error("toBlob"))), "image/jpeg", 0.82));
  return { blob, apercu: canvas.toDataURL("image/jpeg", 0.5) };
}

/** Message affiché quand l'envoi n'aboutit pas (réseau coupé ou trop lent). */
export const ECHEC_RESEAU =
  "Connexion trop faible. Validez sans photo, puis ajoutez-la plus tard depuis « À prouver ».";
