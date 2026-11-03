"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdmin, exigerUtilisateur, hashMotDePasse } from "./session";
import { query, tx } from "./db";
import { proposalSchema, submitProposal, reviewProposal } from "./proposals";
import type { Reponse } from "./actions";
import { ErreurMetier, messageFr } from "./errors";

export async function proposerPari(input: unknown): Promise<Reponse> {
 try {
  const u = await exigerUtilisateur();
  const p = proposalSchema.safeParse(input);
  if (!p.success) return {ok:false,erreur:p.error.issues[0].message};
  await submitProposal(u.id,p.data);
  revalidatePath('/profil'); revalidatePath('/marche');
  return {ok:true};
 } catch (e) { return {ok:false,erreur:e instanceof Error && e.message.startsWith('Vous avez') ? e.message : messageFr(e)}; }
}
export async function examinerProposition(id: number, approve: boolean, note: string): Promise<Reponse> {
 try {
  const u = await exigerAdmin();
  if (!Number.isSafeInteger(id) || id <= 0 || typeof approve !== 'boolean' || typeof note !== 'string' || note.length > 500) return {ok:false,erreur:'Demande invalide'};
  try { await reviewProposal(u.id,id,approve,note.trim()); }
  catch(e) {
   if (e instanceof Error && /^(Cette proposition|La date de fermeture)/.test(e.message)) return {ok:false,erreur:e.message};
   throw e;
  }
  for (const path of ['/','/profil','/admin','/marche']) revalidatePath(path);
  return {ok:true};
 } catch(e) { return {ok:false,erreur:messageFr(e)}; }
}
export async function revoquerSessions(userId: string): Promise<Reponse> {
 try {
  const u = await exigerAdmin();
  if (!z.string().uuid().safeParse(userId).success || userId === u.id) return {ok:false,erreur:'Choisissez un autre compte'};
  await query('delete from user_session where user_id=$1',[userId]);
  revalidatePath('/profil'); return {ok:true};
 } catch(e) { return {ok:false,erreur:messageFr(e)}; }
}
/* Le mot de passe remplacé peut être compromis : les sessions du compte
 * sont fermées dans la même transaction. */
export async function reinitialiserMotDePasse(userId: string, motDePasse: string): Promise<Reponse> {
 try {
  const u = await exigerAdmin();
  if (!z.string().uuid().safeParse(userId).success || userId === u.id) return {ok:false,erreur:'Choisissez un autre compte'};
  if (typeof motDePasse !== 'string' || motDePasse.length < 8) throw new ErreurMetier('MOT_DE_PASSE_COURT');
  const hash = await hashMotDePasse(motDePasse);
  const trouve = await tx(async c => {
   const r = await c.query('update app_user set password_hash=$2 where id=$1',[userId,hash]);
   if (!r.rowCount) return false;
   await c.query('delete from user_session where user_id=$1',[userId]);
   return true;
  });
  if (!trouve) return {ok:false,erreur:'Compte introuvable'};
  revalidatePath('/profil'); return {ok:true};
 } catch(e) { return {ok:false,erreur:messageFr(e)}; }
}
