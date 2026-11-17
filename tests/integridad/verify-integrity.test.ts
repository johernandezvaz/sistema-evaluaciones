import { describe, expect, it } from "vitest";
import { copyFileSync } from "node:fs";
import path from "node:path";
import { verifyIntegrity } from "../../scripts/verify-integrity";
import { applyIntegrity } from "../../scripts/apply-integrity";
import { checkMigrationSql, checkMigrations } from "../../scripts/check-migrations";
import { INTEGRITY_OBJECTS, PARTIAL_INDEXES, TRIGGERS } from "../../scripts/integrity-objects";
import { namesDeclaredInSql, openDb, readIntegritySql } from "../../scripts/sqlite";

/** Copia propia de la base de este archivo, para poder romperla sin afectar otras pruebas. */
function copiaDeLaBase(nombre: string) {
  const src = process.env.TEST_DB_FILE!;
  const dst = path.join(path.dirname(src), `${path.basename(src, ".db")}-${nombre}.db`);
  copyFileSync(src, dst);
  return dst;
}

function exec(file: string, sql: string) {
  const d = openDb(file);
  try {
    d.exec(sql);
  } finally {
    d.close();
  }
}

describe("verify-integrity", () => {
  it("una base recién migrada tiene todos los objetos", () => {
    expect(verifyIntegrity(process.env.TEST_DB_FILE!)).toEqual([]);
  });

  it("la lista explícita y integridad.sql están sincronizadas", () => {
    expect(new Set(namesDeclaredInSql())).toEqual(new Set(INTEGRITY_OBJECTS.map((o) => o.name)));
    expect(PARTIAL_INDEXES).toHaveLength(3);
    expect(TRIGGERS.length).toBeGreaterThanOrEqual(42);
  });

  it("falla si se borra un trigger", () => {
    const f = copiaDeLaBase("sin-trigger");
    exec(f, 'DROP TRIGGER "RespuestaPieza_kiosco_asignacion_activa"');
    expect(verifyIntegrity(f)).toEqual([
      { name: "RespuestaPieza_kiosco_asignacion_activa", problem: "falta el trigger" },
    ]);
  });

  it("falla si se borra un índice parcial", () => {
    const f = copiaDeLaBase("sin-indice");
    exec(f, 'DROP INDEX "Asignacion_una_activa"');
    expect(verifyIntegrity(f)).toEqual([{ name: "Asignacion_una_activa", problem: "falta el índice" }]);
  });

  it("falla si el índice parcial se recrea sin WHERE", () => {
    const f = copiaDeLaBase("indice-total");
    exec(
      f,
      'DROP INDEX "ExamenVersion_una_publicada_por_examen"; CREATE INDEX "ExamenVersion_una_publicada_por_examen" ON "ExamenVersion" ("examenId")',
    );
    expect(verifyIntegrity(f).map((p) => p.problem)).toContain("el índice perdió su cláusula WHERE (ya no es parcial)");
  });

  it("integridad.sql es idempotente y restaura lo que falte", () => {
    const f = copiaDeLaBase("restaurar");
    exec(f, 'DROP TRIGGER "Intento_coherencia_ins"; DROP INDEX "Asignacion_codigo_activo"');
    expect(verifyIntegrity(f)).toHaveLength(2);
    applyIntegrity(f);
    applyIntegrity(f); // dos veces seguidas no truena
    expect(verifyIntegrity(f)).toEqual([]);
  });

  it("detecta un trigger con definición desactualizada (IF NOT EXISTS no lo reemplaza)", () => {
    const f = copiaDeLaBase("desactualizado");
    exec(
      f,
      `DROP TRIGGER "Asignacion_transicion_v2";
       CREATE TRIGGER "Asignacion_transicion_v2" BEFORE UPDATE OF "estado" ON "Asignacion"
       WHEN 0 BEGIN SELECT 1; END;`,
    );
    applyIntegrity(f); // no lo arregla: ya existe con ese nombre
    expect(verifyIntegrity(f)).toEqual([
      {
        name: "Asignacion_transicion_v2",
        problem: "la definición en la base no coincide con integridad.sql (crea una versión _vN y una migración)",
      },
    ]);
  });

  it("la v1 de Asignacion_transicion ya no existe tras las migraciones", () => {
    const d = openDb(process.env.TEST_DB_FILE!);
    try {
      expect(d.prepare("SELECT name FROM sqlite_master WHERE name = 'Asignacion_transicion'").all()).toEqual([]);
    } finally {
      d.close();
    }
  });

  it("integridad.sql no contiene DROP de sus propios objetos", () => {
    expect(readIntegritySql()).not.toMatch(/DROP\s+(INDEX|TRIGGER)/i);
  });
});

describe("check-migrations", () => {
  it("rechaza DROP INDEX de un índice parcial protegido", () => {
    const r = checkMigrationSql("20270101_x", 'DROP INDEX "Asignacion_una_activa";\nCREATE TABLE "X" (id TEXT);');
    expect(r).toHaveLength(1);
    expect(r[0]!.level).toBe("error");
  });

  it("rechaza DROP TRIGGER protegido y avisa al recrear una tabla protegida", () => {
    const r = checkMigrationSql("m", 'DROP TRIGGER IF EXISTS "AuditLog_no_update";\nDROP TABLE "Intento";');
    expect(r.map((x) => x.level).sort()).toEqual(["error", "warning"]);
  });

  it("ignora índices que no son de integridad", () => {
    expect(checkMigrationSql("m", 'DROP INDEX "Persona_numeroEmpleado_key";')).toEqual([]);
  });

  it("las migraciones del repositorio no tienen errores", () => {
    expect(checkMigrations().filter((f) => f.level === "error")).toEqual([]);
  });
});
