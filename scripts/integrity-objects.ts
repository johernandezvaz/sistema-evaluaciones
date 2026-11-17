export type IntegrityObject = { name: string; type: "trigger" | "index"; table: string; partial?: boolean };

const t = (table: string, ...names: string[]): IntegrityObject[] =>
  names.map((name) => ({ name, type: "trigger", table }));

export const PARTIAL_INDEXES: IntegrityObject[] = [
  { name: "ExamenVersion_una_publicada_por_examen", type: "index", table: "ExamenVersion", partial: true },
  { name: "Asignacion_una_activa", type: "index", table: "Asignacion", partial: true },
  { name: "Asignacion_codigo_activo", type: "index", table: "Asignacion", partial: true },
];

export const TRIGGERS: IntegrityObject[] = [
  ...t("AuditLog", "AuditLog_no_update", "AuditLog_no_delete"),
  ...t("ExamenVersion", "ExamenVersion_inmutable", "ExamenVersion_publicar_sin_retroactivo", "ExamenVersion_no_delete"),
  ...t("Pregunta", "Pregunta_inmutable_ins", "Pregunta_inmutable_upd", "Pregunta_inmutable_del"),
  ...t("PiezaClave", "PiezaClave_inmutable_ins", "PiezaClave_inmutable_upd", "PiezaClave_inmutable_del"),
  ...t("ExamenImagen", "ExamenImagen_inmutable_ins", "ExamenImagen_inmutable_upd", "ExamenImagen_inmutable_del"),
  ...t(
    "DiagramaFlecha",
    "DiagramaFlecha_inmutable_ins",
    "DiagramaFlecha_inmutable_upd",
    "DiagramaFlecha_inmutable_del",
  ),
  ...t(
    "Intento",
    "Intento_transicion",
    "Intento_identidad_inmutable",
    "Intento_coherencia_ins",
    "Intento_coherencia_upd",
    "Intento_fisico_inmutable",
    "Intento_calificacion_inmutable",
    "Intento_asignacion_coherente_ins",
    "Intento_asignacion_coherente_upd",
    "Intento_no_delete",
  ),
  ...t(
    "RespuestaPieza",
    "RespuestaPieza_inmutable_ins",
    "RespuestaPieza_inmutable_upd",
    "RespuestaPieza_inmutable_del",
    "RespuestaPieza_kiosco_asignacion_activa",
  ),
  ...t(
    "RespuestaTeorica",
    "RespuestaTeorica_kiosco_asignacion_activa",
    "RespuestaTeorica_inmutable_ins",
    "RespuestaTeorica_finalizada_upd",
    "RespuestaTeorica_valor_inmutable",
    "RespuestaTeorica_inmutable_del",
  ),
  ...t("PracticaDia", "PracticaDia_inmutable_ins", "PracticaDia_inmutable_upd", "PracticaDia_inmutable_del"),
  ...t(
    "Asignacion",
    "Asignacion_transicion_v2",
    "Asignacion_identidad_inmutable",
    "Asignacion_terminal_inmutable",
    "Asignacion_no_delete",
  ),
];

export const INTEGRITY_OBJECTS: IntegrityObject[] = [...PARTIAL_INDEXES, ...TRIGGERS];
export const PROTECTED_NAMES = new Set(INTEGRITY_OBJECTS.map((o) => o.name));
