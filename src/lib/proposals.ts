import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, tx } from "./db";

export const proposalSchema = z.object({
 question: z.string().trim().min(8, "Question trop courte (8 caractères minimum)").max(200),
 description: z.string().trim().min(1, "Précisez comment le pari sera tranché").max(1000),
 closesAt: z.string().datetime({ offset: true }).refine(v => Date.parse(v) > Date.now(), "La fermeture doit être dans le futur"),
 issues: z.array(z.string().trim().min(1).max(60)).min(2).max(10)
   .refine(v => new Set(v.map(s => s.toLocaleLowerCase('fr'))).size === v.length, "Les issues doivent être différentes"),
});
export type Proposal = {
 id: number; user_id: string; display_name: string; question: string; description: string;
 closes_at: string; issues: string[]; status: 'pending'|'approved'|'rejected'; review_note: string; slug: string|null;
};
export async function proposals(userId?: string) {
 return query<Proposal>(`select p.*, u.display_name, m.slug from market_proposal p
 join app_user u on u.id=p.user_id left join market m on m.id=p.market_id
 ${userId ? 'where p.user_id=$1' : ''} order by (p.status='pending') desc,p.created_at desc`, userId ? [userId] : []);
}
export async function submitProposal(userId: string, input: unknown) {
 const p = proposalSchema.parse(input);
 return tx(async c => {
  await c.query('select id from app_user where id=$1 for update', [userId]);
  const count = await c.query("select count(*)::int as n from market_proposal where user_id=$1 and status='pending'", [userId]);
  if (count.rows[0].n >= 10) throw new Error('Vous avez déjà 10 propositions en attente');
  await c.query(`insert into market_proposal(user_id,question,description,closes_at,issues) values($1,$2,$3,$4,$5)`,
   [userId,p.question,p.description,p.closesAt,p.issues]);
 });
}
export async function reviewProposal(adminId: string, id: number, approve: boolean, note: string) {
 return tx(async c => {
  const role = await c.query("select 1 from app_user where id=$1 and role='admin'", [adminId]);
  if (!role.rowCount) throw new Error('Accès réservé aux administrateurs');
  const row = await c.query<Proposal>('select * from market_proposal where id=$1 for update', [id]);
  const p = row.rows[0];
  if (!p || p.status !== 'pending') throw new Error('Cette proposition a déjà été traitée ou n’existe plus');
  let marketId: number|null = null;
  if (approve) {
   if (new Date(p.closes_at).getTime() <= Date.now()) throw new Error('La date de fermeture est dépassée : refusez cette proposition et demandez une nouvelle date');
   const slug = `pari-${randomUUID()}`;
   const m = await c.query(`insert into market(slug,question,description,closes_at,created_by) values($1,$2,$3,$4,$5) returning id`, [slug,p.question,p.description,p.closes_at,adminId]);
   marketId = m.rows[0].id;
   for (const [i,label] of p.issues.entries()) await c.query('insert into outcome(market_id,label,position) values($1,$2,$3)', [marketId,label,i]);
  }
  await c.query(`update market_proposal set status=$2,reviewed_by=$3,reviewed_at=now(),review_note=$4,market_id=$5 where id=$1`,
   [id,approve?'approved':'rejected',adminId,note,marketId]);
 });
}
