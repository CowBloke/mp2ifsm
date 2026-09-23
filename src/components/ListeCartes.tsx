"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EditeurCarte } from "./EditeurCarte";
import {
  historiqueCarteAction, signalerCarte, supprimerCarte,
  type RevisionRendue,
} from "@/lib/actions-fiches";

export type CarteRendueListe = {
  id: number;
  recto: string;
  verso: string;
  rectoHtml: string;
  versoHtml: string;
  auteur: string;
  author_id: string;
  created_at: string;
  revisions: number;
  signalements: number;
  etat: string | null;
};

const LIBELLE_ETAT: Record<string, string> = {
  New: "nouvelle", Learning: "en apprentissage",
  Review: "acquise", Relearning: "à reprendre",
};

/*
 * Liste des cartes d'un paquet.
 *
 * Chaque carte affiche son auteur, permet de signaler une erreur, de
 * corriger, et d'ouvrir son historique : une carte fausse se retrace
 * et se répare, elle ne se corrompt pas en silence.
 */
export function ListeCartes({
  cartes, deckId, moi, estAdmin,
}: {
  cartes: CarteRendueListe[];
  deckId: number;
  moi: string;
  estAdmin: boolean;
}) {
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [edition, setEdition] = useState<number | null>(null);
  const [historique, setHistorique] = useState<Record<number, RevisionRendue[]>>({});
  const router = useRouter();

  if (cartes.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] border border-dashed p-6 text-center text-[13px]
                    text-[var(--muted-foreground)]">
        Ce paquet est vide. Ajoutez une première carte.
      </p>
    );
  }

  async function chargerHistorique(id: number) {
    if (historique[id]) return;
    const r = await historiqueCarteAction(id);
    if (r.ok) setHistorique((h) => ({ ...h, [id]: r.data }));
  }

  return (
    <ul className="page-grid page-grid--two items-start">
      {cartes.map((c) => {
        const peutModifier = estAdmin || c.author_id === moi;
        const estOuverte = ouverte === c.id;

        return (
          <li key={c.id} className="app-surface min-w-0 rounded-[var(--radius-md)] border">
            <button
              type="button"
              onClick={() => setOuverte(estOuverte ? null : c.id)}
              aria-expanded={estOuverte}
              className="w-full p-4 text-left"
            >
              <div className="contenu-carte text-[14px] font-medium"
                   dangerouslySetInnerHTML={{ __html: c.rectoHtml }} />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]
                              text-[var(--muted-foreground)]">
                <span>par {c.auteur}</span>
                {c.etat && <span>· {LIBELLE_ETAT[c.etat] ?? c.etat}</span>}
                {c.revisions > 1 && <span>· {c.revisions} versions</span>}
                {c.signalements > 0 && (
                  <span className="font-medium text-[var(--destructive)]">
                    · {c.signalements} signalement{c.signalements > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </button>

            {estOuverte && (
              <div className="border-t px-3 pb-3 pt-2">
                {edition === c.id ? (
                  <EditeurCarte
                    deckId={deckId}
                    carte={{ id: c.id, recto: c.recto, verso: c.verso }}
                    onFini={() => setEdition(null)}
                  />
                ) : (
                  <>
                    <div className="contenu-carte text-[14px]"
                         dangerouslySetInnerHTML={{ __html: c.versoHtml }} />

                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                      <button type="button" onClick={() => setEdition(c.id)}
                              className="font-medium text-[var(--primary)]">
                        Corriger
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const motif = window.prompt("Qu’est-ce qui ne va pas ?");
                          if (!motif || motif.trim().length < 3) return;
                          const r = await signalerCarte(c.id, motif);
                          window.alert(r.ok ? "Signalement envoyé" : r.erreur);
                        }}
                        className="text-[var(--muted-foreground)]"
                      >
                        Signaler
                      </button>
                      <button
                        type="button"
                        onClick={() => { void chargerHistorique(c.id); }}
                        className="text-[var(--muted-foreground)]"
                      >
                        Historique ({c.revisions})
                      </button>
                      {peutModifier && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm("Supprimer cette carte ?")) return;
                            const r = await supprimerCarte(c.id);
                            if (r.ok) router.refresh(); else window.alert(r.erreur);
                          }}
                          className="text-[var(--destructive)]"
                        >
                          Supprimer
                        </button>
                      )}
                    </div>

                    {historique[c.id] && (
                      <ol className="mt-3 space-y-2 border-t pt-2">
                        {historique[c.id].map((r, i) => (
                          <li key={r.id} className="text-[12px]">
                            <p className="text-[11px] text-[var(--muted-foreground)]">
                              {i === 0 ? "version actuelle" : `version ${historique[c.id].length - i}`}
                              {" — "}{r.auteur}{" — "}
                              {new Date(r.edited_at).toLocaleDateString("fr-FR", {
                                day: "2-digit", month: "2-digit", year: "2-digit",
                                hour: "2-digit", minute: "2-digit",
                              })}
                              {r.motif && ` — « ${r.motif} »`}
                            </p>
                            <div className="contenu-carte mt-0.5 opacity-80"
                                 dangerouslySetInnerHTML={{ __html: r.rectoHtml }} />
                            <div className="contenu-carte mt-1 border-t pt-1"
                                 dangerouslySetInnerHTML={{ __html: r.versoHtml }} />
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
