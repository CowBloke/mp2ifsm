"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { restaurerDocument, supprimerDocument } from "@/lib/actions-documents";

export type DocVue = {
  id: number; original_name: string; mime: string; taille: number;
  matiere: string | null; couleur: string | null; chapitre: string | null; tags: string[];
  uploader: string; uploaded_by: string; created_at: string;
  deleted_at: string | null; purge_after: string | null;
};

function taille(o: number): string {
  if (o < 1024) return `${o} o`;
  const u = ["ko", "Mo", "Go"];
  let v = o / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0).replace(".", ",")} ${u[i]}`;
}

/*
 * Liste de documents. Les PDF et les images s'ouvrent dans un aperçu
 * intégré ; le reste se télécharge. Rien n'est servi par une URL
 * devinable : la route vérifie la session à chaque requête.
 */
export function ListeDocuments({
  documents, moi, estAdmin, corbeille = false,
}: {
  documents: DocVue[]; moi: string; estAdmin: boolean; corbeille?: boolean;
}) {
  const router = useRouter();
  const [apercu, setApercu] = useState<DocVue | null>(null);
  const [actions, setActions] = useState<number | null>(null);

  if (documents.length === 0) {
    return (
      <p className="text-[15px] text-[var(--muted-foreground)]">
        {corbeille ? "Corbeille vide." : "Aucun document ici."}
      </p>
    );
  }

  return (
    <>
      <ul>
        {documents.map((d) => {
          const previsualisable = d.mime === "application/pdf" || d.mime.startsWith("image/");
          const peutSupprimer = estAdmin || d.uploaded_by === moi;
          const deplie = actions === d.id;
          const meta = [
            d.matiere, taille(d.taille),
            new Date(d.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
          ].filter(Boolean).join(" · ");

          const corps = (
            <>
              <span aria-hidden="true"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--muted)]
                               text-[var(--muted-foreground)]">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                     strokeWidth="1.7" strokeLinejoin="round"><path d="M13 3H6v18h12V8zM13 3v5h5" /></svg>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                <span className="truncate text-[15px] font-medium">{d.original_name}</span>
                <span className="truncate text-[13px] text-[var(--muted-foreground)]">{meta}</span>
              </span>
            </>
          );

          return (
            <li key={d.id} className="border-b last:border-b-0">
              <div className="flex min-h-16 items-center gap-2">
                {corbeille ? (
                  <div className="flex min-w-0 flex-1 items-center gap-3.5 py-2">{corps}</div>
                ) : previsualisable ? (
                  <button type="button" onClick={() => setApercu(d)}
                          className="flex min-w-0 flex-1 items-center gap-3.5 py-2">{corps}</button>
                ) : (
                  <a href={`/api/documents/${d.id}?dl=1`}
                     className="flex min-w-0 flex-1 items-center gap-3.5 py-2">{corps}</a>
                )}
                <button type="button" aria-expanded={deplie}
                        aria-label={`Actions pour ${d.original_name}`}
                        onClick={() => setActions(deplie ? null : d.id)}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full
                                   text-[var(--muted-foreground)] hover:bg-[var(--muted)]">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
                  </svg>
                </button>
              </div>

              {deplie && (
                <div className="flex flex-col gap-1 pb-3 pl-[50px] text-[13px] text-[var(--muted-foreground)]">
                  <p>
                    Déposé par {d.uploader}{d.chapitre && ` · ${d.chapitre}`}
                    {d.tags.length > 0 && ` · ${d.tags.join(", ")}`}
                  </p>
                  {corbeille && d.purge_after && (
                    <p className="text-[var(--destructive)]">
                      Effacement définitif le {new Date(d.purge_after).toLocaleDateString("fr-FR")}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-5">
                    {corbeille ? (
                      peutSupprimer && (
                        <button type="button" className="lien-discret"
                                onClick={async () => {
                                  const r = await restaurerDocument(d.id);
                                  if (r.ok) router.refresh(); else window.alert(r.erreur);
                                }}>
                          Restaurer
                        </button>
                      )
                    ) : (
                      <>
                        <a href={`/api/documents/${d.id}?dl=1`} className="lien-discret">Télécharger</a>
                        {peutSupprimer && (
                          <button type="button" className="lien-discret text-[var(--destructive)]"
                                  onClick={async () => {
                                    if (!window.confirm(
                                      `Supprimer « ${d.original_name} » ?\n\n` +
                                      "Le fichier restera récupérable 30 jours dans la corbeille."
                                    )) return;
                                    const r = await supprimerDocument(d.id);
                                    if (r.ok) router.refresh(); else window.alert(r.erreur);
                                  }}>
                            Supprimer
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {apercu && <Apercu doc={apercu} onFermer={() => setApercu(null)} />}
    </>
  );
}

/** Visionneuse plein écran : PDF et images restent dans la page. */
function Apercu({ doc, onFermer }: { doc: DocVue; onFermer: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} onCancel={onFermer}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none flex-col bg-[var(--background)] text-[var(--foreground)] open:flex"
      role="dialog" aria-modal="true" aria-label={`Aperçu de ${doc.original_name}`}
    >
      <div className="flex items-center gap-3 border-b px-4 py-2 lg:px-6">
        <button type="button" onClick={onFermer} aria-label="Fermer l’aperçu"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-[var(--muted)]">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <p className="min-w-0 flex-1 truncate text-[15px] font-medium">{doc.original_name}</p>
        <a href={`/api/documents/${doc.id}?dl=1`} className="lien-discret shrink-0">Télécharger</a>
      </div>

      {doc.mime.startsWith("image/") ? (
        <div className="flex-1 overflow-auto p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/documents/${doc.id}`} alt={doc.original_name}
               className="mx-auto max-w-full" />
        </div>
      ) : (
        <iframe
          src={`/api/documents/${doc.id}`}
          title={doc.original_name}
          className="flex-1 border-0"
        />
      )}
    </dialog>
  );
}
