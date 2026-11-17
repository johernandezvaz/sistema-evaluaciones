import { z } from "zod";
import type { Tx } from "./db";
import { db } from "./db";

export const ConfigSchema = z.object({
  umbralKappa80: z.number().min(0).max(1).default(0.8),
  umbralKappa90: z.number().min(0).max(1).default(0.9),
  pesoFisicoDefault: z.number().min(0).max(1).default(0.9),
  pesoTeoricoDefault: z.number().min(0).max(1).default(0.1),
  teoriaMaxDefault: z.number().positive().default(10),
  mesesParaO: z.number().int().min(0).default(6),
  criterioNivel: z.enum(["ULTIMO", "MEJOR"]).default("ULTIMO"),
  recertificacionMeses: z.number().int().positive().nullable().default(null),
  alertaVencimientoDias: z.number().int().min(0).default(30),
  practicaRequerida: z.boolean().default(false),
  recuadroInspeccion: z.enum(["TEORIA_MANUAL"]).default("TEORIA_MANUAL"),
  mostrarResultadoEnKiosco: z.boolean().default(false),
  diasBadgeCambioReciente: z.number().int().min(0).default(30),
  horasVigenciaAsignacion: z.number().positive().default(24),
  minutosMaxExamen: z.number().int().positive().default(120),
  intentosCodigoMax: z.number().int().positive().default(5),
  ventanaBloqueoMin: z.number().int().positive().default(10),
});
export type Config = z.infer<typeof ConfigSchema>;
export const CONFIG_DEFAULTS: Config = ConfigSchema.parse({});

export async function getConfig(client: Tx = db()): Promise<Config> {
  const rows = await client.configuracion.findMany();
  const raw: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      raw[r.clave] = JSON.parse(r.valor);
    } catch {
      // valor corrupto → se ignora y aplica el default
    }
  }
  const parsed = ConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : { ...CONFIG_DEFAULTS, ...pickValid(raw) };
}

function pickValid(raw: Record<string, unknown>): Partial<Config> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const field = ConfigSchema.shape[k as keyof Config];
    if (field && field.safeParse(v).success) out[k] = v;
  }
  return out as Partial<Config>;
}

export async function setConfigValue<K extends keyof Config>(
  key: K,
  value: Config[K],
  usuarioId: string | null,
  client: Tx = db(),
): Promise<void> {
  ConfigSchema.shape[key].parse(value);
  await client.configuracion.upsert({
    where: { clave: key },
    create: { clave: key, valor: JSON.stringify(value), actualizadoPor: usuarioId },
    update: { valor: JSON.stringify(value), actualizadoPor: usuarioId },
  });
}
