import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../lib/db";
import type { Actor } from "../lib/domain";
import {
  abrirAsignacion,
  ALFABETO_CODIGO,
  cancelarAsignacion,
  crearAsignacion,
  enviarExamen,
  examenParaKiosco,
  generarCodigo,
  responderPieza,
  type CanalKiosco,
} from "../lib/services/asignaciones";
import { anularIntento, capturarPapel, capturarTeoriaManual, cerrarIncompleto } from "../lib/services/intentos";
import { crearBorrador, publicarVersion } from "../lib/services/versiones";
import { desactivarPersona, MOTIVO_EMPLEADO_DESACTIVADO } from "../lib/services/personas";
import { ultimoIntento } from "../lib/services/historial";
import {
  BLOQUEO_TRIGGER,
  actores,
  CLAVE_HIGHLAND,
  contraria,
  dias,
  dispositivo,
  examenConBorrador,
  examenPublicado,
  minutos,
  persona,
} from "./helpers";

let admin: Actor, lectura: Actor, superadmin: Actor;
beforeAll(async () => {
  ({ admin, lectura, superadmin } = await actores());
});

const tablet = async (): Promise<CanalKiosco> => ({
  tipo: "DISPOSITIVO",
  dispositivoId: (await dispositivo(admin)).id,
});

/** Abre en tablet, contesta todas las piezas (con `errores` equivocadas al final) y envía. */
async function contestarTodo(asig: { codigo: string; personaId: string }, inicio: Date, errores = 0) {
  const p = await db().persona.findUniqueOrThrow({ where: { id: asig.personaId } });
  const { intentoId } = await abrirAsignacion(await tablet(), p.numeroEmpleado, asig.codigo, { ahora: inicio });
  for (const [i, r] of CLAVE_HIGHLAND.entries()) {
    await responderPieza(
      intentoId,
      { numero: i + 1, respuesta: i >= 30 - errores ? contraria(r) : r },
      { ahora: minutos(10, inicio) },
    );
  }
  await enviarExamen(intentoId, { ahora: minutos(20, inicio) });
  return intentoId;
}

