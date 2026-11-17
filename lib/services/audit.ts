import type { Actor } from "../domain";
import type { Tx } from "../db";

export type EntradaAudit = {
  accion: string;
  entidad: string;
  entidadId?: string | null;
  resumen?: string;
  antes?: unknown;
  despues?: unknown;
};

export async function registrarAudit(tx: Tx, actor: Actor | null, e: EntradaAudit): Promise<void> {
  await tx.auditLog.create({
    data: {
      usuarioId: actor?.id ?? null,
      usuarioNombre: actor?.nombre ?? "Sistema",
      rol: actor?.rol ?? "SISTEMA",
      accion: e.accion,
      entidad: e.entidad,
      entidadId: e.entidadId ?? null,
      resumen: e.resumen ?? null,
      antes: e.antes === undefined ? null : JSON.stringify(e.antes),
      despues: e.despues === undefined ? null : JSON.stringify(e.despues),
    },
  });
}
