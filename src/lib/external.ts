import "server-only";
import { query, queryOne, tx } from "./db";

/*
 * Source externe des depots.
 *
 * ATTENTION — hypothese a valider : l'API du site de la classe n'etait
 * pas specifiee au moment de l'ecriture. Tout ce qui la concerne est
 * isole derriere l'interface `FournisseurDepots` ci-dessous. Brancher
 * le vrai service revient a ecrire une implementation de cette
 * interface et a la nommer dans DEPOSIT_PROVIDER ; rien d'autre dans
 * l'application ne connait le format distant.
 *
 * Contrat indispensable cote amont : chaque paiement doit exposer un
 * identifiant stable et unique (`source_ref`). C'est lui qui rend le
 * tirage idempotent — on peut rejouer tout l'historique sans jamais
 * crediter deux fois (contrainte UNIQUE sur external_deposit.source_ref).
 */

export type PaiementExterne = {
  /** Identifiant unique et stable du paiement chez le fournisseur. */
  sourceRef: string;
  /** Email du membre, tel que connu du site externe. */
  email: string;
  /** Montant en centimes, entier strictement positif. */
  montantCentimes: number;
};

export interface FournisseurDepots {
  readonly nom: string;
  /** Paiements survenus depuis `depuis` (exclu). */
  listerPaiements(depuis: Date | null): Promise<PaiementExterne[]>;
}

/* --- Implementation de test ----------------------------------------
 * Ne credite rien : elle existe pour que l'application tourne (et que
 * le cron soit testable) sans service distant.
 */
class FournisseurMock implements FournisseurDepots {
  readonly nom = "mock";
  async listerPaiements(): Promise<PaiementExterne[]> {
    return [];
  }
}

/* --- Implementation HTTP generique ---------------------------------
 * Attend une reponse JSON : { payments: [{ id, email, amount_cents }] }.
 * Adapter le mapping ci-dessous au format reel une fois connu.
 */
class FournisseurHttp implements FournisseurDepots {
  readonly nom = "http";

  constructor(
    private readonly base: string,
    private readonly token: string,
  ) {}

  async listerPaiements(depuis: Date | null): Promise<PaiementExterne[]> {
    const url = new URL("/api/payments", this.base);
    if (depuis) url.searchParams.set("since", depuis.toISOString());

    const res = await fetch(url, {
      headers: { authorization: `Bearer ${this.token}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`fournisseur de depots: HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      payments?: Array<{ id?: unknown; email?: unknown; amount_cents?: unknown }>;
    };

    return (data.payments ?? []).flatMap((p) => {
      const montant = Number(p.amount_cents);
      // On ignore silencieusement les lignes inexploitables plutot que
      // d'interrompre tout le tirage pour un enregistrement douteux.
      if (typeof p.id !== "string" || typeof p.email !== "string") return [];
      if (!Number.isSafeInteger(montant) || montant <= 0) return [];
      return [{ sourceRef: p.id, email: p.email, montantCentimes: montant }];
    });
  }
}

export function fournisseur(): FournisseurDepots {
  const choix = process.env.DEPOSIT_PROVIDER ?? "mock";
  if (choix === "http") {
    const base = process.env.DEPOSIT_API_BASE;
    const token = process.env.DEPOSIT_API_TOKEN;
    if (!base || !token) {
      throw new Error("DEPOSIT_API_BASE et DEPOSIT_API_TOKEN sont requis");
    }
    return new FournisseurHttp(base, token);
  }
  return new FournisseurMock();
}

export type ResultatSync = {
  vus: number;
  credites: number;
  ignores: number;
  inconnus: string[];
};

/**
 * Tire les paiements et les inscrit au grand livre.
 *
 * Chaque paiement est traite dans sa propre transaction : un membre
 * inconnu ou un montant refuse n'empeche pas les autres d'etre credites.
 * record_deposit() est idempotente par source_ref, donc relancer ce
 * tirage — meme en parallele — ne peut pas crediter deux fois.
 */
export async function synchroniserDepots(): Promise<ResultatSync> {
  const src = fournisseur();

  const dernier = await queryOne<{ pulled_at: string | null }>(
    `select max(pulled_at) as pulled_at from external_deposit`,
  );
  const depuis = dernier?.pulled_at ? new Date(dernier.pulled_at) : null;

  const paiements = await src.listerPaiements(depuis);
  const resultat: ResultatSync = { vus: paiements.length, credites: 0, ignores: 0, inconnus: [] };

  for (const p of paiements) {
    const membre = await queryOne<{ id: string }>(
      `select id from app_user where lower(email) = lower($1)`,
      [p.email],
    );
    if (!membre) {
      resultat.inconnus.push(p.email);
      resultat.ignores += 1;
      continue;
    }

    try {
      const avant = await query<{ n: number }>(
        `select count(*)::int as n from external_deposit where source_ref = $1`,
        [p.sourceRef],
      );
      if (avant[0]?.n > 0) {
        resultat.ignores += 1;
        continue;
      }

      await tx(async (c) => {
        await c.query(`select record_deposit($1::uuid, $2::bigint, $3::text)`, [
          membre.id,
          p.montantCentimes,
          p.sourceRef,
        ]);
      });
      resultat.credites += 1;
    } catch (err) {
      // Un paiement fautif est journalise et saute ; le tirage continue.
      console.error(`depot ${p.sourceRef} refuse:`, err);
      resultat.ignores += 1;
    }
  }

  return resultat;
}
