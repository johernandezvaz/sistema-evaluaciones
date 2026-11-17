-- Asignacion_transicion → Asignacion_transicion_v2: permite EN_CURSO → CANCELADA cuando el intento se anula
-- (en la misma transacción). La definición nueva vive en prisma/sql/integridad.sql; se repite aquí para que
-- la base quede protegida aunque no se corra `npm run db:integrity`.
DROP TRIGGER IF EXISTS "Asignacion_transicion";

CREATE TRIGGER IF NOT EXISTS "Asignacion_transicion_v2" BEFORE UPDATE OF "estado" ON "Asignacion"
WHEN NEW."estado" IS NOT OLD."estado" AND NOT (
     (OLD."estado" = 'PENDIENTE' AND NEW."estado" IN ('EN_CURSO', 'CANCELADA', 'VENCIDA'))
  OR (OLD."estado" = 'EN_CURSO'  AND NEW."estado" IN ('COMPLETADA', 'VENCIDA'))
  OR (OLD."estado" = 'EN_CURSO'  AND NEW."estado" = 'CANCELADA' AND NEW."motivoCancelacion" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "Intento" i WHERE i."asignacionId" = NEW."id" AND i."estado" = 'ANULADO'))
)
BEGIN SELECT RAISE(ABORT, 'Transición de estado de asignación no válida'); END;
