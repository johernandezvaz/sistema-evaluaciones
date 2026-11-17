import { z } from "zod";
import type { Actor, LetraILUO } from "../domain";
import { RESULTADOS } from "../domain";
import { db, type Tx } from "../db";
import { AppError, NotFoundError } from "../errors";
import { requirePermission } from "../auth/permissions";
import { getConfig } from "../config";
import { calcularNivel, estadoCandidatoO, MOTIVO_ANTIGUEDAD_O, type NivelCalculado } from "../iluo";
import { registrarAudit } from "./audit";

const ResultadoEnum = z.enum(RESULTADOS);

type Causa = { actor: Actor | null; ahora: Date; motivo?: string; intentoId?: string };

export async function recalcularNivel(
  tx: Tx,
  personaId: string,
  modeloId: string,
  causa: Causa,
): Promise<NivelCalculado | null> {
  const cfg = await getConfig(tx);
  const persona = await tx.persona.findUnique({ where: { id: personaId }, select: { fechaIngresoPuesto: true } });
  if (!persona) throw new NotFoundError("El empleado");

  const [intentos, manuales, actual] = await Promise.all([
    tx.intento.findMany({
      where: { personaId, modeloId, estado: "FINALIZADO", resultado: { not: null }, calificacion: { not: null } },
      select: { id: true, fechaAplicacion: true, creadoEn: true, calificacion: true, resultado: true },
    }),
    tx.nivelILUOHistorial.findMany({
      where: { personaId, modeloId, origen: "MANUAL", letraNueva: { not: null } },
      select: { letraNueva: true, fecha: true },
    }),
    tx.nivelILUO.findUnique({ where: { personaId_modeloId: { personaId, modeloId } } }),
  ]);

  const nuevo = calcularNivel({
    intentos: intentos.map((i) => ({
      id: i.id,
      fechaAplicacion: i.fechaAplicacion,
      creadoEn: i.creadoEn,
      calificacion: i.calificacion!,
      resultado: ResultadoEnum.parse(i.resultado),
    })),
    manuales: manuales.map((m) => ({ letra: m.letraNueva as LetraILUO, fecha: m.fecha })),
    criterio: cfg.criterioNivel,
    fechaIngresoPuesto: persona.fechaIngresoPuesto,
    mesesParaO: cfg.mesesParaO,
  });

  await guardar(tx, personaId, modeloId, actual, nuevo, causa);
  return nuevo;
}

type FilaNivel = Awaited<ReturnType<Tx["nivelILUO"]["findUnique"]>>;

async function guardar(
  tx: Tx,
  personaId: string,
  modeloId: string,
  actual: FilaNivel,
  nuevo: NivelCalculado | null,
  causa: Causa,
) {
  const letraAntes = actual?.letra ?? null;
  const candidatoAntes = actual?.candidatoO ?? false;
  const cambio = letraAntes !== (nuevo?.letra ?? null) || candidatoAntes !== (nuevo?.candidatoO ?? false);

  if (nuevo) {
    const datos = {
      letra: nuevo.letra,
      fecha: nuevo.fecha,
      origen: nuevo.origen,
      intentoId: nuevo.intentoId,
      candidatoO: nuevo.candidatoO,
      fechaEstimadaO: nuevo.fechaEstimadaO,
    };
    await tx.nivelILUO.upsert({
      where: { personaId_modeloId: { personaId, modeloId } },
      create: { personaId, modeloId, ...datos },
      update: datos,
    });
  } else if (actual) {
    await tx.nivelILUO.delete({ where: { id: actual.id } });
  }
  if (!cambio) return;

  const origen = nuevo?.origen ?? "INTENTO";
  const intentoId = nuevo?.intentoId ?? causa.intentoId ?? null;
  await tx.nivelILUOHistorial.create({
    data: {
      personaId,
      modeloId,
      letraAnterior: letraAntes,
      letraNueva: nuevo?.letra ?? null,
      origen,
      intentoId,
      usuarioId: causa.actor?.id ?? null,
      motivo: causa.motivo ?? null,
      fecha: causa.ahora,
    },
  });
  await registrarAudit(tx, causa.actor, {
    accion: "CAMBIAR_NIVEL",
    entidad: "NivelILUO",
    entidadId: `${personaId}:${modeloId}`,
    resumen: `${etiqueta(letraAntes, candidatoAntes)} → ${etiqueta(nuevo?.letra ?? null, nuevo?.candidatoO ?? false)}${causa.motivo ? ` (${causa.motivo})` : ""}`,
    antes: actual ? { letra: actual.letra, candidatoO: actual.candidatoO } : null,
    despues: nuevo ? { letra: nuevo.letra, candidatoO: nuevo.candidatoO, origen, intentoId } : null,
  });
}

