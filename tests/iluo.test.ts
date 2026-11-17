/**
 * Nivel ILUO al finalizar / anular intentos (R1–R7 aprobadas). Highland: 30 piezas, teoría MANUAL 0–10.
 *   30/30 + 10 = 1.00 KAPPA_90 · 27/30 + 10 = 0.91 KAPPA_90 · 26/30 + 10 = 0.88 KAPPA_80
 *   24/30 + 10 = 0.82 KAPPA_80 · 20/30 + 0 = 0.60 REPROBADO
 */
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../lib/db";
import type { Actor } from "../lib/domain";
import { setConfigValue } from "../lib/config";
import { calcularNivel, elegirIntento, estadoCandidatoO, type IntentoParaNivel } from "../lib/iluo";
import { anularIntento, capturarPapel, capturarTeoriaManual } from "../lib/services/intentos";
import { asignarNivelManual, confirmarO } from "../lib/services/iluo";
import { actores, CLAVE_HIGHLAND, contraria, dias, examenPublicado, persona } from "./helpers";

const AHORA = dias(400);

let admin: Actor;
let lectura: Actor;
beforeAll(async () => {
  ({ admin, lectura } = await actores());
});

async function escenario(ingreso: Date | null = dias(-365)) {
  const ex = await examenPublicado(admin);
  const p = await persona(ingreso ? { fechaIngresoPuesto: ingreso } : {});
  const papel = (fecha: Date, aciertos: number, teoria: number | null = 10) =>
    capturarPapel(
      admin,
      {
        personaId: p.id,
        examenId: ex.examen.id,
        fechaAplicacion: fecha,
        piezas: CLAVE_HIGHLAND.map((e, i) => ({ numero: i + 1, respuesta: i < aciertos ? e : contraria(e) })),
        teoriaManual: teoria ?? undefined,
      },
      { ahora: dias(1, fecha) }, // se captura al día siguiente: el historial queda en orden cronológico
    );
  const nivel = () =>
    db().nivelILUO.findUnique({ where: { personaId_modeloId: { personaId: p.id, modeloId: ex.modelo.id } } });
  const historial = () =>
    db().nivelILUOHistorial.findMany({ where: { personaId: p.id, modeloId: ex.modelo.id }, orderBy: { fecha: "asc" } });
  return { ex, p, papel, nivel, historial };
}

const conCriterio = (c: "ULTIMO" | "MEJOR") => setConfigValue("criterioNivel", c, null);

describe("R1 — letra que otorga un intento", () => {
  it("KAPPA_90 con ≥ 6 meses → O; KAPPA_80 → U", async () => {
    await conCriterio("ULTIMO");
    const s = await escenario(dias(-365));
    const r = await s.papel(dias(10), 27);
    expect(r.resultado).toBe("KAPPA_90");
    expect(await s.nivel()).toMatchObject({ letra: "O", origen: "INTENTO", intentoId: r.id, candidatoO: false });

    const s2 = await escenario();
    expect((await s2.papel(dias(10), 26)).resultado).toBe("KAPPA_80");
    expect(await s2.nivel()).toMatchObject({ letra: "U", candidatoO: false, fechaEstimadaO: null });
  });

  it("KAPPA_90 sin la antigüedad → U candidato con fecha estimada; sin fecha de ingreso → candidato sin fecha", async () => {
    await conCriterio("ULTIMO");
    const ingreso = dias(-30);
    const s = await escenario(ingreso);
    await s.papel(dias(10), 30);
    const n = await s.nivel();
    expect(n).toMatchObject({ letra: "U", candidatoO: true });
    expect(n!.fechaEstimadaO!.toISOString()).toBe("2026-06-02T12:00:00.000Z"); // 2025-12-02 + 6 meses

    const sinFecha = await escenario(null);
    await sinFecha.papel(dias(10), 30);
    expect(await sinFecha.nivel()).toMatchObject({ letra: "U", candidatoO: true, fechaEstimadaO: null });
  });

  it("REPROBADO sin nivel previo no crea fila", async () => {
    await conCriterio("ULTIMO");
    const s = await escenario();
    expect((await s.papel(dias(10), 20, 0)).resultado).toBe("REPROBADO");
    expect(await s.nivel()).toBeNull();
    expect(await s.historial()).toHaveLength(0);
  });

  it("PENDIENTE_CALIFICAR no toca el nivel; al capturar la teoría se actualiza en la misma operación", async () => {
    await conCriterio("ULTIMO");
    const s = await escenario();
    const r = await s.papel(dias(10), 30, null);
    expect(r.estado).toBe("PENDIENTE_CALIFICAR");
    expect(await s.nivel()).toBeNull();
    await capturarTeoriaManual(admin, r.id, 10, { ahora: AHORA });
    expect(await s.nivel()).toMatchObject({ letra: "O", intentoId: r.id });
    const h = await s.historial();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ letraAnterior: null, letraNueva: "O", origen: "INTENTO", usuarioId: admin.id });
  });
});

