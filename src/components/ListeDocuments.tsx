"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { restaurerDocument, supprimerDocument } from "@/lib/actions-documents";

export type DocVue = {
  id: number; original_name: string; mime: string; taille: number;
  matiere: string | null; chapitre: string | null; tags: string[];
  uploader: string; uploaded_by: string; created_at: string;
  deleted_at: string | null; purge_after: string | null;
};

function icone(mime: string) {
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "IMG";
  if (mime.includes("word")) return "DOC";
  if (mime.includes("sheet")) return "XLS";
  if (mime.includes("presentation")) return "PPT";
  if (mime.includes("zip")) return "ZIP";
  return "FIC";
}

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

  if (documents.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] border border-dashed p-6 text-center text-[13px]
                    text-[var(--muted-foreground)]">
        {corbeille ? "Corbeille vide." : "Aucun document ici."}
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {documents.map((d) => {
          const previsualisable = d.mime === "application/pdf" || d.mime.startsWith("image/");
          const peutSupprimer = estAdmin || d.uploaded_by === moi;

          return (
            <li key={d.id} className="rounded-[var(--radius-md)] border bg-[var(--card)] p-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded-[var(--radius-sm)] bg-[var(--muted)]
                                 px-1.5 py-1 text-[9px] font-bold tracking-wide
                                 text-[var(--muted-foreground)]">
                  {icone(d.mime)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{d.original_name}</p>
                  <p className="tabular text-[11px] text-[var(--muted-foreground)]">
                    {taille(d.taille)} · {d.uploader} ·{" "}
                    {new Date(d.created_at).toLocaleDateString("fr-FR",
                      { day: "2-digit", month: "2-digit", year: "2-digit" })}
                    {d.matiere && ` · ${d.matiere}`}
                    {d.chapitre && ` — ${d.chapitre}`}
                  </p>

                  {d.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.tags.map((t) => (
                        <span key={t} className="rounded-full bg-[var(--secondary)] px-2 py-0.5
                                                 text-[10px] text-[var(--secondary-foreground)]">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {corbeille && d.purge_after && (
                    <p className="mt-1 text-[11px] text-[var(--destructive)]">
                      Effacement définitif le{" "}
                      {new Date(d.purge_after).toLocaleDateString("fr-FR")}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                    {corbeille ? (
                      peutSupprimer && (
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await restaurerDocument(d.id);
                            if (r.ok) router.refresh(); else window.alert(r.erreur);
                          }}
                          className="font-medium text-[var(--primary)]"
                        >
                          Restaurer
                        </button>
                      )
                    ) : (
                      <>
                        {previsualisable && (
                          <button type="button" onClick={() => setApercu(d)}
                                  className="font-medium text-[var(--primary)]">
                            Aperçu
                          </button>
                        )}
                        <a href={`/api/documents/${d.id}?dl=1`}
                           className="text-[var(--muted-foreground)]">
                          Télécharger
                        </a>
                        {peutSupprimer && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm(
                                `Supprimer « ${d.original_name} » ?\n\n` +
                                "Le fichier restera récupérable 30 jours dans la corbeille."
                              )) return;
                              const r = await supprimerDocument(d.id);
                              if (r.ok) router.refresh(); else window.alert(r.erreur);
                            }}
                            className="text-[var(--destructive)]"
                          >
                            Supprimer
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
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
      <div className="flex items-center gap-3 border-b px-4 py-2.5">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{doc.original_name}</p>
        <a href={`/api/documents/${doc.id}?dl=1`}
           className="shrink-0 text-[12px] font-medium text-[var(--primary)]">
          Télécharger
        </a>
        <button type="button" onClick={onFermer}
                className="shrink-0 rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12px]">
          Fermer
        </button>
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
