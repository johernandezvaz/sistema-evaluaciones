import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../lib/db";
import type { Actor } from "../lib/domain";
import { setConfigValue } from "../lib/config";
import { sinContestar, textoFisico } from "../lib/scoring";
import { datosParaCalificar } from "../lib/services/calificacion";
import { publicarVersion } from "../lib/services/versiones";
import {
  abrirAsignacion,
  crearAsignacion,
  enviarExamen,
  responderPieza,
  responderTeorica,
} from "../lib/services/asignaciones";
import { errorParaUsuario, ejecutar, MENSAJE_INTEGRIDAD } from "../lib/errores-ui";
import { AppError } from "../lib/errors";
import { actores, CLAVE_HIGHLAND, dias, dispositivo, examenConBorrador, persona } from "./helpers";

let admin: Actor, lectura: Actor;
beforeAll(async () => {
  ({ admin, lectura } = await actores());
});
afterEach(() => vi.restoreAllMocks());

const opciones = (...c: string[]) => JSON.stringify(c.map((clave) => ({ clave, texto: `Opción ${clave}` })));

/** Examen publicado con 30 piezas y las 4 clases de pregunta; devuelve un intento enviado con 28 piezas contestadas. */
async function intentoEnviado(modoTeoria = "MANUAL") {
  const { examen, version } = await examenConBorrador(CLAVE_HIGHLAND, { modoTeoria });
  const q = (orden: number, tipo: string, extra: object = {}) =>
    db().pregunta.create({ data: { versionId: version.id, orden, tipo, texto: `Pregunta ${orden}`, ...extra } });
  const om = await q(1, "OPCION_MULTIPLE", {
    opciones: opciones("A", "B", "C"),
    respuestaCorrecta: JSON.stringify("B"),
    puntaje: 2,
  });
  // MANUAL: sin clave a propósito (caso SIN_CLAVE). POR_PREGUNTA no se puede publicar sin ella.
  const sino = await q(2, "SI_NO", {
    opciones: opciones("SI", "NO"),
    puntaje: 2,
    ...(modoTeoria === "POR_PREGUNTA" ? { respuestaCorrecta: JSON.stringify("SI") } : {}),
  });
  const cond = await q(3, "CONDICIONAL", {
    opciones: opciones("A", "B"),
    respuestaCorrecta: JSON.stringify("A"),
    puntaje: 2,
    dependeDeId: sino.id,
    dependeDeValor: "SI",
  });
  const abierta = await q(4, "TEXTO_ABIERTO", { opciones: opciones("1", "2", "3"), puntaje: 4 });
  await publicarVersion(admin, version.id, {
    vigenteDesde: dias(0),
    ahora: dias(0),
    aceptarSinRespuestaCorrecta: true,
  });

  const p = await persona();
  const a = await crearAsignacion(admin, { personaId: p.id, examenId: examen.id }, { ahora: dias(1) });
  const t = await dispositivo(admin);
  const { intentoId } = await abrirAsignacion(
    { tipo: "DISPOSITIVO", dispositivoId: t.id },
    p.numeroEmpleado,
    a.codigo,
    {
      ahora: dias(1),
    },
  );
  for (const [i, r] of CLAVE_HIGHLAND.slice(0, 28).entries()) {
    await responderPieza(intentoId, { numero: i + 1, respuesta: r }, { ahora: dias(1) });
  }
  await responderTeorica(intentoId, om.id, "A", { ahora: dias(1) });
  await responderTeorica(intentoId, sino.id, "NO", { ahora: dias(1) });
  await responderTeorica(intentoId, abierta.id, ["rebaba", "raya", "mancha"], { ahora: dias(1) });
  const envio = await enviarExamen(intentoId, { ahora: dias(1) });
  return { intentoId, envio, ids: { om: om.id, sino: sino.id, cond: cond.id, abierta: abierta.id } };
}

describe("piezas sin contestar", () => {
  it("se derivan y se muestran como '28/30 · 2 sin contestar'", () => {
    expect(sinContestar(30, 28)).toBe(2);
    expect(textoFisico(28, 30, 2)).toBe("28/30 · 2 sin contestar");
    expect(textoFisico(28, 30, 0)).toBe("28/30");
  });
});