describe("R2 — criterio ULTIMO", () => {
  it("REPROBADO baja el nivel a ninguno y limpia candidatoO / fechaEstimadaO", async () => {
    await conCriterio("ULTIMO");
    const s = await escenario(dias(-30));
    await s.papel(dias(10), 30);
    expect(await s.nivel()).toMatchObject({ letra: "U", candidatoO: true });
    await s.papel(dias(20), 20, 0);
    expect(await s.nivel()).toBeNull();
    const h = await s.historial();
    expect(h.at(-1)).toMatchObject({ letraAnterior: "U", letraNueva: null, origen: "INTENTO" });
  });

  it("REPROBADO baja a la última I/L puesta a mano", async () => {
    await conCriterio("ULTIMO");
    const s = await escenario();
    await asignarNivelManual(
      admin,
      { personaId: s.p.id, modeloId: s.ex.modelo.id, letra: "L", motivo: "En entrenamiento" },
      { ahora: dias(5) },
    );
    await s.papel(dias(10), 26);
    expect(await s.nivel()).toMatchObject({ letra: "U", origen: "INTENTO" });
    await s.papel(dias(20), 20, 0);
    expect(await s.nivel()).toMatchObject({ letra: "L", origen: "MANUAL", intentoId: null, candidatoO: false });
  });

  it("papel con fecha anterior al intento vigente queda en el historial pero no cambia el nivel", async () => {
    await conCriterio("ULTIMO");
    const s = await escenario();
    const vigente = await s.papel(dias(50), 26); // U
    const viejo = await s.papel(dias(20), 20, 0); // reprobado, pero más antiguo
    expect(viejo.estado).toBe("FINALIZADO");
    expect(await s.nivel()).toMatchObject({ letra: "U", intentoId: vigente.id });
    expect(await s.historial()).toHaveLength(1);
  });

  it("empate en fechaAplicacion: gana el capturado después (creadoEn)", async () => {
    await conCriterio("ULTIMO");
    const s = await escenario();
    await s.papel(dias(10), 30); // O
    const segundo = await s.papel(dias(10), 26); // U, misma fecha, capturado después
    expect(await s.nivel()).toMatchObject({ letra: "U", intentoId: segundo.id });
  });

  it("otro intento con la misma letra actualiza la fila sin nueva entrada de historial ni AuditLog", async () => {
    await conCriterio("ULTIMO");
    const s = await escenario();
    await s.papel(dias(10), 26);
    const antes = await db().auditLog.count({ where: { accion: "CAMBIAR_NIVEL" } });
    const r2 = await s.papel(dias(20), 24);
    expect(await s.nivel()).toMatchObject({ letra: "U", intentoId: r2.id });
    expect(await s.historial()).toHaveLength(1);
    expect(await db().auditLog.count({ where: { accion: "CAMBIAR_NIVEL" } })).toBe(antes);
  });
});