const etiqueta = (letra: string | null, candidato: boolean) =>
  letra === null ? "sin nivel" : candidato ? `${letra} (candidato a O)` : letra;


async function cambioManual(
  tx: Tx,
  actor: Actor,
  personaId: string,
  modeloId: string,
  letra: LetraILUO,
  motivo: string,
  ahora: Date,
) {
  const actual = await tx.nivelILUO.findUnique({ where: { personaId_modeloId: { personaId, modeloId } } });
  await tx.nivelILUOHistorial.create({
    data: {
      personaId,
      modeloId,
      letraAnterior: actual?.letra ?? null,
      letraNueva: letra,
      origen: "MANUAL",
      usuarioId: actor.id,
      motivo,
      fecha: ahora,
    },
  });
  const datos = { letra, fecha: ahora, origen: "MANUAL", intentoId: null, candidatoO: false, fechaEstimadaO: null };
  await tx.nivelILUO.upsert({
    where: { personaId_modeloId: { personaId, modeloId } },
    create: { personaId, modeloId, ...datos },
    update: datos,
  });
  await registrarAudit(tx, actor, {
    accion: "CAMBIAR_NIVEL",
    entidad: "NivelILUO",
    entidadId: `${personaId}:${modeloId}`,
    resumen: `${etiqueta(actual?.letra ?? null, actual?.candidatoO ?? false)} → ${letra} (manual: ${motivo})`,
    antes: actual ? { letra: actual.letra, candidatoO: actual.candidatoO } : null,
    despues: { letra, origen: "MANUAL" },
  });
}

async function verificarPersonaModelo(tx: Tx, personaId: string, modeloId: string) {
  const [p, m] = await Promise.all([
    tx.persona.findUnique({ where: { id: personaId }, select: { id: true } }),
    tx.modelo.findUnique({ where: { id: modeloId }, select: { id: true } }),
  ]);
  if (!p) throw new NotFoundError("El empleado");
  if (!m) throw new NotFoundError("El modelo");
}

export async function asignarNivelManual(
  actor: Actor,
  input: { personaId: string; modeloId: string; letra: "I" | "L"; motivo: string },
  opts: { ahora?: Date } = {},
) {
  requirePermission(actor, "iluo:asignar_manual");
  const ahora = opts.ahora ?? new Date();
  const d = z
    .object({
      personaId: z.string().min(1),
      modeloId: z.string().min(1),
      letra: z.enum(["I", "L"]),
      motivo: z.string().trim().min(1, "El motivo es obligatorio").max(500),
    })
    .parse(input);
  return db().$transaction(async (tx) => {
    await verificarPersonaModelo(tx, d.personaId, d.modeloId);
    await cambioManual(tx, actor, d.personaId, d.modeloId, d.letra, d.motivo, ahora);
  });
}

export async function confirmarO(actor: Actor, personaId: string, modeloId: string, opts: { ahora?: Date } = {}) {
  requirePermission(actor, "iluo:asignar_manual");
  const ahora = opts.ahora ?? new Date();
  return db().$transaction(async (tx) => {
    const [nivel, persona, cfg] = await Promise.all([
      tx.nivelILUO.findUnique({ where: { personaId_modeloId: { personaId, modeloId } } }),
      tx.persona.findUnique({ where: { id: personaId }, select: { fechaIngresoPuesto: true } }),
      getConfig(tx),
    ]);
    if (!persona) throw new NotFoundError("El empleado");
    if (!nivel?.candidatoO) throw new AppError("NO_CANDIDATO", "El empleado no es candidato a O en este modelo", 409);
    const e = estadoCandidatoO({
      candidatoO: nivel.candidatoO,
      fechaEstimadaO: nivel.fechaEstimadaO,
      fechaIngresoPuesto: persona.fechaIngresoPuesto,
      mesesParaO: cfg.mesesParaO,
      ahora,
    });
    if (e.faltaFechaIngreso) {
      throw new AppError("FALTA_FECHA_INGRESO", "Falta la fecha de ingreso al puesto del empleado", 409);
    }
    if (!e.listoParaO) {
      throw new AppError("SIN_ANTIGUEDAD", "Todavía no cumple la antigüedad para O", 409);
    }
    await cambioManual(tx, actor, personaId, modeloId, "O", MOTIVO_ANTIGUEDAD_O, ahora);
  });
}