describe("código de asignación", () => {
  it("6 caracteres sin 0/O/1/I", () => {
    for (let i = 0; i < 200; i++) {
      const c = generarCodigo();
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
    expect(ALFABETO_CODIGO).not.toMatch(/[01IO]/);
  });
});

describe("flujo de kiosco", () => {
  it("asignar → abrir en tablet → contestar → enviar → Admin captura teoría → 0.94", async () => {
    const { examen, version } = await examenPublicado(admin);
    const p = await persona();
    const a = await crearAsignacion(lectura, { personaId: p.id, examenId: examen.id }, { ahora: dias(1) });
    expect(a).toMatchObject({ estado: "PENDIENTE", ronda: 1 });
    const intentoId = await contestarTodo(a, minutos(30, dias(1)), 2);
    const it1 = await db().intento.findUniqueOrThrow({ where: { id: intentoId }, include: { asignacion: true } });
    expect(it1).toMatchObject({
      estado: "PENDIENTE_CALIFICAR",
      versionId: version.id,
      aciertos: 28,
      errores: 2,
      modo: "DISPOSITIVO",
      ronda: 1,
      areaNombre: "PINTURA",
      turnoNombre: "1ER",
      puesto: "OPERADOR",
    });
    expect(it1.asignacion?.estado).toBe("COMPLETADA");
    const fin = await capturarTeoriaManual(admin, intentoId, 10, { ahora: dias(2) });
    expect(fin).toMatchObject({ estado: "FINALIZADO", calificacion: 0.94, resultado: "KAPPA_90" });
  });

  it("las respuestas enviadas son definitivas; se puede reanudar con número + código", async () => {
    const { examen } = await examenPublicado(admin);
    const p = await persona();
    const a = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(1) });
    const t = await tablet();
    const r1 = await abrirAsignacion(t, p.numeroEmpleado, a.codigo.toLowerCase(), { ahora: dias(1) });
    await responderPieza(r1.intentoId, { numero: 1, respuesta: "G" }, { ahora: dias(1) });
    await expect(responderPieza(r1.intentoId, { numero: 1, respuesta: "B" }, { ahora: dias(1) })).rejects.toMatchObject(
      { code: "RESPUESTA_YA_ENVIADA" },
    );
    const r2 = await abrirAsignacion(await tablet(), p.numeroEmpleado, a.codigo, { ahora: minutos(5, dias(1)) });
    expect(r2).toEqual({ intentoId: r1.intentoId, asignacionId: a.id, reanudado: true });
  });

  it("el kiosco nunca recibe la clave ni si la respuesta fue correcta", async () => {
    const { examen, version } = await examenConBorrador();
    await db().pregunta.create({
      data: {
        versionId: version.id,
        orden: 1,
        tipo: "OPCION_MULTIPLE",
        texto: "¿Qué defecto…?",
        opciones: JSON.stringify([
          { clave: "A", texto: "Raya" },
          { clave: "B", texto: "Rebaba" },
        ]),
        respuestaCorrecta: JSON.stringify("B"),
        puntaje: 10,
      },
    });
    await publicarVersion(admin, version.id, { vigenteDesde: dias(0), ahora: dias(0) });
    const p = await persona();
    const a = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(1) });
    const { intentoId } = await abrirAsignacion(await tablet(), p.numeroEmpleado, a.codigo, { ahora: dias(1) });
    expect(await responderPieza(intentoId, { numero: 1, respuesta: "G" }, { ahora: dias(1) })).toEqual({ ok: true });
    const dto = await examenParaKiosco(intentoId, { ahora: dias(1) });
    const json = JSON.stringify(dto);
    for (const prohibido of ["esperado", "respuestaCorrecta", "zonaCorrecta", "correcta", "puntaje", "descripcion"]) {
      expect(json).not.toContain(`"${prohibido}"`);
    }
    expect(dto.piezas).toHaveLength(30);
    expect(dto.contestadas.piezas).toEqual([{ numero: 1, respuesta: "G", defecto: null }]);
    // Por defecto la tablet tampoco recibe el resultado al enviar.
    expect((await enviarExamen(intentoId, { ahora: dias(1) })).resultado).toBeNull();
  });

  it("publicar v2 a mitad de un examen no cambia su versión", async () => {
    const { examen, version: v1 } = await examenPublicado(admin);
    const p = await persona();
    const inicio = dias(1);
    const a = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: inicio });
    const { intentoId } = await abrirAsignacion(await tablet(), p.numeroEmpleado, a.codigo, { ahora: inicio });
    const v2 = await crearBorrador(admin, examen.id, v1.id);
    const k1 = await db().piezaClave.findUniqueOrThrow({
      where: { versionId_numero: { versionId: v2.id, numero: 1 } },
    });
    await db().piezaClave.update({ where: { id: k1.id }, data: { esperado: contraria(k1.esperado as "G" | "B") } });
    await publicarVersion(admin, v2.id, { motivo: "Pieza 1", ahora: minutos(10, inicio) });
    for (const [i, r] of CLAVE_HIGHLAND.entries())
      await responderPieza(intentoId, { numero: i + 1, respuesta: r }, { ahora: minutos(11, inicio) });
    await enviarExamen(intentoId, { ahora: minutos(12, inicio) });
    expect(await db().intento.findUniqueOrThrow({ where: { id: intentoId } })).toMatchObject({
      versionId: v1.id,
      aciertos: 30,
    });
  });
});

