import { isMain, loadEnvFile, openDb, readIntegritySql, sqlitePathFromUrl } from "./sqlite";

export function applyIntegrity(file = sqlitePathFromUrl()): void {
  const db = openDb(file);
  try {
    db.exec("BEGIN");
    db.exec(readIntegritySql());
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.close();
  }
}

if (isMain(import.meta.url)) {
  loadEnvFile();
  const file = sqlitePathFromUrl();
  applyIntegrity(file);
  console.log(`integridad.sql aplicado a ${file}`);
}
