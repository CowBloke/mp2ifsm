"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ajouterCarte, modifierCarte, previsualiser } from "@/lib/actions-fiches";

/** Verso de remplissage d'un texte à trous sans remarque (cf. rendu.ts). */
const VERSO_VIDE = "(vide)";
const A_TROUS = /\{\{c\d+::/;

/*
 * Éditeur de carte : recto / verso, LaTeX et images.
 *
 * Deux types : question / réponse, ou texte à trous. Dans un texte à
 * trous, « Masquer la sélection » entoure le mot choisi de {{cN::…}} ;
 * en révision, chaque appui dévoile un trou tiré au hasard.
 *
 * Les images sont téléversées dès qu'elles sont collées ou choisies,
 * et remplacées par leur Markdown. L'aperçu est rendu par le serveur,
 * donc ce qu'on voit ici est exactement ce que la révision affichera.
 */
export function EditeurCarte({
  deckId, carte, onFini,
}: {
  deckId: number;
  carte?: { id: number; recto: string; verso: string };
  onFini?: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<"basique" | "trous">(
    carte && A_TROUS.test(carte.recto) ? "trous" : "basique");
  const [recto, setRecto] = useState(carte?.recto ?? "");
  const [verso, setVerso] = useState(
    carte && carte.verso.trim() === VERSO_VIDE ? "" : carte?.verso ?? "");
  const rectoRef = useRef<HTMLTextAreaElement>(null);
  const trous = recto.match(/\{\{c\d+::/g)?.length ?? 0;
  const versoFinal = type === "trous" && !verso.trim() ? VERSO_VIDE : verso;
  const pret = recto.trim() !== "" && (type === "trous" ? trous > 0 : verso.trim() !== "");

  /** Entoure la sélection du recto d'un nouveau trou. */
  function masquerSelection() {
    const champ = rectoRef.current;
    if (!champ) return;
    const debut = champ.selectionStart;
    const fin = champ.selectionEnd;
    const mot = recto.slice(debut, fin);
    if (!mot.trim()) { champ.focus(); return; }
    const numero = Math.max(0, ...[...recto.matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1]))) + 1;
    const insere = `{{c${numero}::${mot}}}`;
    setRecto(recto.slice(0, debut) + insere + recto.slice(fin));
    requestAnimationFrame(() => {
      champ.focus();
      champ.setSelectionRange(debut + insere.length, debut + insere.length);
    });
  }
  const [motif, setMotif] = useState("");
  const [apercu, setApercu] = useState<{ recto: string; verso: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const modeEdition = carte !== undefined;

  async function enregistrer() {
    setErreur(null);
    demarrer(async () => {
      const r = modeEdition
        ? await modifierCarte(carte!.id, recto, versoFinal, motif)
        : await ajouterCarte(deckId, recto, versoFinal);
      if (!r.ok) { setErreur(r.erreur); return; }
      if (!modeEdition) { setRecto(""); setVerso(""); setApercu(null); }
      onFini?.();
      router.refresh();
    });
  }

  async function voirApercu() {
    const [a, b] = await Promise.all([previsualiser(recto), previsualiser(versoFinal === VERSO_VIDE ? "" : versoFinal)]);
    if (a.ok && b.ok) setApercu({ recto: a.data.html, verso: b.data.html });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="radiogroup" aria-label="Type de carte">
        <button type="button" role="radio" aria-checked={type === "basique"} className="puce"
                onClick={() => setType("basique")}>Question / réponse</button>
        <button type="button" role="radio" aria-checked={type === "trous"} className="puce"
                onClick={() => setType("trous")}>Texte à trous</button>
      </div>

      {type === "trous" ? (
        <>
          <ChampCarte label="Texte" valeur={recto} onChange={setRecto} champRef={rectoRef}
                      placeholder="Écrivez la phrase, sélectionnez un mot puis « Masquer la sélection »." />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={masquerSelection}
                    className="puce">
              Masquer la sélection
            </button>
            <span className="text-[13px] text-[var(--muted-foreground)]">
              {trous} trou{trous > 1 ? "s" : ""} · révélés un par un, au hasard
            </span>
          </div>
          <ChampCarte label="Remarque (facultatif)" valeur={verso} onChange={setVerso}
                      placeholder="Affichée une fois tous les trous révélés" />
        </>
      ) : (
        <>
          <ChampCarte label="Recto" valeur={recto} onChange={setRecto} champRef={rectoRef}
                      placeholder="Question. LaTeX : $f'(x)$ ou $$\int_0^1 f$$" />
          <ChampCarte label="Verso" valeur={verso} onChange={setVerso}
                      placeholder="Réponse" />
        </>
      )}

      {modeEdition && (
        <input
          value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={200}
          placeholder="Motif de la correction (visible dans l’historique)"
          className="w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[13px]
                     outline-none focus:border-[var(--ring)]"
        />
      )}

      {apercu && (
        <div className="rounded-[var(--radius-md)] border bg-[var(--muted)]/40 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">
            Aperçu
          </p>
          <div className="contenu-carte text-[15px]"
               dangerouslySetInnerHTML={{ __html: apercu.recto }} />
          <hr className="my-2" />
          {apercu.verso && (
            <div className="contenu-carte text-[15px]"
                 dangerouslySetInnerHTML={{ __html: apercu.verso }} />
          )}
        </div>
      )}

      {erreur && (
        <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={voirApercu}
                className="rounded-[var(--radius-md)] border px-3 py-2.5 text-[13px] font-medium">
          Aperçu
        </button>
        {onFini && (
          <button type="button" onClick={onFini}
                  className="rounded-[var(--radius-md)] border px-3 py-2.5 text-[13px] font-medium">
            Annuler
          </button>
        )}
        <button
          type="button" onClick={enregistrer}
          disabled={enCours || !pret}
          className="flex-1 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2.5
                     text-[13px] font-semibold text-[var(--primary-foreground)]
                     disabled:opacity-40"
        >
          {enCours ? "…" : modeEdition ? "Enregistrer la correction" : "Ajouter la carte"}
        </button>
      </div>
    </div>
  );
}

function ChampCarte({
  label, valeur, onChange, placeholder, champRef,
}: {
  label: string; valeur: string; onChange: (v: string) => void; placeholder: string;
  champRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const refLocale = useRef<HTMLTextAreaElement>(null);
  const ref = champRef ?? refLocale;
  const [envoiImage, setEnvoiImage] = useState(false);

  async function televerser(fichier: File) {
    setEnvoiImage(true);
    try {
      const fd = new FormData();
      fd.append("image", fichier);
      const res = await fetch("/api/fiches/image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { window.alert(data.erreur ?? "Image refusée"); return; }
      // Insère le Markdown à la position du curseur.
      const champ = ref.current;
      const position = champ?.selectionStart ?? valeur.length;
      onChange(valeur.slice(0, position) + data.markdown + valeur.slice(position));
    } finally {
      setEnvoiImage(false);
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-[13px] font-medium">{label}</label>
        <label className="cursor-pointer text-[11px] text-[var(--primary)]">
          {envoiImage ? "envoi…" : "+ image"}
          <input
            type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void televerser(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <textarea
        ref={ref}
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          // Une capture d'écran collée devient directement une image.
          const image = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
          const f = image?.getAsFile();
          if (f) { e.preventDefault(); void televerser(f); }
        }}
        rows={3}
        maxLength={8000}
        placeholder={placeholder}
        className="mt-1 w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                   outline-none focus:border-[var(--ring)]"
      />
    </div>
  );
}
