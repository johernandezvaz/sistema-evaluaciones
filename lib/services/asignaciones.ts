import { randomInt } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../domain";
import { RespuestaGB } from "../domain";
import { db, esUnicoEn } from "../db";
import { sinContestar, textoFisico } from "../scoring";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { can, requirePermission } from "../auth/permissions";
import { getConfig, type Config } from "../config";
import { addHours, addMinutes, formatFecha } from "../time";
import { registrarAudit } from "./audit";
import { resolverVersion } from "./versiones";
import { calificarIntento, evaluarRespuestaTeorica, siguienteRonda } from "./intentos";

export const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LARGO_CODIGO = 6;

export function generarCodigo(rand: (max: number) => number = randomInt): string {
  let s = "";
  for (let i = 0; i < LARGO_CODIGO; i++) s += ALFABETO_CODIGO[rand(ALFABETO_CODIGO.length)];
  return s;
}

export const normalizarCodigo = (c: string) => c.toUpperCase().replace(/[\s-]/g, "");

type AsignacionConIntento = {
  id: string;
  estado: string;
  venceEn: Date;
  intento: { iniciadoEn: Date | null } | null;
};

export function venceEnEfectivo(a: AsignacionConIntento, cfg: Pick<Config, "minutosMaxExamen">): Date | null {
  if (a.estado === "PENDIENTE") return a.venceEn;
  if (a.estado === "EN_CURSO" && a.intento?.iniciadoEn) return addMinutes(a.intento.iniciadoEn, cfg.minutosMaxExamen);
  return null;
}

async function vencerSiCorresponde(a: AsignacionConIntento, cfg: Config, ahora: Date): Promise<boolean> {
  const limite = venceEnEfectivo(a, cfg);
  if (!limite || limite.getTime() > ahora.getTime()) return false;
  return db().$transaction(async (tx) => {

    const r = await tx.asignacion.updateMany({
      where: { id: a.id, estado: a.estado },
      data: { estado: "VENCIDA", vencidaEn: ahora },
    });
    if (r.count === 0) return false;
    await registrarAudit(tx, null, {
      accion: "VENCER",
      entidad: "Asignacion",
      entidadId: a.id,
      resumen: a.estado === "PENDIENTE" ? "Venció sin empezar" : "Se agotó el tiempo máximo del examen",
    });
    return true;
  });
}

export async function vencerVencidas(
  filtro: { personaId?: string; examenId?: string } = {},
  opts: { ahora?: Date } = {},
) {
  const ahora = opts.ahora ?? new Date();
  const cfg = await getConfig();
  const activas = await db().asignacion.findMany({
    where: { ...filtro, estado: { in: ["PENDIENTE", "EN_CURSO"] } },
    select: { id: true, estado: true, venceEn: true, intento: { select: { iniciadoEn: true } } },
  });
  let n = 0;
  for (const a of activas) if (await vencerSiCorresponde(a, cfg, ahora)) n++;
  return n;
}


export const CrearAsignacionInput = z.object({
  personaId: z.string().min(1),
  examenId: z.string().min(1),
  loteId: z.string().optional(),
});

