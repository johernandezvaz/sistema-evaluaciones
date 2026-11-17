import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { Actor } from "../domain";
import { RespuestaGB } from "../domain";
import { db, type Tx } from "../db";
import { AppError, NotFoundError } from "../errors";
import { requirePermission } from "../auth/permissions";
import { getConfig, type Config } from "../config";
import { calificarFisico, calificacionFinal, redondear4 } from "../scoring";
import { registrarAudit } from "./audit";
import { resolverVersion } from "./versiones";
import { recalcularNivel } from "./iluo";

export async function siguienteRonda(tx: Tx, personaId: string, examenId: string): Promise<number> {
  const r = await tx.intento.aggregate({ where: { personaId, examenId }, _max: { ronda: true } });
  return (r._max.ronda ?? 0) + 1;
}

type PreguntaEval = {
  tipo: string;
  respuestaCorrecta: string | null;
  flechas: { numero: number; zonaCorrecta: string | null }[];
};

export function evaluarRespuestaTeorica(p: PreguntaEval, valor: unknown): boolean | null {
  switch (p.tipo) {
    case "TEXTO_ABIERTO":
      return null;
    case "ETIQUETAR_DIAGRAMA": {
      if (p.flechas.length === 0 || p.flechas.some((f) => f.zonaCorrecta === null)) return null;
      const v = (valor ?? {}) as Record<string, unknown>;
      return p.flechas.every((f) => v[String(f.numero)] === f.zonaCorrecta);
    }
    default: {
      if (p.respuestaCorrecta === null) return null;
      return JSON.stringify(valor) === JSON.stringify(JSON.parse(p.respuestaCorrecta));
    }
  }
}

const cargarParaCalificar = (tx: Tx, intentoId: string) =>
  tx.intento.findUnique({
    where: { id: intentoId },
    include: {
      version: { include: { piezas: true, preguntas: { include: { flechas: true } } } },
      piezas: true,
      teoricas: true,
    },
  });
type IntentoCompleto = NonNullable<Awaited<ReturnType<typeof cargarParaCalificar>>>;

function puntosTeoria(it: IntentoCompleto): number | null {
  const v = it.version!;
  if (v.modoTeoria === "MANUAL") return it.teoriaManual;
  const porPregunta = new Map(it.teoricas.map((t) => [t.preguntaId, t]));
  let total = 0;
  for (const q of v.preguntas) {
    if (q.dependeDeId) {
      const padre = porPregunta.get(q.dependeDeId);
      if (!padre || JSON.parse(padre.valor) !== q.dependeDeValor) continue; 
    }
    const r = porPregunta.get(q.id);
    if (!r) continue; 
    if (r.puntos !== null) total += r.puntos;
    else if (q.tipo === "TEXTO_ABIERTO") return null;
    else if (r.correcta === null) return null;
    else total += r.correcta ? (q.puntaje ?? 0) : 0;
  }
  return redondear4(Math.min(total, v.teoriaMax));
}

