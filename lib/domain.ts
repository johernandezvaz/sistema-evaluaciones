import { z } from "zod";
export const ROLES = ["SUPERADMIN", "ADMIN", "LECTURA"] as const;
export const Rol = z.enum(ROLES);
export type Rol = z.infer<typeof Rol>;

export const ESTADOS_VERSION = ["BORRADOR", "PUBLICADA", "REEMPLAZADA"] as const;
export const ESTADOS_INTENTO = ["EN_CURSO", "PENDIENTE_CALIFICAR", "FINALIZADO", "ANULADO"] as const;
export type EstadoIntento = (typeof ESTADOS_INTENTO)[number];
export const MODOS_INTENTO = ["KIOSCO", "DISPOSITIVO", "CAPTURA_PAPEL", "IMPORTADO"] as const;
export type ModoIntento = (typeof MODOS_INTENTO)[number];
export const ESTADOS_ASIGNACION = ["PENDIENTE", "EN_CURSO", "COMPLETADA", "CANCELADA", "VENCIDA"] as const;
export type EstadoAsignacion = (typeof ESTADOS_ASIGNACION)[number];
export const ESTADOS_ASIGNACION_ACTIVOS: EstadoAsignacion[] = ["PENDIENTE", "EN_CURSO"];

export const TIPOS_PREGUNTA = [
  "OPCION_MULTIPLE",
  "SI_NO",
  "TEXTO_ABIERTO",
  "ETIQUETAR_DIAGRAMA",
  "CONDICIONAL",
] as const;
export type TipoPregunta = (typeof TIPOS_PREGUNTA)[number];

export const RespuestaGB = z.enum(["G", "B"]);
export type RespuestaGB = z.infer<typeof RespuestaGB>;

export const RESULTADOS = ["REPROBADO", "KAPPA_80", "KAPPA_90"] as const;
export type Resultado = (typeof RESULTADOS)[number];

export const LETRAS_ILUO = ["I", "L", "U", "O"] as const;
export type LetraILUO = (typeof LETRAS_ILUO)[number];

export type Actor = { id: string; nombre: string; rol: Rol };
