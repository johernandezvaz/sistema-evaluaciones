-- Reglas de integridad que Prisma no puede declarar (triggers e índices parciales).
-- SQLite. (Para PostgreSQL: índices parciales idénticos; los triggers se reescriben como funciones plpgsql.)
-- Son la red de seguridad: la capa de servicio (lib/services/*) valida lo mismo y da mensajes claros.
--
-- IDEMPOTENTE: todo usa IF NOT EXISTS. Se aplica al final de CADA migración con `npm run db:integrity`
-- (lo llaman db:migrate y db:migrate:dev), porque Prisma con SQLite recrea tablas al alterar columnas
-- y en ese proceso se pierden sus triggers e índices parciales.
-- Si agregas o renombras un objeto aquí, actualiza la lista de scripts/integrity-objects.ts.
--
-- CAMBIAR un trigger/índice existente: IF NOT EXISTS no reemplaza una definición vieja. No lo edites en
-- su lugar: crea uno nuevo con sufijo _vN, y en una migración nueva haz DROP del anterior (que ya no está
-- en la lista protegida). verify-integrity compara el texto y avisa si una definición quedó desactualizada.
--
-- Fechas: Prisma guarda DateTime en UTC; los triggers solo comparan fechas escritas por Prisma entre sí.

-- ═══════════════════════════════ 1) Versiones: una PUBLICADA por examen ═══════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS "ExamenVersion_una_publicada_por_examen"
  ON "ExamenVersion" ("examenId") WHERE "estado" = 'PUBLICADA';

-- ═══════════════════════════════════ 2) AuditLog de solo inserción ═══════════════════════════════════
CREATE TRIGGER IF NOT EXISTS "AuditLog_no_update" BEFORE UPDATE ON "AuditLog"
BEGIN SELECT RAISE(ABORT, 'AuditLog es de solo inserción'); END;

CREATE TRIGGER IF NOT EXISTS "AuditLog_no_delete" BEFORE DELETE ON "AuditLog"
BEGIN SELECT RAISE(ABORT, 'AuditLog es de solo inserción'); END;

-- ═══════════════════════ 3) Versiones PUBLICADA / REEMPLAZADA inmutables ═══════════════════════
-- Única transición permitida: PUBLICADA → REEMPLAZADA fijando vigenteHasta (al publicar la siguiente).
CREATE TRIGGER IF NOT EXISTS "ExamenVersion_inmutable" BEFORE UPDATE ON "ExamenVersion"
WHEN OLD."estado" IN ('PUBLICADA', 'REEMPLAZADA')
 AND NOT (
       OLD."estado" = 'PUBLICADA' AND NEW."estado" = 'REEMPLAZADA'
   AND OLD."vigenteHasta" IS NULL AND NEW."vigenteHasta" IS NOT NULL
   AND NEW."version" IS OLD."version" AND NEW."examenId" IS OLD."examenId"
   AND NEW."vigenteDesde" IS OLD."vigenteDesde" AND NEW."motivoCambio" IS OLD."motivoCambio"
   AND NEW."pesoFisico" IS OLD."pesoFisico" AND NEW."pesoTeorico" IS OLD."pesoTeorico"
   AND NEW."teoriaMax" IS OLD."teoriaMax" AND NEW."modoTeoria" IS OLD."modoTeoria"
   AND NEW."incluyePractica" IS OLD."incluyePractica"
   AND NEW."requiereSegundaInspeccion" IS OLD."requiereSegundaInspeccion"
   AND NEW."firmas" IS OLD."firmas" AND NEW."codigoDocumento" IS OLD."codigoDocumento"
   AND NEW."publicadoPorId" IS OLD."publicadoPorId" AND NEW."publicadoEn" IS OLD."publicadoEn"
 )
BEGIN SELECT RAISE(ABORT, 'Una versión publicada o reemplazada no se puede modificar'); END;

-- Al publicar: vigenteDesde obligatorio, no anterior a la versión publicada previa ni a la fechaAplicacion
-- más reciente de los intentos de ese examen (incluidos anulados). "No en el futuro" lo valida el servicio
-- (los triggers no comparan contra el reloj).
CREATE TRIGGER IF NOT EXISTS "ExamenVersion_publicar_sin_retroactivo" BEFORE UPDATE OF "estado" ON "ExamenVersion"
WHEN OLD."estado" = 'BORRADOR' AND NEW."estado" = 'PUBLICADA'
 AND (
      NEW."vigenteDesde" IS NULL
   OR NEW."vigenteDesde" < (SELECT MAX(i."fechaAplicacion") FROM "Intento" i WHERE i."examenId" = NEW."examenId")
   OR NEW."vigenteDesde" < (SELECT MAX(v."vigenteDesde") FROM "ExamenVersion" v
                            WHERE v."examenId" = NEW."examenId" AND v."id" <> NEW."id" AND v."estado" <> 'BORRADOR')
 )
BEGIN SELECT RAISE(ABORT, 'La vigencia no puede ser anterior al último intento ni a la versión previa'); END;

CREATE TRIGGER IF NOT EXISTS "ExamenVersion_no_delete" BEFORE DELETE ON "ExamenVersion"
WHEN OLD."estado" <> 'BORRADOR'
BEGIN SELECT RAISE(ABORT, 'Solo se pueden eliminar versiones en BORRADOR'); END;

-- Contenido hijo de una versión no-BORRADOR: sin INSERT/UPDATE/DELETE.
CREATE TRIGGER IF NOT EXISTS "Pregunta_inmutable_ins" BEFORE INSERT ON "Pregunta"
WHEN (SELECT "estado" FROM "ExamenVersion" WHERE "id" = NEW."versionId") <> 'BORRADOR'
BEGIN SELECT RAISE(ABORT, 'La versión no está en BORRADOR'); END;
CREATE TRIGGER IF NOT EXISTS "Pregunta_inmutable_upd" BEFORE UPDATE ON "Pregunta"
WHEN (SELECT "estado" FROM "ExamenVersion" WHERE "id" = OLD."versionId") <> 'BORRADOR'
BEGIN SELECT RAISE(ABORT, 'La versión no está en BORRADOR'); END;
CREATE TRIGGER IF NOT EXISTS "Pregunta_inmutable_del" BEFORE DELETE ON "Pregunta"
WHEN (SELECT "estado" FROM "ExamenVersion" WHERE "id" = OLD."versionId") <> 'BORRADOR'
BEGIN SELECT RAISE(ABORT, 'La versión no está en BORRADOR'); END;

CREATE TRIGGER IF NOT EXISTS "PiezaClave_inmutable_ins" BEFORE INSERT ON "PiezaClave"
WHEN (SELECT "estado" FROM "ExamenVersion" WHERE "id" = NEW."versionId") <> 'BORRADOR'
BEGIN SELECT RAISE(ABORT, 'La versión no está en BORRADOR'); END;
CREATE TRIGGER IF NOT EXISTS "PiezaClave_inmutable_upd" BEFORE UPDATE ON "PiezaClave"
WHEN (SELECT "estado" FROM "ExamenVersion" WHERE "id" = OLD."versionId") <> 'BORRADOR'
BEGIN SELECT RAISE(ABORT, 'La versión no está en BORRADOR'); END;
CREATE TRIGGER IF NOT EXISTS "PiezaClave_inmutable_del" BEFORE DELETE ON "PiezaClave"
WHEN (SELECT "estado" FROM "ExamenVersion" WHERE "id" = OLD."versionId") <> 'BORRADOR'
BEGIN SELECT RAISE(ABORT, 'La versión no está en BORRADOR'); END;

CREATE TRIGGER IF NOT EXISTS "ExamenImagen_inmutable_ins" BEFORE INSERT ON "ExamenImagen"
WHEN (SELECT "estado" FROM "ExamenVersion" WHERE "id" = NEW."versionId") <> 'BORRADOR'
BEGIN SELECT RAISE(ABORT, 'La versión no está en BORRADOR'); END;
CREATE TRIGGER IF NOT EXISTS "ExamenImagen_inmutable_upd" BEFORE UPDATE ON "ExamenImagen"
WHEN (SELECT "estado" FROM "ExamenVersion" WHERE "id" = OLD."versionId") <> 'BORRADOR'
BEGIN SELECT RAISE(ABORT, 'La versión no está en BORRADOR'); END;
CREATE TRIGGER IF NOT EXISTS "ExamenImagen_inmutable_del" BEFORE DELETE ON "ExamenImagen"
WHEN (SELECT "estado" FROM "ExamenVersion" WHERE "id" = OLD."versionId") <> 'BORRADOR'
BEGIN SELECT RAISE(ABORT, 'La versión no está en BORRADOR'); END;

CREATE TRIGGER IF NOT EXISTS "DiagramaFlecha_inmutable_ins" BEFORE INSERT ON "DiagramaFlecha"
WHEN (SELECT v."estado" FROM "Pregunta" p JOIN "ExamenVersion" v ON v."id" = p."versionId" WHERE p."id" = NEW."preguntaId") <> 'BORRADOR'
BEGIN SELECT RAISE(ABORT, 'La versión no está en BORRADOR'); END;
CREATE TRIGGER IF NOT EXISTS "DiagramaFlecha_inmutable_upd" BEFORE UPDATE ON "DiagramaFlecha"
WHEN (SELECT v."estado" FROM "Pregunta" p JOIN "ExamenVersion" v ON v."id" = p."versionId" WHERE p."id" = OLD."preguntaId") <> 'BORRADOR'
BEGIN SELECT RAISE(ABORT, 'La versión no está en BORRADOR'); END;
CREATE TRIGGER IF NOT EXISTS "DiagramaFlecha_inmutable_del" BEFORE DELETE ON "DiagramaFlecha"
WHEN (SELECT v."estado" FROM "Pregunta" p JOIN "ExamenVersion" v ON v."id" = p."versionId" WHERE p."id" = OLD."preguntaId") <> 'BORRADOR'
BEGIN SELECT RAISE(ABORT, 'La versión no está en BORRADOR'); END;

-- ═══════════════════════════════════════ 4) Intentos ═══════════════════════════════════════
-- Transiciones válidas:
--   EN_CURSO → PENDIENTE_CALIFICAR | FINALIZADO | ANULADO
--   PENDIENTE_CALIFICAR → FINALIZADO | ANULADO
--   FINALIZADO → ANULADO          ANULADO → (nada)
CREATE TRIGGER IF NOT EXISTS "Intento_transicion" BEFORE UPDATE OF "estado" ON "Intento"
WHEN NEW."estado" IS NOT OLD."estado" AND NOT (
     (OLD."estado" = 'EN_CURSO'            AND NEW."estado" IN ('PENDIENTE_CALIFICAR', 'FINALIZADO', 'ANULADO'))
  OR (OLD."estado" = 'PENDIENTE_CALIFICAR' AND NEW."estado" IN ('FINALIZADO', 'ANULADO'))
  OR (OLD."estado" = 'FINALIZADO'          AND NEW."estado" = 'ANULADO')
)
BEGIN SELECT RAISE(ABORT, 'Transición de estado de intento no válida'); END;

-- 4a) Identidad: empleado, modelo, examen, versión, asignación, fecha y snapshot de área/turno/puesto.
--     Inmutable en cuanto el intento deja EN_CURSO, y SIEMPRE en kiosco (la versión se fija al iniciar).
--     Solo una captura en papel EN_CURSO puede corregir estos datos antes de enviarla.
CREATE TRIGGER IF NOT EXISTS "Intento_identidad_inmutable" BEFORE UPDATE ON "Intento"
WHEN (OLD."estado" <> 'EN_CURSO' OR OLD."modo" IN ('KIOSCO', 'DISPOSITIVO'))
 AND (
      NEW."personaId" IS NOT OLD."personaId" OR NEW."modeloId" IS NOT OLD."modeloId"
   OR NEW."examenId" IS NOT OLD."examenId" OR NEW."versionId" IS NOT OLD."versionId"
   OR NEW."asignacionId" IS NOT OLD."asignacionId" OR NEW."fechaAplicacion" IS NOT OLD."fechaAplicacion"
   OR NEW."modo" IS NOT OLD."modo" OR NEW."iniciadoEn" IS NOT OLD."iniciadoEn"
   OR NEW."areaNombre" IS NOT OLD."areaNombre" OR NEW."turnoNombre" IS NOT OLD."turnoNombre"
   OR NEW."puesto" IS NOT OLD."puesto"
 )
BEGIN SELECT RAISE(ABORT, 'No se puede cambiar el empleado, examen, versión, asignación o fecha de este intento'); END;

-- 4a') Coherencia: la versión pertenece al examen, el examen al modelo, y la versión no es BORRADOR.
CREATE TRIGGER IF NOT EXISTS "Intento_coherencia_ins" BEFORE INSERT ON "Intento"
WHEN (NEW."versionId" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "ExamenVersion" v
        WHERE v."id" = NEW."versionId" AND v."examenId" IS NEW."examenId" AND v."estado" <> 'BORRADOR'))
  OR (NEW."examenId" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Examen" e WHERE e."id" = NEW."examenId" AND e."modeloId" = NEW."modeloId"))
BEGIN SELECT RAISE(ABORT, 'La versión no pertenece al examen, el examen no pertenece al modelo, o la versión es BORRADOR'); END;

CREATE TRIGGER IF NOT EXISTS "Intento_coherencia_upd" BEFORE UPDATE OF "versionId", "examenId", "modeloId" ON "Intento"
WHEN (NEW."versionId" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "ExamenVersion" v
        WHERE v."id" = NEW."versionId" AND v."examenId" IS NEW."examenId" AND v."estado" <> 'BORRADOR'))
  OR (NEW."examenId" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Examen" e WHERE e."id" = NEW."examenId" AND e."modeloId" = NEW."modeloId"))
BEGIN SELECT RAISE(ABORT, 'La versión no pertenece al examen, el examen no pertenece al modelo, o la versión es BORRADOR'); END;

-- 4b') La parte física se califica al enviar: fuera de EN_CURSO ya no cambia (en PENDIENTE_CALIFICAR
--      solo se completan los campos teóricos y la calificación final).
CREATE TRIGGER IF NOT EXISTS "Intento_fisico_inmutable" BEFORE UPDATE ON "Intento"
WHEN OLD."estado" <> 'EN_CURSO'
 AND (
      NEW."totalPiezas" IS NOT OLD."totalPiezas" OR NEW."aciertos" IS NOT OLD."aciertos"
   OR NEW."errores" IS NOT OLD."errores" OR NEW."pctFisico" IS NOT OLD."pctFisico"
 )
BEGIN SELECT RAISE(ABORT, 'La parte física de un intento enviado no se puede modificar'); END;

-- 4b) La calificación de un intento FINALIZADO/ANULADO no se recalcula (solo se puede anular).
CREATE TRIGGER IF NOT EXISTS "Intento_calificacion_inmutable" BEFORE UPDATE ON "Intento"
WHEN OLD."estado" IN ('FINALIZADO', 'ANULADO')
 AND (
      NEW."aciertos" IS NOT OLD."aciertos" OR NEW."errores" IS NOT OLD."errores"
   OR NEW."totalPiezas" IS NOT OLD."totalPiezas" OR NEW."teoriaPuntos" IS NOT OLD."teoriaPuntos"
   OR NEW."teoriaManual" IS NOT OLD."teoriaManual"
   OR NEW."pctFisico" IS NOT OLD."pctFisico" OR NEW."pctTeorico" IS NOT OLD."pctTeorico"
   OR NEW."calificacion" IS NOT OLD."calificacion" OR NEW."resultado" IS NOT OLD."resultado"
   OR NEW."pesoFisico" IS NOT OLD."pesoFisico" OR NEW."pesoTeorico" IS NOT OLD."pesoTeorico"
   OR NEW."teoriaMax" IS NOT OLD."teoriaMax" OR NEW."umbral80" IS NOT OLD."umbral80"
   OR NEW."umbral90" IS NOT OLD."umbral90" OR NEW."calificadoEn" IS NOT OLD."calificadoEn"
   OR NEW."enviadoEn" IS NOT OLD."enviadoEn" OR NEW."ronda" IS NOT OLD."ronda"
   OR (OLD."estado" = 'ANULADO')
 )
BEGIN SELECT RAISE(ABORT, 'La calificación de un intento finalizado no se puede modificar'); END;

-- 4c) Intento ligado a una asignación: mismo empleado y examen; la asignación debe estar activa al ligarse.
CREATE TRIGGER IF NOT EXISTS "Intento_asignacion_coherente_ins" BEFORE INSERT ON "Intento"
WHEN NEW."asignacionId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Asignacion" a
  WHERE a."id" = NEW."asignacionId" AND a."personaId" = NEW."personaId"
    AND a."examenId" IS NEW."examenId" AND a."estado" IN ('PENDIENTE', 'EN_CURSO')
)
BEGIN SELECT RAISE(ABORT, 'El intento no coincide con el empleado/examen de la asignación, o la asignación no está activa'); END;

CREATE TRIGGER IF NOT EXISTS "Intento_asignacion_coherente_upd" BEFORE UPDATE OF "asignacionId", "personaId", "examenId" ON "Intento"
WHEN NEW."asignacionId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Asignacion" a
  WHERE a."id" = NEW."asignacionId" AND a."personaId" = NEW."personaId" AND a."examenId" IS NEW."examenId"
)
BEGIN SELECT RAISE(ABORT, 'El intento no coincide con el empleado/examen de la asignación'); END;

CREATE TRIGGER IF NOT EXISTS "Intento_no_delete" BEFORE DELETE ON "Intento"
BEGIN SELECT RAISE(ABORT, 'Los intentos no se borran; se anulan'); END;

-- ═══════════════════════════════ 5) Respuestas del intento ═══════════════════════════════
-- Piezas: se escriben solo con el intento EN_CURSO. En kiosco cada respuesta enviada es definitiva
-- (esperado/correcta se calculan en el servidor al insertar). En captura en papel EN_CURSO se pueden corregir.
CREATE TRIGGER IF NOT EXISTS "RespuestaPieza_inmutable_ins" BEFORE INSERT ON "RespuestaPieza"
WHEN (SELECT "estado" FROM "Intento" WHERE "id" = NEW."intentoId") <> 'EN_CURSO'
BEGIN SELECT RAISE(ABORT, 'El intento ya fue enviado'); END;
CREATE TRIGGER IF NOT EXISTS "RespuestaPieza_inmutable_upd" BEFORE UPDATE ON "RespuestaPieza"
WHEN (SELECT "estado" <> 'EN_CURSO' OR "modo" IN ('KIOSCO', 'DISPOSITIVO') FROM "Intento" WHERE "id" = OLD."intentoId")
BEGIN SELECT RAISE(ABORT, 'Esta respuesta ya fue enviada y no se puede cambiar'); END;
CREATE TRIGGER IF NOT EXISTS "RespuestaPieza_inmutable_del" BEFORE DELETE ON "RespuestaPieza"
WHEN (SELECT "estado" <> 'EN_CURSO' OR "modo" IN ('KIOSCO', 'DISPOSITIVO') FROM "Intento" WHERE "id" = OLD."intentoId")
BEGIN SELECT RAISE(ABORT, 'Esta respuesta ya fue enviada y no se puede cambiar'); END;

-- Kiosco: además, la asignación debe seguir EN_CURSO (una vencida/Incompleta ya no acepta respuestas).
-- El límite de minutosMaxExamen lo aplica el servicio, que marca la asignación VENCIDA antes de rechazar.
CREATE TRIGGER IF NOT EXISTS "RespuestaPieza_kiosco_asignacion_activa" BEFORE INSERT ON "RespuestaPieza"
WHEN (SELECT i."modo" IN ('KIOSCO', 'DISPOSITIVO') AND COALESCE(a."estado", '') <> 'EN_CURSO'
      FROM "Intento" i LEFT JOIN "Asignacion" a ON a."id" = i."asignacionId" WHERE i."id" = NEW."intentoId")
BEGIN SELECT RAISE(ABORT, 'La asignación ya no está en curso; el examen no acepta más respuestas'); END;

CREATE TRIGGER IF NOT EXISTS "RespuestaTeorica_kiosco_asignacion_activa" BEFORE INSERT ON "RespuestaTeorica"
WHEN (SELECT i."modo" IN ('KIOSCO', 'DISPOSITIVO') AND COALESCE(a."estado", '') <> 'EN_CURSO'
      FROM "Intento" i LEFT JOIN "Asignacion" a ON a."id" = i."asignacionId" WHERE i."id" = NEW."intentoId")
BEGIN SELECT RAISE(ABORT, 'La asignación ya no está en curso; el examen no acepta más respuestas'); END;

-- Teóricas: se insertan solo EN_CURSO. En PENDIENTE_CALIFICAR solo cambia la calificación (puntos/correcta),
-- nunca lo que contestó el empleado. En kiosco el valor es definitivo desde que se envía.
CREATE TRIGGER IF NOT EXISTS "RespuestaTeorica_inmutable_ins" BEFORE INSERT ON "RespuestaTeorica"
WHEN (SELECT "estado" FROM "Intento" WHERE "id" = NEW."intentoId") <> 'EN_CURSO'
BEGIN SELECT RAISE(ABORT, 'El intento ya fue enviado'); END;
CREATE TRIGGER IF NOT EXISTS "RespuestaTeorica_finalizada_upd" BEFORE UPDATE ON "RespuestaTeorica"
WHEN (SELECT "estado" FROM "Intento" WHERE "id" = OLD."intentoId") IN ('FINALIZADO', 'ANULADO')
BEGIN SELECT RAISE(ABORT, 'El intento ya está finalizado'); END;
CREATE TRIGGER IF NOT EXISTS "RespuestaTeorica_valor_inmutable" BEFORE UPDATE OF "valor", "preguntaId", "intentoId" ON "RespuestaTeorica"
WHEN (SELECT "estado" <> 'EN_CURSO' OR "modo" IN ('KIOSCO', 'DISPOSITIVO') FROM "Intento" WHERE "id" = OLD."intentoId")
BEGIN SELECT RAISE(ABORT, 'Esta respuesta ya fue enviada y no se puede cambiar'); END;
CREATE TRIGGER IF NOT EXISTS "RespuestaTeorica_inmutable_del" BEFORE DELETE ON "RespuestaTeorica"
WHEN (SELECT "estado" <> 'EN_CURSO' OR "modo" IN ('KIOSCO', 'DISPOSITIVO') FROM "Intento" WHERE "id" = OLD."intentoId")
BEGIN SELECT RAISE(ABORT, 'Esta respuesta ya fue enviada y no se puede cambiar'); END;

-- Práctica de 3 días: bloqueada con intento FINALIZADO/ANULADO.
CREATE TRIGGER IF NOT EXISTS "PracticaDia_inmutable_ins" BEFORE INSERT ON "PracticaDia"
WHEN (SELECT "estado" FROM "Intento" WHERE "id" = NEW."intentoId") IN ('FINALIZADO', 'ANULADO')
BEGIN SELECT RAISE(ABORT, 'El intento ya está finalizado'); END;
CREATE TRIGGER IF NOT EXISTS "PracticaDia_inmutable_upd" BEFORE UPDATE ON "PracticaDia"
WHEN (SELECT "estado" FROM "Intento" WHERE "id" = OLD."intentoId") IN ('FINALIZADO', 'ANULADO')
BEGIN SELECT RAISE(ABORT, 'El intento ya está finalizado'); END;
CREATE TRIGGER IF NOT EXISTS "PracticaDia_inmutable_del" BEFORE DELETE ON "PracticaDia"
WHEN (SELECT "estado" FROM "Intento" WHERE "id" = OLD."intentoId") IN ('FINALIZADO', 'ANULADO')
BEGIN SELECT RAISE(ABORT, 'El intento ya está finalizado'); END;

-- ═══════════════════════════════════════ 6) Asignaciones ═══════════════════════════════════════
-- Una asignación activa por persona × examen, y código único entre las activas.
CREATE UNIQUE INDEX IF NOT EXISTS "Asignacion_una_activa"
  ON "Asignacion" ("personaId", "examenId") WHERE "estado" IN ('PENDIENTE', 'EN_CURSO');
CREATE UNIQUE INDEX IF NOT EXISTS "Asignacion_codigo_activo"
  ON "Asignacion" ("codigo") WHERE "estado" IN ('PENDIENTE', 'EN_CURSO');

-- Transiciones válidas:
--   PENDIENTE → EN_CURSO | CANCELADA | VENCIDA
--   EN_CURSO  → COMPLETADA | VENCIDA (se acabó el tiempo)
--   EN_CURSO  → CANCELADA solo si su intento ya está ANULADO (se anula en la misma transacción) y con motivo.
--   COMPLETADA / CANCELADA / VENCIDA son terminales.
-- v2 (2026-11-14): agrega EN_CURSO → CANCELADA. La v1 "Asignacion_transicion" la borra la migración
-- 20261114000000_asignacion_transicion_v2.
CREATE TRIGGER IF NOT EXISTS "Asignacion_transicion_v2" BEFORE UPDATE OF "estado" ON "Asignacion"
WHEN NEW."estado" IS NOT OLD."estado" AND NOT (
     (OLD."estado" = 'PENDIENTE' AND NEW."estado" IN ('EN_CURSO', 'CANCELADA', 'VENCIDA'))
  OR (OLD."estado" = 'EN_CURSO'  AND NEW."estado" IN ('COMPLETADA', 'VENCIDA'))
  OR (OLD."estado" = 'EN_CURSO'  AND NEW."estado" = 'CANCELADA' AND NEW."motivoCancelacion" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "Intento" i WHERE i."asignacionId" = NEW."id" AND i."estado" = 'ANULADO'))
)
BEGIN SELECT RAISE(ABORT, 'Transición de estado de asignación no válida'); END;

-- Empleado, examen, quién asignó, ronda y código no cambian nunca.
CREATE TRIGGER IF NOT EXISTS "Asignacion_identidad_inmutable" BEFORE UPDATE ON "Asignacion"
WHEN NEW."personaId" IS NOT OLD."personaId" OR NEW."examenId" IS NOT OLD."examenId"
  OR NEW."asignadoPorId" IS NOT OLD."asignadoPorId" OR NEW."ronda" IS NOT OLD."ronda"
  OR NEW."codigo" IS NOT OLD."codigo" OR NEW."asignadoEn" IS NOT OLD."asignadoEn"
BEGIN SELECT RAISE(ABORT, 'No se puede cambiar el empleado, examen, ronda o código de una asignación'); END;

-- Una asignación terminal no cambia en nada.
CREATE TRIGGER IF NOT EXISTS "Asignacion_terminal_inmutable" BEFORE UPDATE ON "Asignacion"
WHEN OLD."estado" IN ('COMPLETADA', 'CANCELADA', 'VENCIDA')
BEGIN SELECT RAISE(ABORT, 'Una asignación completada, cancelada o vencida no se puede modificar'); END;

CREATE TRIGGER IF NOT EXISTS "Asignacion_no_delete" BEFORE DELETE ON "Asignacion"
BEGIN SELECT RAISE(ABORT, 'Las asignaciones no se borran; se cancelan'); END;