async function calificar(
  tx: Tx,
  intentoId: string,
  cfg: Config,
  ahora: Date,
  extra: { enviadoEn?: Date },
  actor: Actor | null,
) {
  const it = await cargarParaCalificar(tx, intentoId);
  if (!it) throw new NotFoundError("El intento");
  if (!it.version) throw new AppError("SIN_VERSION", "El intento no tiene versión de examen");
  if (it.estado !== "EN_CURSO" && it.estado !== "PENDIENTE_CALIFICAR") {
    throw new AppError("INTENTO_CERRADO", "El intento ya está finalizado o anulado", 409);
  }

  let fisico = { totalPiezas: it.totalPiezas, aciertos: it.aciertos };
  const data: Prisma.IntentoUncheckedUpdateInput = { ...extra };
  if (it.estado === "EN_CURSO") {
    const f = calificarFisico(
      it.version.piezas.map((p) => ({ numero: p.numero, esperado: RespuestaGB.parse(p.esperado) })),
      it.piezas.map((p) => ({ numero: p.numero, respuesta: RespuestaGB.parse(p.respuesta) })),
    );
    fisico = f;
    Object.assign(data, {
      totalPiezas: f.totalPiezas,
      aciertos: f.aciertos,
      errores: f.errores,
      pctFisico: f.pctFisico,
    });
  }

  const teoria = puntosTeoria(it);
  if (teoria === null) {
    data.estado = "PENDIENTE_CALIFICAR";
  } else {
    const reglas = {
      pesoFisico: it.version.pesoFisico,
      pesoTeorico: it.version.pesoTeorico,
      teoriaMax: it.version.teoriaMax,
      umbral80: cfg.umbralKappa80,
      umbral90: cfg.umbralKappa90,
    };
    const r = calificacionFinal({
      aciertos: fisico.aciertos!,
      totalPiezas: fisico.totalPiezas!,
      teoriaPuntos: teoria,
      reglas,
    });
    Object.assign(data, {
      estado: "FINALIZADO",
      teoriaPuntos: teoria,
      pctTeorico: r.pctTeorico,
      calificacion: r.final,
      resultado: r.resultado,
      ...reglas,
      calificadoEn: ahora,
    });
  }
  const r = await tx.intento.update({ where: { id: intentoId }, data });
  if (r.estado === "FINALIZADO") {
    await recalcularNivel(tx, r.personaId, r.modeloId, { actor, ahora, intentoId: r.id });
  }
  return r;
}

export async function calificarIntento(
  tx: Tx,
  intentoId: string,
  ahora: Date,
  extra: { enviadoEn?: Date } = {},
  actor: Actor | null = null,
) {
  return calificar(tx, intentoId, await getConfig(tx), ahora, extra, actor);
}


export const CapturaPapelInput = z.object({
  personaId: z.string().min(1),
  examenId: z.string().min(1),
  fechaAplicacion: z.coerce.date(),
  piezas: z.array(
    z.object({ numero: z.number().int(), respuesta: RespuestaGB, defecto: z.string().trim().max(200).optional() }),
  ),
  teoriaManual: z.number().min(0).optional(),
  ronda: z.number().int().positive().optional(),
  aplicadoPorNombre: z.string().trim().max(120).optional(),
  segundaInspeccionNombre: z.string().trim().max(120).optional(),
});

