-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT false,
    "creadoPorId" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desactivadoEn" DATETIME,
    "ultimoAcceso" DATETIME,
    CONSTRAINT "Usuario_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sesion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" DATETIME NOT NULL,
    "revocadaEn" DATETIME,
    "userAgent" TEXT,
    "kioscoIntentoId" TEXT,
    CONSTRAINT "Sesion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "resumen" TEXT,
    "antes" TEXT,
    "despues" TEXT,
    CONSTRAINT "AuditLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Turno" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numeroEmpleado" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "turnoId" TEXT NOT NULL,
    "puesto" TEXT,
    "fechaIngresoPuesto" DATETIME,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "Persona_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Persona_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Modelo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "porConfirmar" BOOLEAN NOT NULL DEFAULT false,
    "notaMapeo" TEXT
);

-- CreateTable
CREATE TABLE "ModeloAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alias" TEXT NOT NULL,
    "aliasKey" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    CONSTRAINT "ModeloAlias_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "Modelo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Examen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modeloId" TEXT NOT NULL,
    "variante" TEXT NOT NULL DEFAULT 'principal',
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "porConfirmar" BOOLEAN NOT NULL DEFAULT false,
    "recertificacionMeses" INTEGER,
    CONSTRAINT "Examen_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "Modelo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExamenVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examenId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "basadaEnId" TEXT,
    "vigenteDesde" DATETIME,
    "vigenteHasta" DATETIME,
    "motivoCambio" TEXT,
    "pesoFisico" REAL NOT NULL DEFAULT 0.9,
    "pesoTeorico" REAL NOT NULL DEFAULT 0.1,
    "teoriaMax" REAL NOT NULL DEFAULT 10,
    "modoTeoria" TEXT NOT NULL DEFAULT 'MANUAL',
    "incluyePractica" BOOLEAN NOT NULL DEFAULT false,
    "requiereSegundaInspeccion" BOOLEAN NOT NULL DEFAULT false,
    "firmas" TEXT NOT NULL DEFAULT '[]',
    "codigoDocumento" TEXT,
    "origenArchivo" TEXT,
    "notas" TEXT,
    "creadoPorId" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicadoPorId" TEXT,
    "publicadoEn" DATETIME,
    CONSTRAINT "ExamenVersion_examenId_fkey" FOREIGN KEY ("examenId") REFERENCES "Examen" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExamenVersion_basadaEnId_fkey" FOREIGN KEY ("basadaEnId") REFERENCES "ExamenVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExamenVersion_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExamenVersion_publicadoPorId_fkey" FOREIGN KEY ("publicadoPorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExamenImagen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "ancho" INTEGER,
    "alto" INTEGER,
    CONSTRAINT "ExamenImagen_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ExamenVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pregunta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "opciones" TEXT NOT NULL DEFAULT '[]',
    "respuestaCorrecta" TEXT,
    "puntaje" REAL,
    "dependeDeId" TEXT,
    "dependeDeValor" TEXT,
    CONSTRAINT "Pregunta_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ExamenVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Pregunta_dependeDeId_fkey" FOREIGN KEY ("dependeDeId") REFERENCES "Pregunta" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiagramaFlecha" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "preguntaId" TEXT NOT NULL,
    "imagenId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "angulo" REAL NOT NULL DEFAULT 0,
    "zonaCorrecta" TEXT,
    CONSTRAINT "DiagramaFlecha_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiagramaFlecha_imagenId_fkey" FOREIGN KEY ("imagenId") REFERENCES "ExamenImagen" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PiezaClave" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "esperado" TEXT,
    "descripcion" TEXT,
    CONSTRAINT "PiezaClave_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ExamenVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asignacion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personaId" TEXT NOT NULL,
    "examenId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "ronda" INTEGER NOT NULL,
    "modoApertura" TEXT,
    "asignadoPorId" TEXT NOT NULL,
    "asignadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venceEn" DATETIME NOT NULL,
    "iniciadaEn" DATETIME,
    "completadaEn" DATETIME,
    "dispositivoId" TEXT,
    "abiertaPorId" TEXT,
    "canceladaPorId" TEXT,
    "canceladaEn" DATETIME,
    "motivoCancelacion" TEXT,
    "vencidaEn" DATETIME,
    "loteId" TEXT,
    CONSTRAINT "Asignacion_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Asignacion_examenId_fkey" FOREIGN KEY ("examenId") REFERENCES "Examen" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Asignacion_asignadoPorId_fkey" FOREIGN KEY ("asignadoPorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Asignacion_canceladaPorId_fkey" FOREIGN KEY ("canceladaPorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Asignacion_dispositivoId_fkey" FOREIGN KEY ("dispositivoId") REFERENCES "Dispositivo" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Asignacion_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "AsignacionLote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AsignacionLote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examenId" TEXT NOT NULL,
    "creadoPorId" TEXT NOT NULL,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nota" TEXT,
    CONSTRAINT "AsignacionLote_examenId_fkey" FOREIGN KEY ("examenId") REFERENCES "Examen" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AsignacionLote_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dispositivo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "ubicacion" TEXT,
    "tokenHash" TEXT,
    "codigoEmparejamientoHash" TEXT,
    "emparejamientoVenceEn" DATETIME,
    "emparejadoEn" DATETIME,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "registradoPorId" TEXT NOT NULL,
    "registradoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUso" DATETIME,
    "revocadoEn" DATETIME,
    "revocadoPorId" TEXT,
    CONSTRAINT "Dispositivo_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KioscoFallo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dispositivoId" TEXT,
    "sesionId" TEXT,
    "numeroEmpleado" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KioscoFallo_dispositivoId_fkey" FOREIGN KEY ("dispositivoId") REFERENCES "Dispositivo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Intento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personaId" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "examenId" TEXT,
    "versionId" TEXT,
    "asignacionId" TEXT,
    "fechaAplicacion" DATETIME NOT NULL,
    "ronda" INTEGER NOT NULL DEFAULT 1,
    "modo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'EN_CURSO',
    "iniciadoEn" DATETIME,
    "enviadoEn" DATETIME,
    "areaNombre" TEXT,
    "turnoNombre" TEXT,
    "puesto" TEXT,
    "aplicadoPorId" TEXT,
    "aplicadoPorNombre" TEXT,
    "segundaInspeccionNombre" TEXT,
    "teoriaManual" REAL,
    "totalPiezas" INTEGER,
    "aciertos" INTEGER,
    "errores" INTEGER,
    "teoriaPuntos" REAL,
    "pctFisico" REAL,
    "pctTeorico" REAL,
    "calificacion" REAL,
    "resultado" TEXT,
    "pesoFisico" REAL,
    "pesoTeorico" REAL,
    "teoriaMax" REAL,
    "umbral80" REAL,
    "umbral90" REAL,
    "calificadoEn" DATETIME,
    "aciertosOriginal" INTEGER,
    "erroresOriginal" INTEGER,
    "calificacionOriginal" REAL,
    "importacionId" TEXT,
    "anuladoPorId" TEXT,
    "anuladoEn" DATETIME,
    "anuladoMotivo" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "Intento_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Intento_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "Modelo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Intento_examenId_fkey" FOREIGN KEY ("examenId") REFERENCES "Examen" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Intento_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ExamenVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Intento_asignacionId_fkey" FOREIGN KEY ("asignacionId") REFERENCES "Asignacion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Intento_aplicadoPorId_fkey" FOREIGN KEY ("aplicadoPorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Intento_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Intento_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "Importacion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RespuestaPieza" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intentoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "respuesta" TEXT NOT NULL,
    "defecto" TEXT,
    "esperado" TEXT NOT NULL,
    "correcta" BOOLEAN NOT NULL,
    CONSTRAINT "RespuestaPieza_intentoId_fkey" FOREIGN KEY ("intentoId") REFERENCES "Intento" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RespuestaTeorica" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intentoId" TEXT NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "correcta" BOOLEAN,
    "puntos" REAL,
    "calificadaPorId" TEXT,
    "calificadaEn" DATETIME,
    CONSTRAINT "RespuestaTeorica_intentoId_fkey" FOREIGN KEY ("intentoId") REFERENCES "Intento" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RespuestaTeorica_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RespuestaTeorica_calificadaPorId_fkey" FOREIGN KEY ("calificadaPorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PracticaDia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intentoId" TEXT NOT NULL,
    "dia" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL,
    "observacion" TEXT,
    CONSTRAINT "PracticaDia_intentoId_fkey" FOREIGN KEY ("intentoId") REFERENCES "Intento" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NivelILUO" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personaId" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "letra" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL,
    "origen" TEXT NOT NULL,
    "intentoId" TEXT,
    "candidatoO" BOOLEAN NOT NULL DEFAULT false,
    "fechaEstimadaO" DATETIME,
    "venceEl" DATETIME,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "NivelILUO_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NivelILUO_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "Modelo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NivelILUOHistorial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personaId" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "letraAnterior" TEXT,
    "letraNueva" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "TipoRequisito" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "soloArea" TEXT,
    "conCalificacion" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "RequisitoPersona" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personaId" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "fecha" DATETIME,
    "calificacion" REAL,
    "usuarioId" TEXT,
    CONSTRAINT "RequisitoPersona_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RequisitoPersona_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "TipoRequisito" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RequisitoPersona_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Configuracion" (
    "clave" TEXT NOT NULL PRIMARY KEY,
    "valor" TEXT NOT NULL,
    "actualizadoEn" DATETIME NOT NULL,
    "actualizadoPor" TEXT
);

-- CreateTable
CREATE TABLE "Importacion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL,
    "archivo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PREVIEW',
    "resumen" TEXT NOT NULL DEFAULT '{}',
    "usuarioId" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Importacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportacionProblema" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importacionId" TEXT NOT NULL,
    "severidad" TEXT NOT NULL,
    "hoja" TEXT,
    "celda" TEXT,
    "codigo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "valorOriginal" TEXT,
    CONSTRAINT "ImportacionProblema_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "Importacion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Sesion_usuarioId_idx" ON "Sesion"("usuarioId");

-- CreateIndex
CREATE INDEX "AuditLog_entidad_entidadId_idx" ON "AuditLog"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "AuditLog_usuarioId_fecha_idx" ON "AuditLog"("usuarioId", "fecha");

-- CreateIndex
CREATE INDEX "AuditLog_fecha_idx" ON "AuditLog"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Area_nombre_key" ON "Area"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Turno_nombre_key" ON "Turno"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_numeroEmpleado_key" ON "Persona"("numeroEmpleado");

-- CreateIndex
CREATE INDEX "Persona_areaId_turnoId_idx" ON "Persona"("areaId", "turnoId");

-- CreateIndex
CREATE UNIQUE INDEX "Modelo_slug_key" ON "Modelo"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Modelo_nombre_key" ON "Modelo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ModeloAlias_aliasKey_key" ON "ModeloAlias"("aliasKey");

-- CreateIndex
CREATE UNIQUE INDEX "Examen_modeloId_variante_key" ON "Examen"("modeloId", "variante");

-- CreateIndex
CREATE INDEX "ExamenVersion_examenId_estado_idx" ON "ExamenVersion"("examenId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "ExamenVersion_examenId_version_key" ON "ExamenVersion"("examenId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Pregunta_versionId_orden_key" ON "Pregunta"("versionId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "DiagramaFlecha_preguntaId_numero_key" ON "DiagramaFlecha"("preguntaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "PiezaClave_versionId_numero_key" ON "PiezaClave"("versionId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "PiezaClave_versionId_orden_key" ON "PiezaClave"("versionId", "orden");

-- CreateIndex
CREATE INDEX "Asignacion_personaId_examenId_estado_idx" ON "Asignacion"("personaId", "examenId", "estado");

-- CreateIndex
CREATE INDEX "Asignacion_estado_venceEn_idx" ON "Asignacion"("estado", "venceEn");

-- CreateIndex
CREATE INDEX "Asignacion_codigo_idx" ON "Asignacion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Dispositivo_tokenHash_key" ON "Dispositivo"("tokenHash");

-- CreateIndex
CREATE INDEX "KioscoFallo_dispositivoId_fecha_idx" ON "KioscoFallo"("dispositivoId", "fecha");

-- CreateIndex
CREATE INDEX "KioscoFallo_sesionId_fecha_idx" ON "KioscoFallo"("sesionId", "fecha");

-- CreateIndex
CREATE INDEX "KioscoFallo_numeroEmpleado_fecha_idx" ON "KioscoFallo"("numeroEmpleado", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Intento_asignacionId_key" ON "Intento"("asignacionId");

-- CreateIndex
CREATE INDEX "Intento_personaId_modeloId_fechaAplicacion_idx" ON "Intento"("personaId", "modeloId", "fechaAplicacion");

-- CreateIndex
CREATE INDEX "Intento_personaId_examenId_fechaAplicacion_idx" ON "Intento"("personaId", "examenId", "fechaAplicacion");

-- CreateIndex
CREATE INDEX "Intento_versionId_idx" ON "Intento"("versionId");

-- CreateIndex
CREATE INDEX "Intento_estado_idx" ON "Intento"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "RespuestaPieza_intentoId_numero_key" ON "RespuestaPieza"("intentoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "RespuestaTeorica_intentoId_preguntaId_key" ON "RespuestaTeorica"("intentoId", "preguntaId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticaDia_intentoId_dia_key" ON "PracticaDia"("intentoId", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "NivelILUO_personaId_modeloId_key" ON "NivelILUO"("personaId", "modeloId");

-- CreateIndex
CREATE INDEX "NivelILUOHistorial_personaId_modeloId_fecha_idx" ON "NivelILUOHistorial"("personaId", "modeloId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "TipoRequisito_codigo_key" ON "TipoRequisito"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "RequisitoPersona_personaId_tipoId_key" ON "RequisitoPersona"("personaId", "tipoId");

-- ═════════════ Integridad (copia de prisma/sql/integridad.sql; también se re-aplica con npm run db:integrity) ═════════════
-- Reglas de integridad que Prisma no puede declarar (triggers e índices parciales).
-- SQLite. (Para PostgreSQL: índices parciales idénticos; los triggers se reescriben como funciones plpgsql.)
-- Son la red de seguridad: la capa de servicio (lib/services/*) valida lo mismo y da mensajes claros.
--
-- IDEMPOTENTE: todo usa IF NOT EXISTS. Se aplica al final de CADA migración con `npm run db:integrity`
-- (lo llaman db:migrate y db:migrate:dev), porque Prisma con SQLite recrea tablas al alterar columnas
-- y en ese proceso se pierden sus triggers e índices parciales.
-- Si agregas o renombras un objeto aquí, actualiza la lista de scripts/integrity-objects.ts.
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
--   PENDIENTE → EN_CURSO | CANCELADA | VENCIDA      EN_CURSO → COMPLETADA | VENCIDA
--   COMPLETADA / CANCELADA / VENCIDA son terminales.
CREATE TRIGGER IF NOT EXISTS "Asignacion_transicion" BEFORE UPDATE OF "estado" ON "Asignacion"
WHEN NEW."estado" IS NOT OLD."estado" AND NOT (
     (OLD."estado" = 'PENDIENTE' AND NEW."estado" IN ('EN_CURSO', 'CANCELADA', 'VENCIDA'))
  OR (OLD."estado" = 'EN_CURSO'  AND NEW."estado" IN ('COMPLETADA', 'VENCIDA'))
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