export async function crearAsignacion(
  actor: Actor,
  input: z.input<typeof CrearAsignacionInput>,
  opts: { ahora?: Date } = {},
) {
  requirePermission(actor, "asignacion:crear");
  const ahora = opts.ahora ?? new Date();
  const d = CrearAsignacionInput.parse(input);
  const cfg = await getConfig();
  await vencerVencidas({ personaId: d.personaId, examenId: d.examenId }, { ahora });

  for (let intento = 0; ; intento++) {
    try {
      return await db().$transaction(async (tx) => {
        const persona = await tx.persona.findUnique({ where: { id: d.personaId } });
        if (!persona) throw new NotFoundError("El empleado");
        if (!persona.activo) throw new AppError("PERSONA_INACTIVA", `${persona.nombre} está desactivado`);
        const examen = await tx.examen.findUnique({ where: { id: d.examenId } });
        if (!examen) throw new NotFoundError("El examen");
        if (!examen.activo) throw new AppError("EXAMEN_INACTIVO", "El examen está desactivado");
        if (!(await resolverVersion(examen.id, ahora, tx))) {
          throw new AppError("SIN_VERSION_PUBLICADA", "El examen no tiene una versión publicada");
        }

        const activa = await tx.asignacion.findFirst({
          where: { personaId: persona.id, examenId: examen.id, estado: { in: ["PENDIENTE", "EN_CURSO"] } },
        });
        if (activa) {
          throw new AppError(
            "ASIGNACION_ACTIVA",
            `${persona.nombre} ya tiene este examen asignado (código ${activa.codigo})`,
            409,
            { asignacionId: activa.id },
          );
        }
        const incompleto = await tx.intento.findFirst({
          where: { personaId: persona.id, examenId: examen.id, estado: "EN_CURSO" },
          orderBy: { fechaAplicacion: "desc" },
        });
        if (incompleto) {
          throw new AppError(
            "INTENTO_INCOMPLETO",
            `Tiene un examen incompleto del ${formatFecha(incompleto.fechaAplicacion)}; un Admin debe anularlo o cerrarlo antes de asignar de nuevo`,
            409,
            {
              intentoId: incompleto.id,
              fecha: incompleto.fechaAplicacion.toISOString(),

              acciones: [
                ...(can(actor, "intento:anular") ? ["ANULAR"] : []),
                ...(can(actor, "intento:cerrar_incompleto") ? ["CERRAR"] : []),
              ],
            },
          );
        }

        const ronda = await siguienteRonda(tx, persona.id, examen.id);
        const asignacion = await tx.asignacion.create({
          data: {
            personaId: persona.id,
            examenId: examen.id,
            codigo: generarCodigo(),
            ronda,
            asignadoPorId: actor.id,
            asignadoEn: ahora,
            venceEn: addHours(ahora, cfg.horasVigenciaAsignacion),
            loteId: d.loteId ?? null,
          },
        });
        await registrarAudit(tx, actor, {
          accion: "ASIGNAR",
          entidad: "Asignacion",
          entidadId: asignacion.id,
          resumen: `Asignó ${examen.nombre} a ${persona.nombre} (${persona.numeroEmpleado}), ronda ${ronda}`,
        });
        return asignacion;
      });
    } catch (e) {

      if (intento < 5 && esUnicoEn(e, "codigo")) continue;
      throw e;
    }
  }
}

export async function asignarMasivo(
  actor: Actor,
  examenId: string,
  personaIds: string[],
  nota?: string,
  opts: { ahora?: Date } = {},
) {
  requirePermission(actor, "asignacion:crear");
  const lote = await db().asignacionLote.create({ data: { examenId, creadoPorId: actor.id, nota: nota ?? null } });
  const resultados: {
    personaId: string;
    ok: boolean;
    asignacionId?: string;
    codigo?: string;
    error?: string;
    code?: string;
  }[] = [];
  for (const personaId of [...new Set(personaIds)]) {
    try {
      const a = await crearAsignacion(actor, { personaId, examenId, loteId: lote.id }, opts);
      resultados.push({ personaId, ok: true, asignacionId: a.id, codigo: a.codigo });
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      resultados.push({ personaId, ok: false, error: e.message, code: e.code });
    }
  }
  return { loteId: lote.id, resultados };
}

export async function cancelarAsignacion(
  actor: Actor,
  asignacionId: string,
  motivo: string,
  opts: { ahora?: Date } = {},
) {
  const ahora = opts.ahora ?? new Date();
  const a = await db().asignacion.findUnique({ where: { id: asignacionId } });
  if (!a) throw new NotFoundError("La asignación");
  requirePermission(
    actor,
    a.asignadoPorId === actor.id ? "asignacion:cancelar_propia" : "asignacion:cancelar_cualquiera",
  );
  if (!motivo.trim()) throw new AppError("MOTIVO_REQUERIDO", "El motivo de cancelación es obligatorio");
  if (a.estado !== "PENDIENTE")
    throw new AppError("NO_CANCELABLE", "Solo se pueden cancelar asignaciones pendientes", 409);
  return db().$transaction(async (tx) => {
    const r = await tx.asignacion.updateMany({
      where: { id: a.id, estado: "PENDIENTE" },
      data: { estado: "CANCELADA", canceladaPorId: actor.id, canceladaEn: ahora, motivoCancelacion: motivo.trim() },
    });
    if (r.count === 0) throw new AppError("NO_CANCELABLE", "La asignación ya no está pendiente", 409);
    await registrarAudit(tx, actor, {
      accion: "CANCELAR",
      entidad: "Asignacion",
      entidadId: a.id,
      resumen: `Canceló la asignación: ${motivo.trim()}`,
    });
  });
}