export async function capturarPapel(
  actor: Actor,
  input: z.input<typeof CapturaPapelInput>,
  opts: { ahora?: Date } = {},
) {
  requirePermission(actor, "intento:capturar_papel");
  const ahora = opts.ahora ?? new Date();
  const d = CapturaPapelInput.parse(input);
  if (d.fechaAplicacion.getTime() > ahora.getTime()) {
    throw new AppError("FECHA_FUTURA", "La fecha de aplicación no puede estar en el futuro");
  }
  return db().$transaction(async (tx) => {
    const persona = await tx.persona.findUnique({ where: { id: d.personaId }, include: { area: true, turno: true } });
    if (!persona) throw new NotFoundError("El empleado");
    const examen = await tx.examen.findUnique({ where: { id: d.examenId } });
    if (!examen) throw new NotFoundError("El examen");
    const version = await resolverVersion(d.examenId, d.fechaAplicacion, tx);
    if (!version)
      throw new AppError("SIN_VERSION_EN_FECHA", "No había una versión publicada de este examen en esa fecha");
    const clave = await tx.piezaClave.findMany({ where: { versionId: version.id } });
    const esperado = new Map(clave.map((p) => [p.numero, p.esperado!]));
    const desconocidas = d.piezas.filter((p) => !esperado.has(p.numero)).map((p) => p.numero);
    if (desconocidas.length)
      throw new AppError(
        "PIEZA_INEXISTENTE",
        `Piezas que no existen en v${version.version}: ${desconocidas.join(", ")}`,
      );
    if (d.teoriaManual !== undefined && d.teoriaManual > version.teoriaMax) {
      throw new AppError("TEORIA_FUERA_DE_RANGO", `La teoría debe estar entre 0 y ${version.teoriaMax}`);
    }

    const intento = await tx.intento.create({
      data: {
        personaId: persona.id,
        modeloId: examen.modeloId,
        examenId: examen.id,
        versionId: version.id,
        fechaAplicacion: d.fechaAplicacion,
        ronda: d.ronda ?? (await siguienteRonda(tx, persona.id, examen.id)),
        modo: "CAPTURA_PAPEL",
        areaNombre: persona.area.nombre,
        turnoNombre: persona.turno.nombre,
        puesto: persona.puesto,
        aplicadoPorId: actor.id,
        aplicadoPorNombre: d.aplicadoPorNombre ?? null,
        segundaInspeccionNombre: d.segundaInspeccionNombre ?? null,
        teoriaManual: d.teoriaManual ?? null,
      },
    });
    await tx.respuestaPieza.createMany({
      data: d.piezas.map((p) => {
        const e = esperado.get(p.numero)!;
        return {
          intentoId: intento.id,
          numero: p.numero,
          respuesta: p.respuesta,
          defecto: p.defecto || null,
          esperado: e,
          correcta: e === p.respuesta,
        };
      }),
    });
    const final = await calificarIntento(tx, intento.id, ahora, { enviadoEn: ahora }, actor);
    await registrarAudit(tx, actor, {
      accion: "CAPTURAR",
      entidad: "Intento",
      entidadId: intento.id,
      resumen: `Capturó en papel ${examen.nombre} de ${persona.nombre} (${persona.numeroEmpleado}), aplicado ${d.fechaAplicacion.toISOString()}, v${version.version}`,
    });
    return final;
  });
}


export async function capturarTeoriaManual(
  actor: Actor,
  intentoId: string,
  puntos: number,
  opts: { ahora?: Date } = {},
) {
  requirePermission(actor, "intento:calificar");
  const ahora = opts.ahora ?? new Date();
  return db().$transaction(async (tx) => {
    const it = await tx.intento.findUnique({ where: { id: intentoId }, include: { version: true } });
    if (!it?.version) throw new NotFoundError("El intento");
    if (it.estado !== "PENDIENTE_CALIFICAR")
      throw new AppError("NO_PENDIENTE", "El intento no está pendiente de calificar", 409);
    if (it.version.modoTeoria !== "MANUAL")
      throw new AppError("MODO_TEORIA", "Esta versión califica la teoría por pregunta");
    if (!(puntos >= 0 && puntos <= it.version.teoriaMax)) {
      throw new AppError("TEORIA_FUERA_DE_RANGO", `La teoría debe estar entre 0 y ${it.version.teoriaMax}`);
    }
    await tx.intento.update({ where: { id: intentoId }, data: { teoriaManual: puntos } });
    const r = await calificarIntento(tx, intentoId, ahora, {}, actor);
    await registrarAudit(tx, actor, {
      accion: "CALIFICAR",
      entidad: "Intento",
      entidadId: intentoId,
      resumen: `Capturó teoría ${puntos}`,
      despues: { calificacion: r.calificacion, resultado: r.resultado },
    });
    return r;
  });
}

