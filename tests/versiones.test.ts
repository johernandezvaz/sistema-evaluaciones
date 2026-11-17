import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../lib/db";
import type { Actor } from "../lib/domain";
import { crearBorrador, publicarVersion, resolverVersion } from "../lib/services/versiones";
import { capturarPapel } from "../lib/services/intentos";
import {
  BLOQUEO_TRIGGER,
  actores,
  CLAVE_HIGHLAND,
  contraria,
  dias,
  examenConBorrador,
  examenPublicado,
  persona,
  T0,
} from "./helpers";

let admin: Actor;
beforeAll(async () => {
  ({ admin } = await actores());
});

const todasBien = (clave: ("G" | "B")[]) => clave.map((r, i) => ({ numero: i + 1, respuesta: r }));

/** Cambia la clave de la pieza 1 en un borrador (para distinguir v1 de v2). */
async function invertirPieza1(versionId: string) {
  const p = await db().piezaClave.findUniqueOrThrow({ where: { versionId_numero: { versionId, numero: 1 } } });
  await db().piezaClave.update({ where: { id: p.id }, data: { esperado: contraria(p.esperado as "G" | "B") } });
}

describe("publicar versiones", () => {
  it("v1 sin motivo; v2 exige motivo y reemplaza a v1 con vigenteHasta exacto", async () => {
    const { examen, version: v1 } = await examenPublicado(admin);
    expect(v1).toMatchObject({ estado: "PUBLICADA", vigenteDesde: T0 });
    const v2 = await crearBorrador(admin, examen.id, v1.id);
    expect(await db().piezaClave.count({ where: { versionId: v2.id } })).toBe(30);
    await expect(publicarVersion(admin, v2.id, { ahora: dias(3) })).rejects.toMatchObject({ code: "MOTIVO_REQUERIDO" });
    const desde = new Date("2026-01-04T15:37:12.345Z"); // fecha Y hora exactas
    await publicarVersion(admin, v2.id, { motivo: "Pieza 1 cambiada", vigenteDesde: desde, ahora: dias(5) });
    const v1b = await db().examenVersion.findUniqueOrThrow({ where: { id: v1.id } });
    expect(v1b).toMatchObject({ estado: "REEMPLAZADA", vigenteHasta: desde });
    expect((await resolverVersion(examen.id, new Date(desde.getTime() - 1)))?.id).toBe(v1.id);
    expect((await resolverVersion(examen.id, desde))?.id).toBe(v2.id);
    expect(await resolverVersion(examen.id, dias(-1))).toBeNull();
  });

  it("no se puede publicar con vigencia en el futuro", async () => {
    const { version } = await examenConBorrador();
    await expect(publicarVersion(admin, version.id, { vigenteDesde: dias(2), ahora: dias(1) })).rejects.toMatchObject({
      code: "VIGENCIA_FUTURA",
    });
  });

  it("no se puede publicar con vigenteDesde anterior al último intento (servicio y trigger)", async () => {
    const { examen, version: v1 } = await examenPublicado(admin);
    const p = await persona();
    await capturarPapel(
      admin,
      {
        personaId: p.id,
        examenId: examen.id,
        fechaAplicacion: dias(5),
        piezas: todasBien(CLAVE_HIGHLAND),
        teoriaManual: 10,
      },
      { ahora: dias(6) },
    );
    const v2 = await crearBorrador(admin, examen.id, v1.id);
    await expect(
      publicarVersion(admin, v2.id, { motivo: "x", vigenteDesde: dias(4), ahora: dias(6) }),
    ).rejects.toMatchObject({ code: "VIGENCIA_ANTERIOR_A_INTENTO" });
    // La red de seguridad: aunque alguien se salte el servicio, el trigger lo rechaza.
    await db().examenVersion.update({ where: { id: v1.id }, data: { estado: "REEMPLAZADA", vigenteHasta: dias(4) } });
    await expect(
      db().examenVersion.update({ where: { id: v2.id }, data: { estado: "PUBLICADA", vigenteDesde: dias(4) } }),
    ).rejects.toMatchObject(BLOQUEO_TRIGGER);
  });

  it("no se publica una versión con piezas sin clave", async () => {
    const { version } = await examenConBorrador();
    const p = await db().piezaClave.findFirstOrThrow({ where: { versionId: version.id } });
    await db().piezaClave.update({ where: { id: p.id }, data: { esperado: null } });
    await expect(publicarVersion(admin, version.id, { ahora: T0 })).rejects.toMatchObject({
      code: "VERSION_INCOMPLETA",
    });
  });

  it("el contenido de una versión publicada es inmutable; editar = nuevo borrador", async () => {
    const { examen, version } = await examenPublicado(admin);
    const p = await db().piezaClave.findFirstOrThrow({ where: { versionId: version.id } });
    await expect(
      db().piezaClave.update({ where: { id: p.id }, data: { esperado: contraria(p.esperado as "G" | "B") } }),
    ).rejects.toMatchObject(BLOQUEO_TRIGGER);
    await expect(
      db().examenVersion.update({ where: { id: version.id }, data: { pesoFisico: 0.8 } }),
    ).rejects.toMatchObject(BLOQUEO_TRIGGER);
    const b = await crearBorrador(admin, examen.id, version.id);
    await expect(crearBorrador(admin, examen.id, version.id)).rejects.toMatchObject({ code: "BORRADOR_EXISTENTE" });
    expect(b).toMatchObject({ estado: "BORRADOR", version: 2, basadaEnId: version.id });
  });

  it("papel aplicado ayer y capturado hoy después de publicar v2 → se califica con v1", async () => {
    const { examen, version: v1 } = await examenPublicado(admin);
    const v2 = await crearBorrador(admin, examen.id, v1.id);
    await invertirPieza1(v2.id);
    const hoy = new Date("2026-01-11T16:00:00Z");
    const ayer = new Date("2026-01-10T15:00:00Z");
    await publicarVersion(admin, v2.id, {
      motivo: "Pieza 1",
      vigenteDesde: new Date("2026-01-11T14:00:00Z"),
      ahora: hoy,
    });

    const p = await persona();
    const it = await capturarPapel(
      admin,
      {
        personaId: p.id,
        examenId: examen.id,
        fechaAplicacion: ayer,
        piezas: todasBien(CLAVE_HIGHLAND),
        teoriaManual: 10,
      },
      { ahora: hoy },
    );
    expect(it.versionId).toBe(v1.id);
    expect(it).toMatchObject({ aciertos: 30, calificacion: 1, estado: "FINALIZADO", modo: "CAPTURA_PAPEL" });

    // Y un papel de hoy (después de la vigencia de v2) usa v2: la pieza 1 con la clave vieja ya es error.
    const p2 = await persona();
    const it2 = await capturarPapel(
      admin,
      {
        personaId: p2.id,
        examenId: examen.id,
        fechaAplicacion: hoy,
        piezas: todasBien(CLAVE_HIGHLAND),
        teoriaManual: 10,
      },
      { ahora: hoy },
    );
    expect(it2.versionId).toBe(v2.id);
    expect(it2.aciertos).toBe(29);
  });

  it("captura en papel con fecha futura se rechaza", async () => {
    const { examen } = await examenPublicado(admin);
    const p = await persona();
    await expect(
      capturarPapel(
        admin,
        { personaId: p.id, examenId: examen.id, fechaAplicacion: dias(3), piezas: [], teoriaManual: 1 },
        { ahora: dias(2) },
      ),
    ).rejects.toMatchObject({ code: "FECHA_FUTURA" });
  });
});

