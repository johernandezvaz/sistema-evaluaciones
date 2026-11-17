import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { applyIntegrity } from "../../scripts/apply-integrity";
import { verifyIntegrity } from "../../scripts/verify-integrity";
import { ROOT } from "../../scripts/sqlite";

export const TEST_DB_DIR = path.join(ROOT, "tmp", "test-db");
export const TEMPLATE_DB = path.join(TEST_DB_DIR, "template.db");

export default function setup() {
  rmSync(TEST_DB_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DB_DIR, { recursive: true });
  execSync("npx prisma migrate deploy", {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: `file:${TEMPLATE_DB.split(path.sep).join("/")}` },
  });
  applyIntegrity(TEMPLATE_DB);
  const problems = verifyIntegrity(TEMPLATE_DB);
  if (problems.length) throw new Error(`Plantilla de pruebas sin integridad: ${JSON.stringify(problems)}`);
}
