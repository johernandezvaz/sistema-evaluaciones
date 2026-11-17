import { INTEGRITY_OBJECTS } from "./integrity-objects";
import { definitionsInSql, isMain, loadEnvFile, normalizeDefinition, openDb, sqlitePathFromUrl } from "./sqlite";

export type IntegrityProblem = { name: string; problem: string };

export function verifyIntegrity(file = sqlitePathFromUrl()): IntegrityProblem[] {
  const db = openDb(file);
  try {
    const rows = db
      .prepare(`SELECT type, name, tbl_name AS tbl, sql FROM sqlite_master WHERE type IN ('trigger','index')`)
      .all() as { type: string; name: string; tbl: string; sql: string | null }[];
    const byName = new Map(rows.map((r) => [r.name, r]));
    const defs = definitionsInSql();
    const problems: IntegrityProblem[] = [];
    for (const obj of INTEGRITY_OBJECTS) {
      const row = byName.get(obj.name);
      if (!row) {
        problems.push({ name: obj.name, problem: `falta el ${obj.type === "trigger" ? "trigger" : "índice"}` });
        continue;
      }
      if (row.type !== obj.type) problems.push({ name: obj.name, problem: `es ${row.type}, se esperaba ${obj.type}` });
      if (row.tbl !== obj.table)
        problems.push({ name: obj.name, problem: `está en ${row.tbl}, se esperaba ${obj.table}` });
      if (obj.partial && !/\bWHERE\b/i.test(row.sql ?? "")) {
        problems.push({ name: obj.name, problem: "el índice perdió su cláusula WHERE (ya no es parcial)" });
      } else if (defs.has(obj.name) && normalizeDefinition(row.sql ?? "") !== defs.get(obj.name)) {
        problems.push({
          name: obj.name,
          problem: "la definición en la base no coincide con integridad.sql (crea una versión _vN y una migración)",
        });
      }
    }
    return problems;
  } finally {
    db.close();
  }
}

if (isMain(import.meta.url)) {
  loadEnvFile();
  const file = sqlitePathFromUrl();
  const problems = verifyIntegrity(file);
  if (problems.length) {
    console.error(`✗ Integridad incompleta en ${file}:`);
    for (const p of problems) console.error(`  - ${p.name}: ${p.problem}`);
    console.error("Corre `npm run db:integrity` para restaurarla.");
    process.exit(1);
  }
  console.log(`✓ Integridad OK (${INTEGRITY_OBJECTS.length} objetos) en ${file}`);
}
