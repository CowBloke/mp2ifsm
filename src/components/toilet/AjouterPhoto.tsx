"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { reduirePhoto } from "./photo";

/*
 * « Ajouter la photo » sur un passage déjà enregistré : ouvre la
 * pellicule (pas d'attribut capture), pour envoyer la preuve une fois
 * revenu là où le wifi passe.
 */
export function AjouterPhoto({ passageId }: { passageId: number }) {
  const router = useRouter();
  const entree = useRef<HTMLInputElement>(null);
  const [etat, setEtat] = useState<"repos" | "envoi" | "fait">("repos");
  const [erreur, setErreur] = useState<string | null>(null);

  async function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErreur(null);
    setEtat("envoi");
    try {
      let photo;
      try { photo = await reduirePhoto(f); }
      catch { setErreur("Photo illisible — essayez-en une autre"); setEtat("repos"); return; }
      const fd = new FormData();
      fd.set("photo", photo.blob, "preuve.jpg");
      const res = await fetch(`/api/toilet/passage/${passageId}/photo`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErreur(data.erreur ?? "Envoi impossible"); setEtat("repos"); return; }
      setEtat("fait");
      router.refresh();
    } catch {
      setErreur("Connexion trop faible, réessayez plus tard.");
      setEtat("repos");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input ref={entree} type="file" accept="image/*" onChange={choisir}
             className="sr-only" tabIndex={-1} aria-hidden="true" />
      <button type="button" disabled={etat !== "repos"} onClick={() => entree.current?.click()}
              className="puce shrink-0 disabled:opacity-50">
        {etat === "envoi" ? "Envoi…" : etat === "fait" ? "Ajoutée ✅" : "📷 Ajouter la photo"}
      </button>
      {erreur && <p role="alert" className="text-right text-[12px] font-medium text-[var(--destructive)]">{erreur}</p>}
    </div>
  );
}
