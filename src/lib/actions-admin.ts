"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdmin, exigerUtilisateur } from "./session";
import { query } from "./db";
import { proposalSchema, submitProposal, reviewProposal } from "./proposals";
import type { Reponse } from "./actions";
import { messageFr } from "./errors";

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
