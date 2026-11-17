import type { Actor } from "../domain";
import { db } from "../db";
import { NotFoundError } from "../errors";
import { requirePermission, can } from "../auth/permissions";
import { sinContestar, textoFisico } from "../scoring";
import { evaluarRespuestaTeorica } from "./intentos";

export type EvaluacionPregunta = "CORRECTA" | "INCORRECTA" | "MANUAL" | "SIN_CLAVE" | "SIN_CONTESTAR" | "NO_APLICA";

const parse = (s: string | null): unknown => {
  if (s === null) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

export async function datosParaCalificar(actor: Actor, intentoId: string) {
  requirePermission(actor, "ver");
  const it = await db().intento.findUnique({
    where: { id: intentoId },
    include: {
      persona: true,
      examen: true,
      version: {
        include: {
          piezas: { orderBy: { orden: "asc" } },
          preguntas: { orderBy: { orden: "asc" }, include: { flechas: true } },
        },
      },
      piezas: true,
      teoricas: true,
    },
  });
  if (!it?.version) throw new NotFoundError("El intento");
  const v = it.version;
  const nivel = await db().nivelILUO.findUnique({
    where: { personaId_modeloId: { personaId: it.personaId, modeloId: it.modeloId } },
    select: { letra: true, candidatoO: true, origen: true, intentoId: true },
  });

  const porNumero = new Map(it.piezas.map((p) => [p.numero, p]));
  const piezas = v.piezas.map((k) => {
    const r = porNumero.get(k.numero);
    return {
      numero: k.numero,
      esperado: k.esperado,
      respuesta: r?.respuesta ?? null,
      defecto: r?.defecto ?? null,
      correcta: r ? r.correcta : false,
    };
  });
  const faltaron = sinContestar(v.piezas.length, it.piezas.length);
  const aciertos = it.aciertos ?? piezas.filter((p) => p.correcta).length;
  const total = it.totalPiezas ?? v.piezas.length;

  const porPregunta = new Map(it.teoricas.map((t) => [t.preguntaId, t]));
  const preguntas = v.preguntas.map((q) => {
    const r = porPregunta.get(q.id);
    const valor = r ? parse(r.valor) : null;
    let evaluacion: EvaluacionPregunta | undefined;
    if (q.dependeDeId) {
      const padre = porPregunta.get(q.dependeDeId);
      if (!padre || parse(padre.valor) !== q.dependeDeValor) evaluacion = "NO_APLICA";
    }
    evaluacion ??= !r
      ? "SIN_CONTESTAR"
      : q.tipo === "TEXTO_ABIERTO"
        ? "MANUAL"
        : (() => {
            const ok = r.correcta ?? evaluarRespuestaTeorica(q, valor);
            return ok === null ? "SIN_CLAVE" : ok ? "CORRECTA" : "INCORRECTA";
          })();
    return {
      id: q.id,
      respuestaId: r?.id ?? null,
      orden: q.orden,
      tipo: q.tipo,
      texto: q.texto,
      opciones: parse(q.opciones) as { clave: string; texto: string }[],
      valor,
      respuestaCorrecta: parse(q.respuestaCorrecta),
      flechas: q.flechas.map((f) => ({ numero: f.numero, zonaCorrecta: f.zonaCorrecta })),
      puntaje: q.puntaje,
      puntos: r?.puntos ?? null,
      evaluacion,
    };
  });

  return {
    intento: {
      id: it.id,
      estado: it.estado,
      modo: it.modo,
      ronda: it.ronda,
      fechaAplicacion: it.fechaAplicacion,
      enviadoEn: it.enviadoEn,
      teoriaManual: it.teoriaManual,
      calificacion: it.calificacion,
      resultado: it.resultado,
      segundaInspeccionNombre: it.segundaInspeccionNombre,
      aplicadoPorNombre: it.aplicadoPorNombre,
    },

    desglose:
      it.calificacion === null
        ? null
        : {
            pctFisico: it.pctFisico!,
            pctTeorico: it.pctTeorico!,
            pesoFisico: it.pesoFisico!,
            pesoTeorico: it.pesoTeorico!,
            teoriaPuntos: it.teoriaPuntos!,
            teoriaMax: it.teoriaMax!,
            umbral80: it.umbral80!,
            umbral90: it.umbral90!,
            calificacion: it.calificacion,
          },
          
    nivel,
    persona: { id: it.persona.id, nombre: it.persona.nombre, numeroEmpleado: it.persona.numeroEmpleado },
    examen: {
      id: it.examenId,
      nombre: it.examen?.nombre ?? "",
      version: v.version,
      modoTeoria: v.modoTeoria,
      teoriaMax: v.teoriaMax,
    },
    fisico: {
      aciertos,
      totalPiezas: total,
      sinContestar: faltaron,
      texto: textoFisico(aciertos, total, faltaron),
      piezas,
    },
    preguntas,
    resumenTeoria: {
      correctas: preguntas.filter((p) => p.evaluacion === "CORRECTA").length,
      incorrectas: preguntas.filter((p) => p.evaluacion === "INCORRECTA").length,
      porRevisar: preguntas.filter((p) => p.evaluacion === "MANUAL" || p.evaluacion === "SIN_CLAVE").length,
    },
    puedeCalificar: can(actor, "intento:calificar") && it.estado === "PENDIENTE_CALIFICAR",
  };
}
