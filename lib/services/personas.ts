import type { Actor } from "../domain";import { db } from "../db";
import { AppError, NotFoundError } from "../errors";
import { requirePermission } from "../auth/permissions";
import { registrarAudit } from "./audit";

export const MOTIVO_EMPLEADO_DESACTIVADO = "Empleado desactivado";

export async function desactivarPersona(actor: Actor, personaId: string, opts: { ahora?: Date } = {}) {
  requirePermission(actor, "persona:editar");
  const ahora = opts.ahora ?? new Date();
  return db().$transaction(async (tx) => {
    const p = await tx.persona.findUnique({ where: { id: personaId } });
    if (!p) throw new NotFoundError("El empleado");
    if (!p.activo) throw new AppError("YA_INACTIVO", `${p.nombre} ya está desactivado`, 409);
    await tx.persona.update({ where: { id: personaId }, data: { activo: false } });
    await registrarAudit(tx, actor, {
      accion: "DESACTIVAR",
      entidad: "Persona",
      entidadId: personaId,
      resumen: `Desactivó a ${p.nombre} (${p.numeroEmpleado})`,
    });

    const pendientes = await tx.asignacion.findMany({ where: { personaId, estado: "PENDIENTE" } });
    for (const a of pendientes) {
      await tx.asignacion.update({
        where: { id: a.id },
        data: {
          estado: "CANCELADA",
          canceladaPorId: actor.id,
          canceladaEn: ahora,
          motivoCancelacion: MOTIVO_EMPLEADO_DESACTIVADO,
        },
      });
      await registrarAudit(tx, actor, {
        accion: "CANCELAR",
        entidad: "Asignacion",
        entidadId: a.id,
        resumen: `Asignación cancelada: ${MOTIVO_EMPLEADO_DESACTIVADO}`,
      });
    }
    return { canceladas: pendientes.length };
  });
}

export async function reactivarPersona(actor: Actor, personaId: string) {
  requirePermission(actor, "persona:editar");
  return db().$transaction(async (tx) => {
    const p = await tx.persona.findUnique({ where: { id: personaId } });
    if (!p) throw new NotFoundError("El empleado");
    await tx.persona.update({ where: { id: personaId }, data: { activo: true } });
    await registrarAudit(tx, actor, {
      accion: "ACTIVAR",
      entidad: "Persona",
      entidadId: personaId,
      resumen: `Reactivó a ${p.nombre}`,
    });
  });
}