describe("publicar con preguntas cerradas sin respuesta correcta", () => {
  async function conPreguntas(modoTeoria: string) {
    const r = await examenConBorrador(CLAVE_HIGHLAND, { modoTeoria });
    await db().pregunta.createMany({
      data: [
        { versionId: r.version.id, orden: 1, tipo: "OPCION_MULTIPLE", texto: "¿Método?", opciones: "[]", puntaje: 5 },
        { versionId: r.version.id, orden: 2, tipo: "TEXTO_ABIERTO", texto: "Defectos", opciones: "[]", puntaje: 5 },
      ],
    });
    return r;
  }

  it("teoría MANUAL: sin confirmar se rechaza con la lista; confirmando se publica y queda en el AuditLog", async () => {
    const { version } = await conPreguntas("MANUAL");
    await expect(publicarVersion(admin, version.id, { vigenteDesde: T0, ahora: T0 })).rejects.toMatchObject({
      code: "PREGUNTAS_SIN_RESPUESTA",
      data: { preguntas: [{ orden: 1, texto: "¿Método?" }] }, // la abierta no cuenta
    });
    await publicarVersion(admin, version.id, { vigenteDesde: T0, ahora: T0, aceptarSinRespuestaCorrecta: true });
    const audit = await db().auditLog.findFirstOrThrow({ where: { accion: "PUBLICAR", entidadId: version.id } });
    expect(audit.resumen).toContain("ACEPTÓ publicar con 1 pregunta(s) cerradas sin respuesta correcta (1)");
  });

  it("teoría POR_PREGUNTA: bloquea aunque se confirme (no se podría calificar)", async () => {
    const { version } = await conPreguntas("POR_PREGUNTA");
    await expect(
      publicarVersion(admin, version.id, { vigenteDesde: T0, ahora: T0, aceptarSinRespuestaCorrecta: true }),
    ).rejects.toMatchObject({ code: "VERSION_INCOMPLETA" });
  });
});