describe("R2 — criterio MEJOR", () => {
  it("REPROBADO nunca baja el nivel", async () => {
    await conCriterio("MEJOR");
    const s = await escenario();
    const bueno = await s.papel(dias(10), 26);
    await s.papel(dias(20), 20, 0);
    expect(await s.nivel()).toMatchObject({ letra: "U", intentoId: bueno.id });
  });

  it("cuenta la calificación más alta aunque sea anterior; empate → el más reciente", async () => {
    await conCriterio("MEJOR");
    const s = await escenario();
    const alto = await s.papel(dias(10), 30); // 1.00 O
    await s.papel(dias(20), 26); // 0.88 U
    expect(await s.nivel()).toMatchObject({ letra: "O", intentoId: alto.id });
    const empate = await s.papel(dias(30), 30); // 1.00 otra vez
    expect(await s.nivel()).toMatchObject({ letra: "O", intentoId: empate.id });
  });

  it("solo REPROBADOS → sin nivel", async () => {
    await conCriterio("MEJOR");
    const s = await escenario();
    await s.papel(dias(10), 20, 0);
    expect(await s.nivel()).toBeNull();
  });
});

describe("R6 — anulación", () => {
  it("anular el intento vigente recalcula con los demás", async () => {
    await conCriterio("ULTIMO");
    const s = await escenario();
    const a = await s.papel(dias(10), 30); // O
    const b = await s.papel(dias(20), 26); // U
    expect(await s.nivel()).toMatchObject({ letra: "U", intentoId: b.id });
    await anularIntento(admin, b.id, "Se capturó con la hoja equivocada", { ahora: AHORA });
    expect(await s.nivel()).toMatchObject({ letra: "O", intentoId: a.id, origen: "INTENTO" });
    expect((await s.historial()).at(-1)).toMatchObject({
      letraAnterior: "U",
      letraNueva: "O",
      usuarioId: admin.id,
      motivo: "Anulación de intento: Se capturó con la hoja equivocada",
    });
  });

  it("si hay un cambio MANUAL posterior al intento que quedaría vigente, prevalece el manual", async () => {
    await conCriterio("ULTIMO");
    const s = await escenario();
    await s.papel(dias(10), 26); // A: U
    await asignarNivelManual(
      admin,
      { personaId: s.p.id, modeloId: s.ex.modelo.id, letra: "L", motivo: "Reentrenamiento" },
      { ahora: dias(15) },
    );
    expect(await s.nivel()).toMatchObject({ letra: "L", origen: "MANUAL" });
    const b = await s.papel(dias(20), 30); // B: O (posterior al manual)
    expect(await s.nivel()).toMatchObject({ letra: "O", intentoId: b.id });
    await anularIntento(admin, b.id, "Error de captura", { ahora: AHORA });
    expect(await s.nivel()).toMatchObject({ letra: "L", origen: "MANUAL", intentoId: null });
  });

  it("anular el único intento deja sin nivel; anular uno no vigente no cambia nada", async () => {
    await conCriterio("ULTIMO");
    const s = await escenario();
    const viejo = await s.papel(dias(10), 26);
    const nuevo = await s.papel(dias(20), 30);
    await anularIntento(admin, viejo.id, "Duplicado", { ahora: AHORA });
    expect(await s.nivel()).toMatchObject({ letra: "O", intentoId: nuevo.id });
    expect(await s.historial()).toHaveLength(2);
    await anularIntento(admin, nuevo.id, "Duplicado", { ahora: AHORA });
    expect(await s.nivel()).toBeNull();
  });

  it("MEJOR: un intento posterior al manual con letra menor no baja la manual", async () => {
    await conCriterio("MEJOR");
    const s = await escenario(dias(-30));
    await s.papel(dias(10), 30); // U candidato
    // la persona cumple antigüedad (ingreso 2025-12-02 + 6 meses = 2026-06-02) y el Admin confirma O
    await confirmarO(admin, s.p.id, s.ex.modelo.id, { ahora: dias(160) });
    expect(await s.nivel()).toMatchObject({ letra: "O", origen: "MANUAL" });
    await s.papel(dias(170), 26); // U, posterior al manual
    expect(await s.nivel()).toMatchObject({ letra: "O", origen: "MANUAL" });
  });
});

