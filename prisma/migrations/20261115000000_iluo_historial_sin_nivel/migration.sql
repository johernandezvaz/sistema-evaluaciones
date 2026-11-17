-- NivelILUOHistorial.letraNueva admite NULL: un REPROBADO con criterio ULTIMO (o una anulación) puede dejar
-- a la persona sin nivel en el modelo.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NivelILUOHistorial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personaId" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "letraAnterior" TEXT,
    "letraNueva" TEXT,
    "origen" TEXT NOT NULL,
    "intentoId" TEXT,
    "usuarioId" TEXT,
    "motivo" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NivelILUOHistorial_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NivelILUOHistorial_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "Modelo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NivelILUOHistorial_intentoId_fkey" FOREIGN KEY ("intentoId") REFERENCES "Intento" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NivelILUOHistorial_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NivelILUOHistorial" ("id", "personaId", "modeloId", "letraAnterior", "letraNueva", "origen", "intentoId", "usuarioId", "motivo", "fecha")
SELECT "id", "personaId", "modeloId", "letraAnterior", "letraNueva", "origen", "intentoId", "usuarioId", "motivo", "fecha" FROM "NivelILUOHistorial";
DROP TABLE "NivelILUOHistorial";
ALTER TABLE "new_NivelILUOHistorial" RENAME TO "NivelILUOHistorial";
CREATE INDEX "NivelILUOHistorial_personaId_modeloId_fecha_idx" ON "NivelILUOHistorial"("personaId", "modeloId", "fecha");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
