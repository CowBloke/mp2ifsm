"use client";

import { useCallback, useEffect, useState } from "react";
import { NOMS_COULEURS, type Contributeur, type InfoPixel, type Zone } from "@/lib/place/commun";

/*
 * Outils de modération de La Toile, visibles des seuls administrateurs
 * (le serveur revérifie le rôle à chaque appel).
 */

type Props = {
  etat: { delai: number; gelee: boolean };
  sansDelai: boolean; setSansDelai: (v: boolean) => void;
  modeZone: boolean; setModeZone: (v: boolean) => void;
  zone: Zone | null;
  couleur: number | null;
  info: InfoPixel | null;
};

export function Moderation({ etat, sansDelai, setSansDelai, modeZone, setModeZone, zone, couleur, info }: Props) {
  const [membres, setMembres] = useState<Contributeur[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [delaiMin, setDelaiMin] = useState(String(etat.delai / 60));
  const [retour, setRetour] = useState("30");

  useEffect(() => { setDelaiMin(String(etat.delai / 60)); }, [etat.delai]);

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/toile/admin", { cache: "no-store" });
      if (r.ok) setMembres((await r.json()).contributeurs);
    } catch { /* bouton Actualiser */ }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  async function agir(corps: Record<string, unknown>, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    setOccupe(true);
    setMessage(null);
    try {
      const r = await fetch("/api/toile/admin", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erreur || "Action refusée");
      setMessage({ ok: true, texte: typeof d.modifies === "number" ? `${d.modifies} pixel${d.modifies > 1 ? "s" : ""} modifié${d.modifies > 1 ? "s" : ""}` : "C’est fait" });
      charger();
    } catch (err) {
      setMessage({ ok: false, texte: err instanceof Error ? err.message : "Action refusée" });
    } finally {
      setOccupe(false);
    }
  }

  const minutesRetour = Math.trunc(Number(retour));
  const retourValide = Number.isInteger(minutesRetour) && minutesRetour >= 1;
  const taille = zone ? (zone.x1 - zone.x0 + 1) * (zone.y1 - zone.y0 + 1) : 0;
  const auteur = info?.nature === "pixel" && info.auteur?.id ? info.auteur : null;

  return (
    <section className="mt-6 flex flex-col gap-6 rounded-[var(--radius-lg)] border border-[var(--hairline)] p-4"
             aria-labelledby="moderation-titre">
      <div className="flex items-center justify-between gap-3">
        <h2 id="moderation-titre" className="m-0 text-[17px] font-semibold">Modération</h2>
        <span className="text-[13px] text-[var(--muted-foreground)]">Administrateurs</span>
      </div>

      {message && (
        <p role="status" className={`m-0 text-[14px] ${message.ok ? "text-[var(--muted-foreground)]" : "text-[var(--destructive)]"}`}>
          {message.texte}
        </p>
      )}

      {/* Réglages généraux */}
      <div className="flex flex-col gap-3">
        <div className="page-toolbar">
          <button type="button" className="puce" aria-pressed={etat.gelee} disabled={occupe}
                  onClick={() => agir({ action: "regler", gelee: !etat.gelee },
                    etat.gelee ? undefined : "Geler la toile ? Plus personne ne pourra poser de pixel.")}>
            {etat.gelee ? "Toile gelée — dégeler" : "Geler la toile"}
          </button>
          <button type="button" className="puce" disabled={occupe}
                  onClick={() => agir({ action: "leverDelai", membre: null }, "Remettre à zéro l’attente de tout le monde ?")}>
            Lever toutes les attentes
          </button>
        </div>
        <form className="flex items-center gap-2"
              onSubmit={e => {
                e.preventDefault();
                const s = Math.round(Number(delaiMin.replace(",", ".")) * 60);
                if (Number.isFinite(s)) agir({ action: "regler", delai: s });
              }}>
          <label htmlFor="toile-delai" className="whitespace-nowrap text-[14px]">Délai par pixel</label>
          <input id="toile-delai" className="champ w-24" inputMode="decimal" value={delaiMin}
                 onChange={e => setDelaiMin(e.target.value)} />
          <span className="text-[14px] text-[var(--muted-foreground)]">min</span>
          <button type="submit" className="puce" disabled={occupe}>Enregistrer</button>
        </form>
        <label className="flex items-center gap-3 text-[14px]">
          <input type="checkbox" checked={sansDelai} onChange={e => setSansDelai(e.target.checked)} className="h-5 w-5" />
          Pinceau admin : sans délai, même toile gelée (marqué « modération »)
        </label>
      </div>

      {/* Pixel sélectionné */}
      {auteur && (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-[15px] font-semibold">Auteur du pixel ({info!.x}, {info!.y}) : {auteur.nom}</h3>
          <div className="page-toolbar">
            <button type="button" className="puce" disabled={occupe}
                    onClick={() => agir({ action: "annulerMembre", membre: auteur.id, minutes: 60 },
                      `Annuler les pixels posés par ${auteur.nom} dans la dernière heure ?`)}>
              Annuler sa dernière heure
            </button>
            <button type="button" className="puce" disabled={occupe}
                    onClick={() => agir({ action: "bannir", membre: auteur.id, banni: true },
                      `Retirer à ${auteur.nom} le droit de poser des pixels ?`)}>
              Bannir
            </button>
          </div>
        </div>
      )}

      {/* Zone */}
      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-[15px] font-semibold">Zone</h3>
        <div className="page-toolbar">
          <button type="button" className="puce" aria-pressed={modeZone} onClick={() => setModeZone(!modeZone)}>
            {modeZone ? "Sélection de zone active" : "Sélectionner une zone"}
          </button>
          {modeZone && (
            <span className="text-[13px] text-[var(--muted-foreground)]">
              {zone ? `${taille} pixel${taille > 1 ? "s" : ""}` : "Touche deux coins sur la toile"}
            </span>
          )}
        </div>
        {modeZone && zone && (
          <div className="flex flex-col gap-3">
            <div className="page-toolbar">
              <button type="button" className="puce" disabled={occupe}
                      onClick={() => agir({ action: "remplir", zone, couleur: 0 }, `Effacer ${taille} pixels (blanc) ?`)}>
                Effacer
              </button>
              <button type="button" className="puce" disabled={occupe || couleur === null || couleur === 0}
                      onClick={() => agir({ action: "remplir", zone, couleur },
                        `Remplir ${taille} pixels en ${NOMS_COULEURS[couleur!]?.toLowerCase()} ?`)}>
                Remplir avec la couleur choisie
              </button>
            </div>
            <form className="flex flex-wrap items-center gap-2"
                  onSubmit={e => {
                    e.preventDefault();
                    if (retourValide) agir({ action: "restaurer", zone, minutes: minutesRetour },
                      `Remettre la zone comme elle était il y a ${minutesRetour} min ?`);
                  }}>
              <label htmlFor="toile-retour" className="text-[14px]">Remettre comme il y a</label>
              <input id="toile-retour" className="champ w-20" inputMode="numeric" value={retour}
                     onChange={e => setRetour(e.target.value)} />
              <span className="text-[14px] text-[var(--muted-foreground)]">min</span>
              <button type="submit" className="puce" disabled={occupe || !retourValide}>Restaurer</button>
            </form>
          </div>
        )}
      </div>

      {/* Membres */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-[15px] font-semibold">Joueurs</h3>
          <button type="button" className="lien-discret" onClick={charger}>Actualiser</button>
        </div>
        {membres === null ? (
          <p className="m-0 text-[14px] text-[var(--muted-foreground)]">Chargement…</p>
        ) : membres.length === 0 ? (
          <p className="m-0 text-[14px] text-[var(--muted-foreground)]">Personne n’a encore joué.</p>
        ) : membres.map(m => (
          <div key={m.id} className="ligne flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="ligne__titre">{m.nom}{m.banni && <span className="ml-2 text-[13px] text-[var(--destructive)]">banni</span>}</div>
              <div className="ligne__meta">{m.heure} cette heure · {m.total} au total</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="puce" disabled={occupe}
                      onClick={() => agir({ action: "bannir", membre: m.id, banni: !m.banni },
                        m.banni ? undefined : `Retirer à ${m.nom} le droit de poser des pixels ?`)}>
                {m.banni ? "Débannir" : "Bannir"}
              </button>
              <button type="button" className="puce" disabled={occupe || m.total === 0}
                      onClick={() => agir({ action: "annulerMembre", membre: m.id, minutes: 60 },
                        `Annuler les pixels de ${m.nom} de la dernière heure ?`)}>
                Annuler 1 h
              </button>
              <button type="button" className="puce" disabled={occupe || m.total === 0}
                      onClick={() => agir({ action: "annulerMembre", membre: m.id, minutes: null },
                        `Annuler TOUS les pixels de ${m.nom} ?`)}>
                Tout annuler
              </button>
              <button type="button" className="puce" disabled={occupe}
                      onClick={() => agir({ action: "leverDelai", membre: m.id })}>
                Lever l’attente
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