describe("vencimientos", () => {
  it("PENDIENTE vence a las horasVigenciaAsignacion sin empezar", async () => {
    const { examen } = await examenPublicado(admin);
    const p = await persona();
    const a = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(1) });
    await expect(
      abrirAsignacion(await tablet(), p.numeroEmpleado, a.codigo, { ahora: minutos(24 * 60 + 1, dias(1)) }),
    ).rejects.toMatchObject({ code: "ASIGNACION_VENCIDA" });
    expect((await db().asignacion.findUniqueOrThrow({ where: { id: a.id } })).estado).toBe("VENCIDA");
  });

  it("EN_CURSO: respuesta con tiempo excedido o asignación VENCIDA se rechaza (servicio y trigger)", async () => {
    const { examen } = await examenPublicado(admin);
    const p = await persona();
    const inicio = dias(1);
    // horasVigenciaAsignacion NO aplica una vez iniciada: se abre a las 23 h y se contesta a las 24.5 h.
    const a = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: inicio });
    const abierto = minutos(23 * 60, inicio);
    const { intentoId } = await abrirAsignacion(await tablet(), p.numeroEmpleado, a.codigo, { ahora: abierto });
    await responderPieza(intentoId, { numero: 1, respuesta: "B" }, { ahora: minutos(90, abierto) });
    await responderPieza(intentoId, { numero: 2, respuesta: "B" }, { ahora: minutos(119, abierto) });
    await expect(
      responderPieza(intentoId, { numero: 3, respuesta: "G" }, { ahora: minutos(121, abierto) }),
    ).rejects.toMatchObject({ code: "TIEMPO_AGOTADO" });
    expect((await db().asignacion.findUniqueOrThrow({ where: { id: a.id } })).estado).toBe("VENCIDA");
    await expect(
      responderPieza(intentoId, { numero: 3, respuesta: "G" }, { ahora: minutos(122, abierto) }),
    ).rejects.toMatchObject({ code: "ASIGNACION_NO_EN_CURSO" });
    await expect(enviarExamen(intentoId, { ahora: minutos(122, abierto) })).rejects.toMatchObject({
      code: "ASIGNACION_NO_EN_CURSO",
    });
    // Escritura directa (sin servicio): el trigger exige asignación EN_CURSO.
    await expect(
      db().respuestaPieza.create({ data: { intentoId, numero: 4, respuesta: "G", esperado: "G", correcta: true } }),
    ).rejects.toMatchObject(BLOQUEO_TRIGGER);
    expect((await db().intento.findUniqueOrThrow({ where: { id: intentoId } })).estado).toBe("EN_CURSO"); // = Incompleto
  });

  it("no se puede asignar mientras haya un intento incompleto; el Admin lo cierra y ya se puede", async () => {
    const { examen } = await examenPublicado(admin);
    const p = await persona();
    const a = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(1) });
    const { intentoId } = await abrirAsignacion(await tablet(), p.numeroEmpleado, a.codigo, { ahora: dias(1) });
    await responderPieza(intentoId, { numero: 1, respuesta: "B" }, { ahora: dias(1) });

    // 3 horas después: el examen venció por tiempo (se detecta al intentar asignar de nuevo).
    const luego = minutos(180, dias(1));
    const err = await crearAsignacion(lectura, { personaId: p.id, examenId: examen.id }, { ahora: luego }).catch(
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ code: "INTENTO_INCOMPLETO", status: 409, data: { intentoId, acciones: [] } });
    expect((err as Error).message).toMatch(
      /^Tiene un examen incompleto del .+; un Admin debe anularlo o cerrarlo antes de asignar de nuevo$/,
    );
    const errAdmin = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: luego }).catch(
      (e: unknown) => e,
    );
    expect(errAdmin).toMatchObject({ code: "INTENTO_INCOMPLETO", data: { acciones: ["ANULAR", "CERRAR"] } });

    const cerrado = await cerrarIncompleto(admin, intentoId, { ahora: luego });
    expect(cerrado).toMatchObject({ estado: "PENDIENTE_CALIFICAR", aciertos: 1, totalPiezas: 30 });
    expect(await crearAsignacion(lectura, { personaId: p.id, examenId: examen.id }, { ahora: luego })).toMatchObject({
      ronda: 2,
    });
  });

  it("una segunda asignación activa de la misma persona×examen se rechaza", async () => {
    const { examen } = await examenPublicado(admin);
    const p = await persona();
    const a = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(1) });
    await expect(
      crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(1) }),
    ).rejects.toMatchObject({ code: "ASIGNACION_ACTIVA" });
    await expect(
      db().asignacion.create({
        data: {
          personaId: p.id,
          examenId: examen.id,
          codigo: "ZZZZZ9",
          ronda: 9,
          asignadoPorId: admin.id,
          venceEn: dias(9),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await cancelarAsignacion(admin, a.id, "error", { ahora: dias(1) });
    await expect(
      crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(1) }),
    ).resolves.toBeTruthy();
  });
});

