"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialogue } from "@/components/Dialogue";
import { statutPour, type Statut } from "@/lib/toilet-statuts";
import { ECHEC_RESEAU, reduirePhoto, type Photo } from "./photo";

/*
 * Le gros bouton. Un appui ouvre la fenêtre qui propose la photo de
 * preuve de propreté : appareil photo ou pellicule. On peut aussi
 * valider sans photo et l'ajouter plus tard (section « À prouver »),
 * le wifi des toilettes du bas étant capricieux.
 */
type Resultat = { total: number; nouveau: Statut | null };

export function BoutonPassage() {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);
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
    try { setPhoto(await reduirePhoto(f)); }
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
      setErreur(avecPhoto ? ECHEC_RESEAU : "Connexion perdue — réessayez");
    } finally {
      setEnCours(false);
    }
  }

  const sourcePhoto = "flex h-28 flex-1 flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] "
    + "border border-dashed border-[var(--border)] text-[14px] font-medium hover:bg-[var(--muted)]";

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
                Pas de réseau ? Validez sans photo et ajoutez-la plus tard depuis votre pellicule.
              </p>

              <input ref={camera} type="file" accept="image/*" capture="environment"
                     onChange={choisir} className="sr-only" tabIndex={-1} aria-hidden="true" />
              <input ref={galerie} type="file" accept="image/*"
                     onChange={choisir} className="sr-only" tabIndex={-1} aria-hidden="true" />

              {photo ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.apercu} alt="Aperçu de la photo de preuve"
                       className="max-h-[45vh] w-full rounded-[var(--radius-lg)] object-cover" />
                  <button type="button" onClick={() => setPhoto(null)}
                          className="puce absolute bottom-3 right-3 bg-[var(--card)]">Changer</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" onClick={() => camera.current?.click()} className={sourcePhoto}>
                    <span className="text-[26px]" aria-hidden="true">📸</span>
                    Prendre une photo
                  </button>
                  <button type="button" onClick={() => galerie.current?.click()} className={sourcePhoto}>
                    <span className="text-[26px]" aria-hidden="true">🖼️</span>
                    Choisir dans la galerie
                  </button>
                </div>
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
