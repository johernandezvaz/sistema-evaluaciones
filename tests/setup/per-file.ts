import { copyFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll } from "vitest";
import { ROOT } from "../../scripts/sqlite";

const dir = path.join(ROOT, "tmp", "test-db");
const file = path.join(dir, `t-${randomUUID()}.db`);
copyFileSync(path.join(dir, "template.db"), file);
process.env.DATABASE_URL = `file:${file.split(path.sep).join("/")}`;
process.env.TEST_DB_FILE = file;

afterAll(async () => {
  const { db } = await import("../../lib/db");
  await db().$disconnect();
});
