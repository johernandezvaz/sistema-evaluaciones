import type { Prisma } from "@prisma/client";
import type { Actor } from "../domain";
import { db } from "../db";
import { can, requirePermission } from "../auth/permissions";
import { getConfig } from "../config";
import { estadoCandidatoO } from "../iluo";

export type FiltrosMatriz = { area?: string; turno?: string; grupo?: string; q?: string };

export type Celda = {
  letra: string;
  fecha: Date;
  origen: string;
  candidatoO: boolean;
  listoParaO: boolean;
  faltaFechaIngreso: boolean;
  fechaEstimadaO: Date | null;
};

export async function datosMatriz(actor: Actor, filtros: FiltrosMatriz = {}, opts: { ahora?: Date } = {}) {
  requirePermission(actor, "ver");
  const ahora = opts.ahora ?? new Date();
  const q = filtros.q?.trim();

  const wherePersona: Prisma.PersonaWhereInput = {
    activo: true,
    ...(filtros.area ? { area: { nombre: filtros.area } } : {}),
    ...(filtros.turno ? { turno: { nombre: filtros.turno } } : {}),
    ...(q ? { OR: [{ nombre: { contains: q } }, { numeroEmpleado: { contains: q } }] } : {}),
  };
  const whereModelo: Prisma.ModeloWhereInput = { activo: true, ...(filtros.grupo ? { grupo: filtros.grupo } : {}) };

  const [cfg, personas, modelos, niveles, areas, turnos, grupos] = await Promise.all([
    getConfig(),
    db().persona.findMany({
      where: wherePersona,
      select: {
        id: true,
        nombre: true,
        numeroEmpleado: true,
        puesto: true,
        fechaIngresoPuesto: true,
        area: { select: { nombre: true } },
        turno: { select: { nombre: true } },
      },
      orderBy: [{ area: { orden: "asc" } }, { nombre: "asc" }],
    }),
    db().modelo.findMany({
      where: whereModelo,
      select: { id: true, nombre: true, grupo: true },
      orderBy: [{ orden: "asc" }],
    }),
    db().nivelILUO.findMany({ where: { persona: wherePersona, modelo: whereModelo } }),
    db().area.findMany({ orderBy: { orden: "asc" }, select: { nombre: true } }),
    db().turno.findMany({ orderBy: { orden: "asc" }, select: { nombre: true } }),
    db().modelo.findMany({ where: { activo: true }, distinct: ["grupo"], select: { grupo: true } }),
  ]);

  const ingreso = new Map(personas.map((p) => [p.id, p.fechaIngresoPuesto]));
  const celdas = new Map<string, Celda>();
  for (const n of niveles) {
    const c = estadoCandidatoO({
      candidatoO: n.candidatoO,
      fechaEstimadaO: n.fechaEstimadaO,
      fechaIngresoPuesto: ingreso.get(n.personaId) ?? null,
      mesesParaO: cfg.mesesParaO,
      ahora,
    });
    celdas.set(`${n.personaId}:${n.modeloId}`, {
      letra: n.letra,
      fecha: n.fecha,
      origen: n.origen,
      candidatoO: n.candidatoO,
      ...c,
    });
  }

  const nombrePersona = new Map(personas.map((p) => [p.id, p]));
  const nombreModelo = new Map(modelos.map((m) => [m.id, m.nombre]));
  const avisos = niveles
    .map((n) => ({ n, c: celdas.get(`${n.personaId}:${n.modeloId}`)! }))
    .filter(({ c }) => c.listoParaO || (c.candidatoO && c.faltaFechaIngreso))
    .map(({ n, c }) => ({
      personaId: n.personaId,
      modeloId: n.modeloId,
      persona: nombrePersona.get(n.personaId)!.nombre,
      numeroEmpleado: nombrePersona.get(n.personaId)!.numeroEmpleado,
      modelo: nombreModelo.get(n.modeloId)!,
      tipo: c.listoParaO ? ("LISTO_PARA_O" as const) : ("FALTA_FECHA_INGRESO" as const),
      fechaEstimadaO: c.fechaEstimadaO,
    }))
    .sort((a, b) => a.persona.localeCompare(b.persona, "es"));

  const resumen = new Map(
    modelos.map((m) => {
      const cuenta = { I: 0, L: 0, U: 0, O: 0 } as Record<string, number>;
      for (const p of personas) {
        const c = celdas.get(`${p.id}:${m.id}`);
        if (c) cuenta[c.letra] = (cuenta[c.letra] ?? 0) + 1;
      }
      return [m.id, cuenta];
    }),
  );

  return {
    personas,
    modelos,
    celdas,
    avisos,
    resumen,
    opciones: {
      areas: areas.map((a) => a.nombre),
      turnos: turnos.map((t) => t.nombre),
      grupos: grupos.map((g) => g.grupo),
    },
    puedeConfirmarO: can(actor, "iluo:asignar_manual"),
  };
}
