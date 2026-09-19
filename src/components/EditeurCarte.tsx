"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ajouterCarte, modifierCarte, previsualiser } from "@/lib/actions-fiches";

/*
 * Éditeur de carte : recto / verso, LaTeX et images.
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
  const [recto, setRecto] = useState(carte?.recto ?? "");
  const [verso, setVerso] = useState(carte?.verso ?? "");
  const [motif, setMotif] = useState("");
  const [apercu, setApercu] = useState<{ recto: string; verso: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const modeEdition = carte !== undefined;

  async function enregistrer() {
    setErreur(null);
    demarrer(async () => {
      const r = modeEdition
        ? await modifierCarte(carte!.id, recto, verso, motif)
        : await ajouterCarte(deckId, recto, verso);
      if (!r.ok) { setErreur(r.erreur); return; }
      if (!modeEdition) { setRecto(""); setVerso(""); setApercu(null); }
      onFini?.();
      router.refresh();
    });
  }

  async function voirApercu() {
    const [a, b] = await Promise.all([previsualiser(recto), previsualiser(verso)]);
    if (a.ok && b.ok) setApercu({ recto: a.data.html, verso: b.data.html });
  }

  return (
    <div className="space-y-2">
      <ChampCarte label="Recto" valeur={recto} onChange={setRecto}
                  placeholder="Question. LaTeX : $f'(x)$ ou $$\int_0^1 f$$" />
      <ChampCarte label="Verso" valeur={verso} onChange={setVerso}
                  placeholder="Réponse" />

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
          <div className="contenu-carte text-[15px]"
               dangerouslySetInnerHTML={{ __html: apercu.verso }} />
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
          disabled={enCours || !recto.trim() || !verso.trim()}
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
  label, valeur, onChange, placeholder,
}: {
  label: string; valeur: string; onChange: (v: string) => void; placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
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