describe("Candidato a O → Listo para O (se calcula al leer; lo confirma un Admin)", () => {
  it("antes de la fecha no se puede confirmar; después sí, como MANUAL con historial y AuditLog", async () => {
    await conCriterio("ULTIMO");
    const s = await escenario(dias(-30)); // estimada 2026-06-02 = dias(152)
    await s.papel(dias(10), 30);
    await expect(confirmarO(admin, s.p.id, s.ex.modelo.id, { ahora: dias(100) })).rejects.toMatchObject({
      code: "SIN_ANTIGUEDAD",
    });
    await expect(confirmarO(lectura, s.p.id, s.ex.modelo.id, { ahora: dias(160) })).rejects.toMatchObject({
      status: 403,
    });
    await expect(confirmarO(admin, s.p.id, s.ex.modelo.id, { ahora: dias(151) })).rejects.toMatchObject({
      code: "SIN_ANTIGUEDAD",
    });
    await confirmarO(admin, s.p.id, s.ex.modelo.id, { ahora: dias(152) });
    expect(await s.nivel()).toMatchObject({ letra: "O", origen: "MANUAL", candidatoO: false, fechaEstimadaO: null });
    expect((await s.historial()).at(-1)).toMatchObject({
      letraAnterior: "U",
      letraNueva: "O",
      origen: "MANUAL",
      usuarioId: admin.id,
      motivo: "Cumplió antigüedad para O",
    });
    const audit = await db().auditLog.findFirst({
      where: { accion: "CAMBIAR_NIVEL", usuarioId: admin.id, entidadId: `${s.p.id}:${s.ex.modelo.id}` },
      orderBy: { fecha: "desc" },
    });
    expect(audit?.resumen).toContain("Cumplió antigüedad para O");
  });

  it("sin fecha de ingreso: aviso y no se puede confirmar", async () => {
    await conCriterio("ULTIMO");
    const s = await escenario(null);
    await s.papel(dias(10), 30);
    await expect(confirmarO(admin, s.p.id, s.ex.modelo.id, { ahora: AHORA })).rejects.toMatchObject({
      code: "FALTA_FECHA_INGRESO",
    });
  });

  it("estadoCandidatoO: listo, todavía no, falta fecha, y usa la fecha de ingreso actual", () => {
    const base = { candidatoO: true, fechaEstimadaO: null, mesesParaO: 6 };
    expect(estadoCandidatoO({ ...base, fechaIngresoPuesto: dias(-200), ahora: dias(0) })).toMatchObject({
      listoParaO: true,
      faltaFechaIngreso: false,
    });
    expect(estadoCandidatoO({ ...base, fechaIngresoPuesto: dias(-10), ahora: dias(0) }).listoParaO).toBe(false);
    expect(estadoCandidatoO({ ...base, fechaIngresoPuesto: null, ahora: dias(0) })).toMatchObject({
      listoParaO: false,
      faltaFechaIngreso: true,
    });
    expect(estadoCandidatoO({ ...base, candidatoO: false, fechaIngresoPuesto: null, ahora: dias(0) })).toMatchObject({
      listoParaO: false,
      faltaFechaIngreso: false,
    });
  });
});

describe("reglas puras (lib/iluo.ts)", () => {
  const i = (id: string, f: number, c: number, cal: number, resultado: IntentoParaNivel["resultado"] = "KAPPA_80") => ({
    id,
    fechaAplicacion: dias(f),
    creadoEn: dias(c),
    calificacion: cal,
    resultado,
  });

  it("empates: ULTIMO por creadoEn; MEJOR por fecha y luego creadoEn", () => {
    expect(elegirIntento([i("a", 10, 50, 0.9), i("b", 10, 60, 0.85)], "ULTIMO")!.id).toBe("b");
    expect(elegirIntento([i("a", 10, 50, 0.9), i("b", 20, 21, 0.9)], "MEJOR")!.id).toBe("b");
    expect(elegirIntento([i("a", 10, 50, 0.9), i("b", 10, 40, 0.9)], "MEJOR")!.id).toBe("a");
  });

  it("I y L nunca salen de un intento: un aprobado deja U/O aunque hubiera I manual", () => {
    const n = calcularNivel({
      intentos: [i("a", 10, 10, 0.85)],
      manuales: [{ letra: "I", fecha: dias(5) }],
      criterio: "ULTIMO",
      fechaIngresoPuesto: dias(-400),
      mesesParaO: 6,
    });
    expect(n).toMatchObject({ letra: "U", origen: "INTENTO" });
  });
});

