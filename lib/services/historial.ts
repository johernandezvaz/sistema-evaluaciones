import { db } from "../db";

const ENVIADOS = ["FINALIZADO", "PENDIENTE_CALIFICAR"];

const seleccion = {
  id: true,
  fechaAplicacion: true,
  estado: true,
  resultado: true,
  calificacion: true,
  ronda: true,
  modo: true,
  modeloId: true,
  examenId: true,
  versionId: true,
} as const;

export async function ultimoIntento(personaId: string, filtro: { examenId?: string; modeloId?: string } = {}) {
  return db().intento.findFirst({
    where: { personaId, estado: { in: ENVIADOS }, ...filtro },
    orderBy: [{ fechaAplicacion: "desc" }, { creadoEn: "desc" }],
    select: seleccion,
  });
}

export async function ultimoIntentoPorModelo(personaId: string) {
  const intentos = await db().intento.findMany({
    where: { personaId, estado: { in: ENVIADOS } },
    orderBy: [{ fechaAplicacion: "desc" }, { creadoEn: "desc" }],
    select: seleccion,
  });
  const porModelo = new Map<string, (typeof intentos)[number]>();
  for (const i of intentos) if (!porModelo.has(i.modeloId)) porModelo.set(i.modeloId, i);
  return porModelo;
}

export async function resumenPersona(personaId: string) {
  const [ultimo, porModelo, asignacionesActivas, incompletos, total] = await Promise.all([
    ultimoIntento(personaId),
    ultimoIntentoPorModelo(personaId),
    db().asignacion.findMany({
      where: { personaId, estado: { in: ["PENDIENTE", "EN_CURSO"] } },
      include: { examen: true },
    }),
    db().intento.findMany({
      where: { personaId, estado: "EN_CURSO", asignacion: { estado: { not: "EN_CURSO" } } },
      select: seleccion,
    }),
    db().intento.count({ where: { personaId, estado: { in: ENVIADOS } } }),
  ]);
  return { ultimo, porModelo, asignacionesActivas, incompletos, totalIntentos: total };
}
