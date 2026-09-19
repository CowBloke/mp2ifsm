import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { ErreurMetier } from "./errors";

/*
 * Stockage des fichiers sur le SSD du Pi.
 *
 * Deux règles non négociables :
 *
 *  1. Le nom sur disque est TOUJOURS aléatoire (32 hex) et n'a aucun
 *     rapport avec le nom fourni par l'utilisateur. Aucune chaîne
 *     venant du client n'entre dans un chemin, donc « ../ » et les
 *     noms exotiques n'ont aucune prise.
 *  2. Rien n'est servi par un serveur de fichiers. Les téléchargements
 *     passent par une route authentifiée qui lit le nom de stockage
 *     dans la base à partir d'un identifiant numérique.
 */

export const RACINE = process.env.STORAGE_ROOT ?? "/home/cowbloke/mp2ifsm-data";
export const DOSSIER_DOCUMENTS = join(RACINE, "documents");
export const DOSSIER_IMAGES = join(RACINE, "card-images");

/** Quota par membre (défaut 500 Mo) et plafond global (défaut 20 Go). */
export const QUOTA_MEMBRE = Number(process.env.QUOTA_UTILISATEUR ?? 500 * 1024 * 1024);
export const PLAFOND_GLOBAL = Number(process.env.QUOTA_GLOBAL ?? 20 * 1024 * 1024 * 1024);
export const TAILLE_MAX_FICHIER = Number(process.env.TAILLE_MAX_FICHIER ?? 50 * 1024 * 1024);
export const TAILLE_MAX_IMAGE = 8 * 1024 * 1024;

/*
 * Types acceptés. La clé est le type MIME retenu ; on ne fait jamais
 * confiance au Content-Type envoyé par le navigateur, il est confronté
 * à la signature binaire réelle (cf. `detecterType`).
 */
export const TYPES_DOCUMENTS: Record<string, { ext: string; libelle: string }> = {
  "application/pdf": { ext: "pdf", libelle: "PDF" },
  "image/png": { ext: "png", libelle: "Image PNG" },
  "image/jpeg": { ext: "jpg", libelle: "Image JPEG" },
  "image/webp": { ext: "webp", libelle: "Image WebP" },
  "image/gif": { ext: "gif", libelle: "Image GIF" },
  "text/plain": { ext: "txt", libelle: "Texte" },
  "text/markdown": { ext: "md", libelle: "Markdown" },
  "application/zip": { ext: "zip", libelle: "Archive ZIP" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    { ext: "docx", libelle: "Word" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    { ext: "xlsx", libelle: "Excel" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    { ext: "pptx", libelle: "PowerPoint" },
  "application/vnd.oasis.opendocument.text": { ext: "odt", libelle: "OpenDocument" },
};

export const TYPES_IMAGES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * Détermine le type réel d'après les octets de tête.
 *
 * Le Content-Type du client n'est utilisé que pour départager les
 * formats ZIP (docx/xlsx/pptx/odt/zip partagent la même signature) et
 * les formats texte, qui n'ont pas de signature.
 */
export function detecterType(buf: Buffer, typeAnnonce: string): string | null {
  const h = buf.subarray(0, 12);
  const commence = (...octets: number[]) => octets.every((o, i) => h[i] === o);

  if (commence(0x25, 0x50, 0x44, 0x46)) return "application/pdf";                 // %PDF
  if (commence(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (commence(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (commence(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (commence(0x52, 0x49, 0x46, 0x46) && buf.subarray(8, 12).toString() === "WEBP") {
    return "image/webp";
  }

  // Conteneurs ZIP : on garde le type annoncé s'il est dans la liste.
  if (commence(0x50, 0x4b, 0x03, 0x04) || commence(0x50, 0x4b, 0x05, 0x06)) {
    const zips = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.oasis.opendocument.text",
    ];
    return zips.includes(typeAnnonce) ? typeAnnonce : "application/zip";
  }

  // Texte : pas de signature. On vérifie l'absence d'octet nul, qui
  // trahirait un binaire déguisé.
  if (typeAnnonce === "text/plain" || typeAnnonce === "text/markdown") {
    return buf.subarray(0, 4096).includes(0) ? null : typeAnnonce;
  }
  return null;
}

export function nomDeStockage(): string {
  return randomBytes(16).toString("hex");   // 32 hex, cf. contrainte SQL
}

export function empreinte(buf: Buffer): Buffer {
  return createHash("sha256").update(buf).digest();
}

/** Écrit le fichier et renvoie son nom de stockage. */
export async function ecrire(dossier: string, buf: Buffer): Promise<string> {
  await mkdir(dossier, { recursive: true, mode: 0o700 });
  const nom = nomDeStockage();
  await writeFile(join(dossier, nom), buf, { mode: 0o600, flag: "wx" });
  return nom;
}

/**
 * Chemin absolu d'un fichier stocké.
 *
 * Le nom est revalidé même s'il vient de la base : c'est la dernière
 * barrière si une donnée corrompue arrivait jusqu'ici.
 */
export function cheminDe(dossier: string, storageName: string): string {
  if (!/^[a-f0-9]{32}$/.test(storageName)) {
    throw new ErreurMetier("DOCUMENT_INTROUVABLE");
  }
  return join(dossier, storageName);
}

export async function supprimerDuDisque(dossier: string, storageName: string): Promise<boolean> {
  try {
    await unlink(cheminDe(dossier, storageName));
    return true;
  } catch (err) {
    // Fichier déjà absent : la base reste la source de vérité.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

export async function existeSurDisque(dossier: string, storageName: string): Promise<boolean> {
  try {
    await stat(cheminDe(dossier, storageName));
    return true;
  } catch {
    return false;
  }
}

/** « 2,4 Mo » — tailles lisibles. */
export function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  const unites = ["ko", "Mo", "Go", "To"];
  let v = octets / 1024;
  let i = 0;
  while (v >= 1024 && i < unites.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0).replace(".", ",")} ${unites[i]}`;
}