export type CanalKiosco =
  | { tipo: "SESION"; sesionId: string; actor: Actor }
  | { tipo: "DISPOSITIVO"; dispositivoId: string };

async function verificarBloqueo(canal: CanalKiosco, numeroEmpleado: string, cfg: Config, ahora: Date) {
  const desde = addMinutes(ahora, -cfg.ventanaBloqueoMin);
  const porCanal = await db().kioscoFallo.count({
    where: {
      fecha: { gte: desde },
      ...(canal.tipo === "SESION" ? { sesionId: canal.sesionId } : { dispositivoId: canal.dispositivoId }),
    },
  });
  const porEmpleado = await db().kioscoFallo.count({ where: { fecha: { gte: desde }, numeroEmpleado } });
  if (porCanal >= cfg.intentosCodigoMax || porEmpleado >= cfg.intentosCodigoMax) {
    throw new AppError(
      "BLOQUEADO",
      `Demasiados intentos fallidos. Espera ${cfg.ventanaBloqueoMin} minutos o pide ayuda a tu supervisor.`,
      429,
    );
  }
}

export async function abrirAsignacion(
  canal: CanalKiosco,
  numeroEmpleado: string,
  codigoTecleado: string,
  opts: { ahora?: Date } = {},
) {
  const ahora = opts.ahora ?? new Date();
  const cfg = await getConfig();
  const numero = numeroEmpleado.trim();
  const codigo = normalizarCodigo(codigoTecleado);

  if (canal.tipo === "SESION") requirePermission(canal.actor, "asignacion:abrir_aqui");
  else {
    const disp = await db().dispositivo.findUnique({ where: { id: canal.dispositivoId } });
    if (!disp || !disp.activo || disp.revocadoEn || !disp.tokenHash)
      throw new ForbiddenError("Esta tablet no está autorizada");
  }
  await verificarBloqueo(canal, numero, cfg, ahora);

  const persona = await db().persona.findUnique({
    where: { numeroEmpleado: numero },
    include: { area: true, turno: true },
  });
  const asig =
    persona?.activo &&
    (await db().asignacion.findFirst({
      where: { personaId: persona.id, codigo, estado: { in: ["PENDIENTE", "EN_CURSO"] } },
      include: { intento: true, examen: true },
    }));
  if (!persona || !asig) {
    await db().kioscoFallo.create({
      data: {
        numeroEmpleado: numero,
        codigo: codigo.slice(0, 12),
        fecha: ahora,
        ...(canal.tipo === "SESION" ? { sesionId: canal.sesionId } : { dispositivoId: canal.dispositivoId }),
      },
    });

    throw new AppError("CODIGO_INVALIDO", "Número de empleado o código incorrecto", 400);
  }
  if (await vencerSiCorresponde(asig, cfg, ahora)) {
    throw new AppError("ASIGNACION_VENCIDA", "Esta asignación venció. Pide una nueva a tu supervisor.", 409);
  }

  if (asig.estado === "EN_CURSO") {

    return { intentoId: asig.intento!.id, asignacionId: asig.id, reanudado: true };
  }

  return db().$transaction(async (tx) => {
    const version = await resolverVersion(asig.examenId, ahora, tx);
    if (!version) throw new AppError("SIN_VERSION_PUBLICADA", "El examen no tiene una versión publicada");
    const modo = canal.tipo === "SESION" ? "KIOSCO" : "DISPOSITIVO";

    const intento = await tx.intento.create({
      data: {
        personaId: persona.id,
        modeloId: asig.examen.modeloId,
        examenId: asig.examenId,
        versionId: version.id, 
        asignacionId: asig.id,
        fechaAplicacion: ahora,
        iniciadoEn: ahora,
        ronda: asig.ronda,
        modo,
        areaNombre: persona.area.nombre,
        turnoNombre: persona.turno.nombre,
        puesto: persona.puesto,
        aplicadoPorId: canal.tipo === "SESION" ? canal.actor.id : asig.asignadoPorId,
      },
    });
    const r = await tx.asignacion.updateMany({
      where: { id: asig.id, estado: "PENDIENTE" },
      data: {
        estado: "EN_CURSO",
        iniciadaEn: ahora,
        modoApertura: canal.tipo === "SESION" ? "ESTA_TABLET" : "DISPOSITIVO",
        ...(canal.tipo === "SESION" ? { abiertaPorId: canal.actor.id } : { dispositivoId: canal.dispositivoId }),
      },
    });
    if (r.count === 0) throw new AppError("YA_ABIERTA", "La asignación ya se abrió en otro lugar", 409);
    if (canal.tipo === "DISPOSITIVO")
      await tx.dispositivo.update({ where: { id: canal.dispositivoId }, data: { ultimoUso: ahora } });
    await registrarAudit(tx, canal.tipo === "SESION" ? canal.actor : null, {
      accion: "INICIAR",
      entidad: "Intento",
      entidadId: intento.id,
      resumen: `${persona.nombre} inició ${asig.examen.nombre} v${version.version} (${modo === "KIOSCO" ? "Abrir aquí" : "tablet compartida"})`,
    });
    return { intentoId: intento.id, asignacionId: asig.id, reanudado: false };
  });
}