describe("rondas y repetición", () => {
  it("anular un intento EN_CURSO deja su asignación CANCELADA con el mismo motivo", async () => {
    const { examen } = await examenPublicado(admin);
    const p = await persona();
    const a = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(1) });
    const { intentoId } = await abrirAsignacion(await tablet(), p.numeroEmpleado, a.codigo, { ahora: dias(1) });
    await anularIntento(admin, intentoId, "Se sintió mal y se retiró", { ahora: minutos(5, dias(1)) });
    expect(await db().asignacion.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({
      estado: "CANCELADA",
      motivoCancelacion: "Se sintió mal y se retiró",
      canceladaPorId: admin.id,
      vencidaEn: null,
    });
    await expect(
      responderPieza(intentoId, { numero: 1, respuesta: "G" }, { ahora: minutos(6, dias(1)) }),
    ).rejects.toMatchObject({
      code: "ASIGNACION_NO_EN_CURSO",
    });
    // Ya no hay incompleto que bloquee: se puede asignar de nuevo (ronda 2).
    expect(await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(2) })).toMatchObject({
      ronda: 2,
    });
  });

  it("ronda tras anular: 1, 2 (anulado), 3 — y el intento anterior queda intacto", async () => {
    const { examen } = await examenPublicado(admin);
    const p = await persona();
    const a1 = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(1) });
    const i1 = await contestarTodo(a1, dias(1), 2);
    await capturarTeoriaManual(admin, i1, 10, { ahora: dias(1) });
    const antes = await db().intento.findUniqueOrThrow({ where: { id: i1 }, include: { piezas: true } });

    const a2 = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(2) });
    expect(a2.ronda).toBe(2);
    const i2 = await contestarTodo(a2, dias(2), 10);
    await anularIntento(admin, i2, "Se equivocó de examen", { ahora: dias(2) });

    const a3 = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(3) });
    expect(a3.ronda).toBe(3);
    const i3 = await contestarTodo(a3, dias(3));
    const rondas = await db().intento.findMany({
      where: { personaId: p.id, examenId: examen.id },
      orderBy: { ronda: "asc" },
      select: { id: true, ronda: true, estado: true },
    });
    expect(rondas).toEqual([
      { id: i1, ronda: 1, estado: "FINALIZADO" },
      { id: i2, ronda: 2, estado: "ANULADO" },
      { id: i3, ronda: 3, estado: "PENDIENTE_CALIFICAR" },
    ]);
    expect(await db().intento.findUniqueOrThrow({ where: { id: i1 }, include: { piezas: true } })).toEqual(antes);
  });

  it("personaId de un intento finalizado es inmutable; un intento con versión de otro examen se rechaza", async () => {
    const { examen, modelo, version } = await examenPublicado(admin);
    const otro = await examenPublicado(admin);
    const [p, q] = [await persona(), await persona()];
    const it = await capturarPapel(
      admin,
      { personaId: p.id, examenId: examen.id, fechaAplicacion: dias(1), piezas: [], teoriaManual: 5 },
      { ahora: dias(1) },
    );
    expect(it.estado).toBe("FINALIZADO");
    await expect(db().intento.update({ where: { id: it.id }, data: { personaId: q.id } })).rejects.toMatchObject(
      BLOQUEO_TRIGGER,
    );
    await expect(
      db().intento.create({
        data: {
          personaId: p.id,
          modeloId: modelo.id,
          examenId: examen.id,
          versionId: otro.version.id,
          fechaAplicacion: dias(1),
          modo: "CAPTURA_PAPEL",
        },
      }),
    ).rejects.toMatchObject(BLOQUEO_TRIGGER);
    await expect(
      db().intento.create({
        data: {
          personaId: p.id,
          modeloId: otro.modelo.id,
          examenId: examen.id,
          versionId: version.id,
          fechaAplicacion: dias(1),
          modo: "CAPTURA_PAPEL",
        },
      }),
    ).rejects.toMatchObject(BLOQUEO_TRIGGER);
  });

  it("'última vez' se deriva y vuelve al intento anterior si se anula el último", async () => {
    const { examen } = await examenPublicado(admin);
    const p = await persona();
    const base = { personaId: p.id, examenId: examen.id, piezas: [], teoriaManual: 8 };
    await capturarPapel(admin, { ...base, fechaAplicacion: dias(2) }, { ahora: dias(2) });
    const ult = await capturarPapel(admin, { ...base, fechaAplicacion: dias(5) }, { ahora: dias(5) });
    expect((await ultimoIntento(p.id, { examenId: examen.id }))?.fechaAplicacion).toEqual(dias(5));
    await anularIntento(admin, ult.id, "Duplicado", { ahora: dias(6) });
    expect((await ultimoIntento(p.id, { examenId: examen.id }))?.fechaAplicacion).toEqual(dias(2));
  });
});

