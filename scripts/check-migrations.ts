import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { INTEGRITY_OBJECTS, PROTECTED_NAMES } from "./integrity-objects";
import { isMain, ROOT } from "./sqlite";

export type MigrationFinding = { migration: string; level: "error" | "warning"; message: string };

const PROTECTED_TABLES = new Set(INTEGRITY_OBJECTS.map((o) => o.table));

export function checkMigrationSql(migration: string, sql: string): MigrationFinding[] {
  const findings: MigrationFinding[] = [];
  for (const m of sql.matchAll(/DROP\s+(INDEX|TRIGGER)\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/gi)) {
    if (PROTECTED_NAMES.has(m[2]!)) {
      findings.push({
        migration,
        level: "error",
        message: `${m[0]} elimina un objeto de integridad. Borra esa línea de la migración.`,
      });
    }
  }
  for (const m of sql.matchAll(/DROP\s+TABLE\s+"?([A-Za-z0-9_]+)"?/gi)) {
    if (PROTECTED_TABLES.has(m[1]!)) {
      findings.push({
        migration,
        level: "warning",
        message: `Recrea la tabla ${m[1]}: sus triggers/índices parciales se restauran con npm run db:integrity.`,
      });
    }
  }
  return findings;
}

export function checkMigrations(dir = path.join(ROOT, "prisma", "migrations")): MigrationFinding[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const file = path.join(dir, d.name, "migration.sql");
      return existsSync(file) ? checkMigrationSql(d.name, readFileSync(file, "utf8")) : [];
    });
}

if (isMain(import.meta.url)) {
  const findings = checkMigrations();
  for (const f of findings)
    (f.level === "error" ? console.error : console.warn)(`[${f.level}] ${f.migration}: ${f.message}`);
  const errors = findings.filter((f) => f.level === "error").length;
  if (errors) process.exit(1);
  console.log(`✓ Migraciones revisadas (${findings.length} avisos, 0 errores)`);
}