async function intentoKioscoActivo(intentoId: string, ahora: Date) {
  const cfg = await getConfig();
  const it = await db().intento.findUnique({
    where: { id: intentoId },
    include: { asignacion: { include: { intento: { select: { iniciadoEn: true } } } } },
  });
  if (!it) throw new NotFoundError("El examen");
  if ((it.modo !== "KIOSCO" && it.modo !== "DISPOSITIVO") || !it.asignacion) {
    throw new AppError("NO_ES_KIOSCO", "Este intento no se contesta en kiosco", 400);
  }
  if (it.estado !== "EN_CURSO" || it.asignacion.estado !== "EN_CURSO") {
    throw new AppError("ASIGNACION_NO_EN_CURSO", "Este examen ya no acepta respuestas", 409);
  }
  if (await vencerSiCorresponde(it.asignacion, cfg, ahora)) {
    throw new AppError("TIEMPO_AGOTADO", "Se agotó el tiempo del examen. Avisa a tu supervisor.", 409);
  }
  return { it, cfg };
}

export const RespuestaPiezaInput = z.object({
  numero: z.number().int(),
  respuesta: RespuestaGB,
  defecto: z.string().trim().max(200).optional(),
});

export async function responderPieza(
  intentoId: string,
  input: z.input<typeof RespuestaPiezaInput>,
  opts: { ahora?: Date } = {},
) {
  const ahora = opts.ahora ?? new Date();
  const d = RespuestaPiezaInput.parse(input);
  const { it } = await intentoKioscoActivo(intentoId, ahora);
  await db().$transaction(async (tx) => {
    const clave = await tx.piezaClave.findUnique({
      where: { versionId_numero: { versionId: it.versionId!, numero: d.numero } },
    });
    if (!clave?.esperado) throw new AppError("PIEZA_INEXISTENTE", `La pieza ${d.numero} no existe en este examen`);
    const ya = await tx.respuestaPieza.findUnique({ where: { intentoId_numero: { intentoId, numero: d.numero } } });
    if (ya) throw new AppError("RESPUESTA_YA_ENVIADA", `La pieza ${d.numero} ya fue contestada`, 409);
    await tx.respuestaPieza.create({
      data: {
        intentoId,
        numero: d.numero,
        respuesta: d.respuesta,
        defecto: d.defecto || null,
        esperado: clave.esperado,
        correcta: clave.esperado === d.respuesta,
      },
    });
  });
  return { ok: true as const };
}

export async function responderTeorica(
  intentoId: string,
  preguntaId: string,
  valor: unknown,
  opts: { ahora?: Date } = {},
) {
  const ahora = opts.ahora ?? new Date();
  const { it } = await intentoKioscoActivo(intentoId, ahora);
  await db().$transaction(async (tx) => {
    const q = await tx.pregunta.findUnique({ where: { id: preguntaId }, include: { flechas: true } });
    if (!q || q.versionId !== it.versionId)
      throw new AppError("PREGUNTA_INEXISTENTE", "La pregunta no pertenece a este examen");
    const ya = await tx.respuestaTeorica.findUnique({ where: { intentoId_preguntaId: { intentoId, preguntaId } } });
    if (ya) throw new AppError("RESPUESTA_YA_ENVIADA", "Esta pregunta ya fue contestada", 409);
    await tx.respuestaTeorica.create({
      data: {
        intentoId,
        preguntaId,
        valor: JSON.stringify(valor ?? null),
        correcta: evaluarRespuestaTeorica(q, valor),
      },
    });
  });
  return { ok: true as const };
}

