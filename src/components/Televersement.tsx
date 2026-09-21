"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChoixMatiere } from "@/components/Matiere";

/*
 * Dépôt d'un document.
 *
 * Passe par une route (et non une action serveur) parce qu'un fichier
 * peut peser plusieurs dizaines de Mo. La bannière de droits d'auteur
 * est affichée ici, et chaque fichier garde l'identité de son
 * déposant — c'est ce qui rend la règle applicable.
 */
export function Televersement({
  restant, matieres,
}: { restant: number; matieres: Array<{ id: number; nom: string }> }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(fd: FormData) {
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setErreur(data.erreur ?? "Envoi impossible"); return; }
      setOuvert(false);
      router.refresh();
    } catch {
      setErreur("Envoi impossible — réessayez");
    } finally {
      setEnCours(false);
    }
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        disabled={restant <= 0}
        className="w-full rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2.5 text-[14px]
                   font-semibold text-[var(--primary-foreground)] disabled:opacity-40"
      >
        {restant > 0 ? "+ Déposer un document" : "Quota atteint"}
      </button>
    );
  }

  return (
    <form action={envoyer} className="rounded-[var(--radius-lg)] border bg-[var(--card)] p-4">
      <h2 className="text-[15px] font-semibold">Déposer un document</h2>

      {/* Bannière de droits : visible avant le choix du fichier. */}
      <p className="mt-2 rounded-[var(--radius-md)] border-l-4 bg-[var(--muted)]/60 px-3 py-2
                    text-[12px] leading-snug"
         style={{ borderColor: "var(--outcome-4)" }}>
        <strong>Pas de contenu sous droits.</strong> Polycopiés, scans de manuels
        et annales sous licence ne doivent pas être déposés. Vos cours et vos
        corrigés personnels, oui. Chaque dépôt est enregistré avec votre nom.
      </p>

      <input
        type="file" name="fichier" required
        className="mt-3 w-full text-[13px] file:mr-3 file:rounded-[var(--radius-sm)]
                   file:border-0 file:bg-[var(--secondary)] file:px-3 file:py-1.5
                   file:text-[13px] file:font-medium"
      />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <ChoixMatiere matieres={matieres} />
        <input name="chapitre" maxLength={120} placeholder="Chapitre"
               className="rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                          outline-none focus:border-[var(--ring)]" />
      </div>

      <input name="tags" maxLength={200} placeholder="Mots-clés séparés par des virgules"
             className="mt-2 w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                        outline-none focus:border-[var(--ring)]" />

      {erreur && (
        <p role="alert" className="mt-2 text-[13px] font-medium text-[var(--destructive)]">
          {erreur}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setOuvert(false)}
                className="rounded-[var(--radius-md)] border px-4 py-2.5 text-[14px] font-medium">
          Annuler
        </button>
        <button type="submit" disabled={enCours}
                className="flex-1 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2.5
                           text-[14px] font-semibold text-[var(--primary-foreground)]
                           disabled:opacity-50">
          {enCours ? "Envoi…" : "Déposer"}
        </button>
      </div>
    </form>
  );
}
