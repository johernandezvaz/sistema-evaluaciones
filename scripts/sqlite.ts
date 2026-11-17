import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const INTEGRITY_SQL_PATH = path.join(ROOT, "prisma", "sql", "integridad.sql");

export function sqlitePathFromUrl(url = process.env.DATABASE_URL): string {
  if (!url) throw new Error("DATABASE_URL no está definido");
  if (!url.startsWith("file:")) throw new Error(`Solo SQLite está soportado por estos scripts (DATABASE_URL=${url})`);
  const raw = url.slice("file:".length).split("?")[0] ?? "";
  return path.isAbsolute(raw) ? raw : path.resolve(ROOT, "prisma", raw);
}

export function openDb(file = sqlitePathFromUrl()): DatabaseSync {
  if (!existsSync(file)) throw new Error(`No existe la base de datos ${file}. Corre primero las migraciones.`);
  return new DatabaseSync(file);
}

export function readIntegritySql(): string {
  return readFileSync(INTEGRITY_SQL_PATH, "utf8");
}

export function namesDeclaredInSql(sql = readIntegritySql()): string[] {
  return [...sql.matchAll(/CREATE (?:TRIGGER|UNIQUE INDEX) IF NOT EXISTS "([A-Za-z0-9_]+)"/g)].map((m) => m[1]!);
}

export function normalizeDefinition(sql: string): string {
  return sql
    .replace(/\bIF\s+NOT\s+EXISTS\s+/i, "")
    .replace(/;\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function definitionsInSql(sql = readIntegritySql()): Map<string, string> {
  const defs = new Map<string, string>();
  const re =
    /CREATE TRIGGER IF NOT EXISTS "([A-Za-z0-9_]+)"[\s\S]*?\bEND;|CREATE UNIQUE INDEX IF NOT EXISTS "([A-Za-z0-9_]+)"[\s\S]*?;/g;
  for (const m of sql.matchAll(re)) defs.set((m[1] ?? m[2])!, normalizeDefinition(m[0]));
  return defs;
}

export function loadEnvFile(): void {
  const envPath = path.join(ROOT, ".env");
  if (process.env.DATABASE_URL || !existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (m && !line.trimStart().startsWith("#") && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
}

export function isMain(metaUrl: string): boolean {
  return !!process.argv[1] && path.resolve(fileURLToPath(metaUrl)) === path.resolve(process.argv[1]);
}