export async function enviarExamen(intentoId: string, opts: { ahora?: Date } = {}) {
  const ahora = opts.ahora ?? new Date();
  const { it, cfg } = await intentoKioscoActivo(intentoId, ahora);
  const r = await db().$transaction(async (tx) => {
    const final = await calificarIntento(tx, intentoId, ahora, { enviadoEn: ahora });
    const a = await tx.asignacion.updateMany({
      where: { id: it.asignacionId!, estado: "EN_CURSO" },
      data: { estado: "COMPLETADA", completadaEn: ahora },
    });
    if (a.count === 0) throw new AppError("ASIGNACION_NO_EN_CURSO", "Este examen ya no acepta respuestas", 409);
    await registrarAudit(tx, null, {
      accion: "ENVIAR",
      entidad: "Intento",
      entidadId: intentoId,
      resumen: `Examen enviado (${final.estado})`,
    });
    return final;
  });
  if (!(cfg.mostrarResultadoEnKiosco && r.estado === "FINALIZADO")) return { estado: r.estado, resultado: null };
  const respondidas = await db().respuestaPieza.count({ where: { intentoId } });
  const faltaron = sinContestar(r.totalPiezas!, respondidas);
  return {
    estado: r.estado,
    resultado: {
      calificacion: r.calificacion,
      resultado: r.resultado,
      sinContestar: faltaron,
      fisico: textoFisico(r.aciertos!, r.totalPiezas!, faltaron),
    },
  };
}


export type ExamenKioscoDTO = {
  intentoId: string;
  examen: string;
  version: number;
  persona: { nombre: string; numeroEmpleado: string };
  terminaEn: string | null;
  piezas: { orden: number; numero: number }[];
  imagenes: { id: string; ruta: string; orden: number; ancho: number | null; alto: number | null }[];
  preguntas: {
    id: string;
    orden: number;
    tipo: string;
    texto: string;
    opciones: unknown;
    dependeDeId: string | null;
    dependeDeValor: string | null;
    flechas: { numero: number; imagenId: string; x: number; y: number; angulo: number }[];
  }[];
  contestadas: {
    piezas: { numero: number; respuesta: string; defecto: string | null }[];
    preguntas: { preguntaId: string; valor: unknown }[];
  };
};

export async function examenParaKiosco(intentoId: string, opts: { ahora?: Date } = {}): Promise<ExamenKioscoDTO> {
  const ahora = opts.ahora ?? new Date();
  const { it, cfg } = await intentoKioscoActivo(intentoId, ahora);
  const full = await db().intento.findUniqueOrThrow({
    where: { id: it.id },
    include: {
      persona: true,
      examen: true,
      version: {
        include: {
          piezas: { orderBy: { orden: "asc" } },
          imagenes: { orderBy: { orden: "asc" } },
          preguntas: { orderBy: { orden: "asc" }, include: { flechas: true } },
        },
      },
      piezas: true,
      teoricas: true,
    },
  });
  const v = full.version!;
  return {
    intentoId: full.id,
    examen: full.examen!.nombre,
    version: v.version,
    persona: { nombre: full.persona.nombre, numeroEmpleado: full.persona.numeroEmpleado },
    terminaEn: full.iniciadoEn ? addMinutes(full.iniciadoEn, cfg.minutosMaxExamen).toISOString() : null,
    piezas: v.piezas.map((p) => ({ orden: p.orden, numero: p.numero })),
    imagenes: v.imagenes.map((i) => ({ id: i.id, ruta: i.ruta, orden: i.orden, ancho: i.ancho, alto: i.alto })),
    preguntas: v.preguntas.map((q) => ({
      id: q.id,
      orden: q.orden,
      tipo: q.tipo,
      texto: q.texto,
      opciones: (JSON.parse(q.opciones) as { clave: string; texto: string }[]).map((o) => ({
        clave: o.clave,
        texto: o.texto,
      })),
      dependeDeId: q.dependeDeId,
      dependeDeValor: q.dependeDeValor,
      flechas: q.flechas.map((f) => ({ numero: f.numero, imagenId: f.imagenId, x: f.x, y: f.y, angulo: f.angulo })),
    })),
    contestadas: {
      piezas: full.piezas.map((p) => ({ numero: p.numero, respuesta: p.respuesta, defecto: p.defecto })),
      preguntas: full.teoricas.map((t) => ({ preguntaId: t.preguntaId, valor: JSON.parse(t.valor) as unknown })),
    },
  };
}
