"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activerToilet, supprimerPassage } from "@/lib/actions-toilet";

/** Partage du lien secret : feuille de partage du téléphone, sinon presse-papiers. */
export function PartagerLien({ chemin }: { chemin: string }) {
  const [copie, setCopie] = useState(false);

  async function partager() {
    const url = new URL(chemin, location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Toilet!", text: "Rejoins le classement des toilettes du bas 🚽", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch { /* partage annulé */ }
  }

  return (
    <button type="button" onClick={partager} className="lien-discret">
      {copie ? "Lien copié !" : "Inviter quelqu’un (lien secret)"}
    </button>
  );
}

export function BoutonActiver({ code }: { code: string }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <>
      <button type="button" disabled={enCours} className="bouton-principal"
              onClick={() => demarrer(async () => {
                const r = await activerToilet(code);
                if (r.ok) router.replace("/toilet"); else setErreur(r.erreur);
              })}>
        {enCours ? "Ouverture…" : "Entrer dans le petit coin"}
      </button>
      {erreur && <p role="alert" className="mt-3 text-[13px] font-medium text-[var(--destructive)]">{erreur}</p>}
    </>
  );
}

export function SupprimerPassage({ id }: { id: number }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  return (
    <button type="button" disabled={enCours} aria-label="Supprimer ce passage"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)]
                       hover:bg-[var(--muted)] disabled:opacity-40"
            onClick={() => {
              if (!window.confirm("Supprimer ce passage ?")) return;
              demarrer(async () => {
                const r = await supprimerPassage(id);
                if (!r.ok) window.alert(r.erreur); else router.refresh();
              });
            }}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
      </svg>
    </button>
  );
}