describe("pantalla de calificar", () => {
  it("muestra las respuestas con las cerradas ya marcadas y las piezas sin contestar", async () => {
    const { intentoId, ids } = await intentoEnviado();
    const d = await datosParaCalificar(lectura, intentoId);
    expect(d.intento.estado).toBe("PENDIENTE_CALIFICAR");
    expect(d.fisico).toMatchObject({
      aciertos: 28,
      totalPiezas: 30,
      sinContestar: 2,
      texto: "28/30 · 2 sin contestar",
    });
    expect(d.fisico.piezas.filter((p) => p.respuesta === null).map((p) => p.numero)).toEqual([29, 30]);
    const ev = Object.fromEntries(d.preguntas.map((p) => [p.id, p.evaluacion]));
    expect(ev).toEqual({
      [ids.om]: "INCORRECTA",
      [ids.sino]: "SIN_CLAVE",
      [ids.cond]: "NO_APLICA",
      [ids.abierta]: "MANUAL",
    });
    expect(d.preguntas.find((p) => p.id === ids.om)).toMatchObject({ valor: "A", respuestaCorrecta: "B" });
    expect(d.resumenTeoria).toEqual({ correctas: 0, incorrectas: 1, porRevisar: 2 });
    expect(d.puedeCalificar).toBe(false); // Lectura ve, pero no califica
    expect((await datosParaCalificar(admin, intentoId)).puedeCalificar).toBe(true);
  });

  it("si la configuración lo permite, el kiosco recibe '28/30 · 2 sin contestar'", async () => {
    await setConfigValue("mostrarResultadoEnKiosco", true, admin.id);
    // POR_PREGUNTA sin preguntas abiertas pendientes → FINALIZADO al enviar. Aquí hay una abierta: queda pendiente.
    const { envio } = await intentoEnviado("POR_PREGUNTA");
    expect(envio).toEqual({ estado: "PENDIENTE_CALIFICAR", resultado: null });
    const soloPiezas = await examenConBorrador(CLAVE_HIGHLAND, { modoTeoria: "POR_PREGUNTA" });
    await publicarVersion(admin, soloPiezas.version.id, { vigenteDesde: dias(0), ahora: dias(0) });
    const p = await persona();
    const a = await crearAsignacion(admin, { personaId: p.id, examenId: soloPiezas.examen.id }, { ahora: dias(1) });
    const t = await dispositivo(admin);
    const r = await abrirAsignacion({ tipo: "DISPOSITIVO", dispositivoId: t.id }, p.numeroEmpleado, a.codigo, {
      ahora: dias(1),
    });
    for (const [i, x] of CLAVE_HIGHLAND.slice(0, 28).entries()) {
      await responderPieza(r.intentoId, { numero: i + 1, respuesta: x }, { ahora: dias(1) });
    }
    const fin = await enviarExamen(r.intentoId, { ahora: dias(1) });
    expect(fin.estado).toBe("FINALIZADO");
    expect(fin.resultado).toMatchObject({ sinContestar: 2, fisico: "28/30 · 2 sin contestar" });
    await setConfigValue("mostrarResultadoEnKiosco", false, admin.id);
  });
});

describe("mensajes de error en la UI", () => {
  it("un bloqueo de integridad nunca muestra el texto de Prisma y se registra completo en el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await ejecutar("prueba", () => db().auditLog.deleteMany({}));
    expect(r).toEqual({ ok: false, code: "INTEGRIDAD", message: MENSAJE_INTEGRIDAD, status: 409 });
    expect(JSON.stringify(r)).not.toMatch(/Foreign key|constraint|P2003/i);
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0]?.[1])).toMatch(/Foreign key constraint/); // el log sí lleva el detalle
  });

  it("los errores de negocio pasan tal cual; los desconocidos se ocultan", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(errorParaUsuario(new AppError("X", "Mensaje claro", 409))).toMatchObject({
      message: "Mensaje claro",
      status: 409,
    });
    expect(errorParaUsuario(new Error("SQLITE_BUSY: database is locked"))).toMatchObject({
      code: "INESPERADO",
      status: 500,
    });
  });
});
