/*
 * Démarrage du serveur Next.js : lance le planificateur des
 * notifications (flash du jour, rappels de devoirs) dans le processus
 * Node. Rien ne tourne pendant `next build`, ni dans le runtime edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { demarrerPlanificateur } = await import("./lib/notifications");
  demarrerPlanificateur();
}
