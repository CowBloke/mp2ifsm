"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialogue } from "@/components/Dialogue";
import { statutPour, type Statut } from "@/lib/toilet-statuts";

/*
 * Le gros bouton. Un appui ouvre la fenêtre qui propose la photo de
 * preuve de propreté ; on peut aussi valider sans photo.
 *
 * La photo est réduite dans le navigateur (1600 px, JPEG) : moins de
 * données mobiles, moins de stockage, et les formats exotiques du
 * téléphone (HEIC…) ressortent en JPEG. L'aperçu est une URL data:,
 * seule forme d'image locale que la CSP autorise.
 */
const COTE_MAX = 1600;

type Photo = { blob: Blob; apercu: string };
type Resultat = { total: number; nouveau: Statut | null };

async function reduire(fichier: File): Promise<Photo> {
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

export function BoutonPassage() {
  const router = useRouter();
  const entree = useRef<HTMLInputElement>(null);
  const [ouvert, setOuvert] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  function fermer() {
    setOuvert(false); setPhoto(null); setErreur(null); setResultat(null);
  }

  async function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErreur(null);
    try { setPhoto(await reduire(f)); }
    catch { setErreur("Photo illisible — essayez-en une autre"); }
  }

  async function valider(avecPhoto: boolean) {
    setErreur(null);
    setEnCours(true);
    try {
      const fd = new FormData();
      if (avecPhoto && photo) fd.set("photo", photo.blob, "preuve.jpg");
      const res = await fetch("/api/toilet/passage", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErreur(data.erreur ?? "Enregistrement impossible"); return; }
      const avant = statutPour(data.total - 1), apres = statutPour(data.total);
      setResultat({ total: data.total, nouveau: apres.seuil !== avant.seuil ? apres : null });
      setPhoto(null);
      router.refresh();
    } catch {
      setErreur("Enregistrement impossible — réessayez");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOuvert(true)}
              className="bouton-principal h-[72px] text-[18px]">
        <span aria-hidden="true">🚽</span> J’y vais
      </button>

      {ouvert && (
        <Dialogue titre={resultat ? "Passage validé" : "Preuve de propreté"} onFermer={fermer}>
          {resultat ? (
            <div className="flex flex-col gap-4">
              {resultat.nouveau ? (
                <div className="rounded-[var(--radius-lg)] bg-[var(--secondary)] p-4 text-center">
                  <p className="text-[40px] leading-none" aria-hidden="true">{resultat.nouveau.emoji}</p>
                  <p className="mt-2 text-[13px] font-medium text-[var(--muted-foreground)]">Nouveau statut débloqué</p>
                  <p className="text-[20px] font-semibold">{resultat.nouveau.titre}</p>
                  <p className="mt-1 text-[14px] italic text-[var(--muted-foreground)]">{resultat.nouveau.devise}</p>
                </div>
              ) : (
                <p className="text-[15px]">
                  Bien joué ! C’est votre <strong className="tabular">{resultat.total}</strong>
                  <sup>{resultat.total === 1 ? "er" : "e"}</sup> passage. Pensez à tirer la chasse.
                </p>
              )}
              <button type="button" onClick={fermer} className="bouton-principal h-12">Super</button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[15px] text-[var(--muted-foreground)]">
                Une photo des toilettes du bas pour prouver que vous les laissez nickel ?
                Elle n’est visible que par les membres de Toilet!.
              </p>

              <input ref={entree} type="file" accept="image/*" capture="environment"
                     onChange={choisir} className="sr-only" tabIndex={-1} aria-hidden="true" />

              {photo ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.apercu} alt="Aperçu de la photo de preuve"
                       className="max-h-[45vh] w-full rounded-[var(--radius-lg)] object-cover" />
                  <button type="button" onClick={() => entree.current?.click()}
                          className="puce absolute bottom-3 right-3 bg-[var(--card)]">Reprendre</button>
                </div>
              ) : (
                <button type="button" onClick={() => entree.current?.click()}
                        className="flex h-32 flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)]
                                   border border-dashed border-[var(--border)] text-[15px] font-medium
                                   hover:bg-[var(--muted)]">
                  <span className="text-[28px]" aria-hidden="true">📸</span>
                  Prendre une photo
                </button>
              )}

              {erreur && <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" disabled={enCours} onClick={() => valider(false)} className="puce h-12">
                  Sans photo
                </button>
                <button type="button" disabled={enCours || !photo} onClick={() => valider(true)}
                        className="bouton-principal h-12 flex-1">
                  {enCours ? "Envoi…" : "Valider avec la photo"}
                </button>
              </div>
            </div>
          )}
        </Dialogue>
      )}
    </>
  );
}