describe("bloqueo por código", () => {
  it("código de otro empleado = inválido; 5 fallos bloquean la tablet", async () => {
    const { examen } = await examenPublicado(admin);
    const [p, otro] = [await persona(), await persona()];
    const a = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(1) });
    const t = await tablet();
    for (let i = 0; i < 5; i++) {
      await expect(abrirAsignacion(t, otro.numeroEmpleado, a.codigo, { ahora: dias(1) })).rejects.toMatchObject({
        code: "CODIGO_INVALIDO",
      });
    }
    await expect(abrirAsignacion(t, p.numeroEmpleado, a.codigo, { ahora: dias(1) })).rejects.toMatchObject({
      code: "BLOQUEADO",
      status: 429,
    });
    // Otra tablet sí puede (el bloqueo de esta tablet no afecta al empleado p).
    await expect(
      abrirAsignacion(await tablet(), p.numeroEmpleado, a.codigo, { ahora: dias(1) }),
    ).resolves.toMatchObject({ reanudado: false });
    // Pasada la ventana, la tablet se desbloquea.
    await expect(
      abrirAsignacion(t, p.numeroEmpleado, a.codigo, { ahora: minutos(11, dias(1)) }),
    ).resolves.toMatchObject({ reanudado: true });
  });

  it("el bloqueo también cuenta por número de empleado aunque cambie de tablet", async () => {
    const { examen } = await examenPublicado(admin);
    const p = await persona();
    const a = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(1) });
    for (let i = 0; i < 5; i++) {
      await expect(
        abrirAsignacion(await tablet(), p.numeroEmpleado, "AAAAAA", { ahora: dias(1) }),
      ).rejects.toMatchObject({ code: "CODIGO_INVALIDO" });
    }
    await expect(abrirAsignacion(await tablet(), p.numeroEmpleado, a.codigo, { ahora: dias(1) })).rejects.toMatchObject(
      { code: "BLOQUEADO" },
    );
  });

  it("'Abrir aquí' funciona para cualquier rol y queda como KIOSCO", async () => {
    const { examen } = await examenPublicado(admin);
    const p = await persona();
    const a = await crearAsignacion(lectura, { personaId: p.id, examenId: examen.id }, { ahora: dias(1) });
    const r = await abrirAsignacion({ tipo: "SESION", sesionId: "s-1", actor: lectura }, p.numeroEmpleado, a.codigo, {
      ahora: dias(1),
    });
    expect(await db().intento.findUniqueOrThrow({ where: { id: r.intentoId } })).toMatchObject({
      modo: "KIOSCO",
      aplicadoPorId: lectura.id,
    });
  });
});

describe("cancelar y desactivar", () => {
  it("Lectura asigna y cancela las suyas, pero recibe 403 al cancelar las de otros; Admin cancela cualquiera", async () => {
    const { examen } = await examenPublicado(admin);
    const [p1, p2, p3] = [await persona(), await persona(), await persona()];
    const propia = await crearAsignacion(lectura, { personaId: p1.id, examenId: examen.id }, { ahora: dias(1) });
    const ajena = await crearAsignacion(superadmin, { personaId: p2.id, examenId: examen.id }, { ahora: dias(1) });
    await expect(
      cancelarAsignacion(lectura, propia.id, "Se fue a otra área", { ahora: dias(1) }),
    ).resolves.toBeUndefined();
    await expect(cancelarAsignacion(lectura, ajena.id, "x", { ahora: dias(1) })).rejects.toMatchObject({ status: 403 });
    await expect(cancelarAsignacion(admin, ajena.id, "x", { ahora: dias(1) })).resolves.toBeUndefined();
    // Una EN_CURSO no se cancela (se anula el intento).
    const enCurso = await crearAsignacion(lectura, { personaId: p3.id, examenId: examen.id }, { ahora: dias(1) });
    await abrirAsignacion(await tablet(), p3.numeroEmpleado, enCurso.codigo, { ahora: dias(1) });
    await expect(cancelarAsignacion(lectura, enCurso.id, "x", { ahora: dias(1) })).rejects.toMatchObject({
      code: "NO_CANCELABLE",
    });
  });

  it("desactivar a un empleado cancela sus asignaciones PENDIENTE con motivo y auditoría", async () => {
    const e1 = await examenPublicado(admin);
    const e2 = await examenPublicado(admin);
    const p = await persona();
    const a1 = await crearAsignacion(admin, { personaId: p.id, examenId: e1.examen.id }, { ahora: dias(1) });
    const a2 = await crearAsignacion(admin, { personaId: p.id, examenId: e2.examen.id }, { ahora: dias(1) });
    expect(await desactivarPersona(admin, p.id, { ahora: dias(2) })).toEqual({ canceladas: 2 });
    const as = await db().asignacion.findMany({ where: { id: { in: [a1.id, a2.id] } } });
    expect(as.every((a) => a.estado === "CANCELADA" && a.motivoCancelacion === MOTIVO_EMPLEADO_DESACTIVADO)).toBe(true);
    expect(
      await db().auditLog.count({
        where: { entidad: "Asignacion", entidadId: { in: [a1.id, a2.id] }, accion: "CANCELAR" },
      }),
    ).toBe(2);
    await expect(
      crearAsignacion(admin, { personaId: p.id, examenId: e1.examen.id }, { ahora: dias(2) }),
    ).rejects.toMatchObject({ code: "PERSONA_INACTIVA" });
  });
});