export async function calificarRespuestaAbierta(
  actor: Actor,
  respuestaId: string,
  puntos: number,
  opts: { ahora?: Date } = {},
) {
  requirePermission(actor, "intento:calificar");
  const ahora = opts.ahora ?? new Date();
  return db().$transaction(async (tx) => {
    const r = await tx.respuestaTeorica.findUnique({
      where: { id: respuestaId },
      include: { pregunta: true, intento: true },
    });
    if (!r) throw new NotFoundError("La respuesta");
    if (r.intento.estado !== "PENDIENTE_CALIFICAR")
      throw new AppError("NO_PENDIENTE", "El intento no está pendiente de calificar", 409);
    const max = r.pregunta.puntaje ?? 0;
    if (!(puntos >= 0 && puntos <= max))
      throw new AppError("PUNTOS_FUERA_DE_RANGO", `Los puntos deben estar entre 0 y ${max}`);
    await tx.respuestaTeorica.update({
      where: { id: respuestaId },
      data: { puntos, calificadaPorId: actor.id, calificadaEn: ahora },
    });
    const it = await calificarIntento(tx, r.intentoId, ahora, {}, actor);
    await registrarAudit(tx, actor, {
      accion: "CALIFICAR",
      entidad: "RespuestaTeorica",
      entidadId: respuestaId,
      resumen: `Calificó pregunta abierta con ${puntos}`,
    });
    return it;
  });
}


export async function anularIntento(actor: Actor, intentoId: string, motivo: string, opts: { ahora?: Date } = {}) {
  requirePermission(actor, "intento:anular");
  const ahora = opts.ahora ?? new Date();
  if (!motivo.trim()) throw new AppError("MOTIVO_REQUERIDO", "El motivo de anulación es obligatorio");
  return db().$transaction(async (tx) => {
    const it = await tx.intento.findUnique({ where: { id: intentoId }, include: { asignacion: true } });
    if (!it) throw new NotFoundError("El intento");
    if (it.estado === "ANULADO") throw new AppError("YA_ANULADO", "El intento ya está anulado", 409);
    const r = await tx.intento.update({
      where: { id: intentoId },
      data: { estado: "ANULADO", anuladoPorId: actor.id, anuladoEn: ahora, anuladoMotivo: motivo.trim() },
    });

    if (it.asignacion?.estado === "EN_CURSO") {
      await tx.asignacion.update({
        where: { id: it.asignacion.id },
        data: { estado: "CANCELADA", canceladaPorId: actor.id, canceladaEn: ahora, motivoCancelacion: motivo.trim() },
      });
    }

    if (it.estado === "FINALIZADO") {
      await recalcularNivel(tx, it.personaId, it.modeloId, {
        actor,
        ahora,
        intentoId,
        motivo: `Anulación de intento: ${motivo.trim()}`,
      });
    }
    await registrarAudit(tx, actor, {
      accion: "ANULAR",
      entidad: "Intento",
      entidadId: intentoId,
      resumen: `Anuló el intento: ${motivo.trim()}`,
      antes: { estado: it.estado },
    });
    return r;
  });
}
export async function cerrarIncompleto(actor: Actor, intentoId: string, opts: { ahora?: Date } = {}) {
  requirePermission(actor, "intento:cerrar_incompleto");
  const ahora = opts.ahora ?? new Date();
  return db().$transaction(async (tx) => {
    const it = await tx.intento.findUnique({ where: { id: intentoId }, include: { asignacion: true } });
    if (!it) throw new NotFoundError("El intento");
    if (it.estado !== "EN_CURSO") throw new AppError("NO_INCOMPLETO", "El intento no está incompleto", 409);
    if (it.asignacion?.estado === "EN_CURSO") {
      const cfg = await getConfig(tx);
      const limite = it.iniciadoEn ? it.iniciadoEn.getTime() + cfg.minutosMaxExamen * 60_000 : Infinity;
      if (limite > ahora.getTime()) {
        throw new AppError("AUN_EN_CURSO", "El examen sigue en curso; espera a que termine o venza", 409);
      }
      await tx.asignacion.update({ where: { id: it.asignacion.id }, data: { estado: "VENCIDA", vencidaEn: ahora } });
    }
    const r = await calificarIntento(tx, intentoId, ahora, { enviadoEn: ahora }, actor);
    await registrarAudit(tx, actor, {
      accion: "CERRAR_INCOMPLETO",
      entidad: "Intento",
      entidadId: intentoId,
      resumen: "Cerró un examen incompleto con lo contestado",
      despues: { estado: r.estado, calificacion: r.calificacion },
    });
    return r;
  });
}