describe("REPROBADO después de una O manual (Confirmar O)", () => {
  it("ULTIMO: baja a la última I/L manual, o a sin nivel si no hay", async () => {
    await conCriterio("ULTIMO");
    const s = await escenario(dias(-30)); // estimada dias(152)
    await s.papel(dias(10), 30); // U candidato
    await confirmarO(admin, s.p.id, s.ex.modelo.id, { ahora: dias(160) });
    expect(await s.nivel()).toMatchObject({ letra: "O", origen: "MANUAL" });
    await s.papel(dias(170), 20, 0); // reprobado posterior a la O manual
    expect(await s.nivel()).toBeNull();
    expect((await s.historial()).at(-1)).toMatchObject({ letraAnterior: "O", letraNueva: null, origen: "INTENTO" });

    const s2 = await escenario(dias(-30));
    await asignarNivelManual(
      admin,
      { personaId: s2.p.id, modeloId: s2.ex.modelo.id, letra: "L", motivo: "Capacitación" },
      { ahora: dias(1) },
    );
    await s2.papel(dias(10), 30);
    await confirmarO(admin, s2.p.id, s2.ex.modelo.id, { ahora: dias(160) });
    await s2.papel(dias(170), 20, 0);
    expect(await s2.nivel()).toMatchObject({ letra: "L", origen: "MANUAL" });
  });

  it("MEJOR: la O manual se mantiene", async () => {
    await conCriterio("MEJOR");
    const s = await escenario(dias(-30));
    await s.papel(dias(10), 30);
    await confirmarO(admin, s.p.id, s.ex.modelo.id, { ahora: dias(160) });
    await s.papel(dias(170), 20, 0);
    expect(await s.nivel()).toMatchObject({ letra: "O", origen: "MANUAL" });
  });
});

describe("Matriz (lib/services/matriz.ts)", () => {
  it("celdas, avisos Listo para O / Falta fecha, conteos y permiso de confirmar", async () => {
    await conCriterio("ULTIMO");
    const listo = await escenario(dias(-100)); // ingreso 2025-09-23 → cumple 6 meses el 2026-03-23
    await listo.papel(dias(10), 30); // Kappa 90 antes de cumplir → candidato
    const sinFecha = await escenario(null);
    await sinFecha.papel(dias(10), 30);

    const { datosMatriz } = await import("../lib/services/matriz");
    const d = await datosMatriz(admin, { q: listo.p.numeroEmpleado }, { ahora: dias(100) });
    expect(d.personas.map((p) => p.id)).toEqual([listo.p.id]);
    expect(d.celdas.get(`${listo.p.id}:${listo.ex.modelo.id}`)).toMatchObject({
      letra: "U",
      candidatoO: true,
      listoParaO: true,
      faltaFechaIngreso: false,
    });
    expect(d.avisos).toEqual([expect.objectContaining({ personaId: listo.p.id, tipo: "LISTO_PARA_O" })]);
    expect(d.resumen.get(listo.ex.modelo.id)).toMatchObject({ U: 1, O: 0 });
    expect(d.puedeConfirmarO).toBe(true);

    const l = await datosMatriz(lectura, { q: sinFecha.p.numeroEmpleado }, { ahora: AHORA });
    expect(l.puedeConfirmarO).toBe(false);
    expect(l.avisos).toEqual([expect.objectContaining({ personaId: sinFecha.p.id, tipo: "FALTA_FECHA_INGRESO" })]);
  });
});
