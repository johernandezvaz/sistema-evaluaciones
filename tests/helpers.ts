/** Fábricas de datos para las pruebas. Cada llamada crea registros con nombres únicos. */
import { db } from "../lib/db";
import type { Actor, Rol } from "../lib/domain";
import { publicarVersion } from "../lib/services/versiones";

let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

export const T0 = new Date("2026-01-01T12:00:00.000Z");
export const dias = (d: number, base = T0) => new Date(base.getTime() + d * 86_400_000);
export const minutos = (m: number, base: Date) => new Date(base.getTime() + m * 60_000);

/** Clave de Highland del estudio Kappa (piezas 1–30). */
export const CLAVE_HIGHLAND = "BBGGBBGBGBGGBGBGGBGBGBBGGBGBBG".split("") as ("G" | "B")[];

export async function usuario(rol: Rol): Promise<Actor> {
  const u = await db().usuario.create({
    data: { email: `${rol.toLowerCase()}-${uid()}@test.mx`, nombre: `${rol} ${uid()}`, rol, passwordHash: "x" },
  });
  return { id: u.id, nombre: u.nombre, rol };
}

export async function actores() {
  return { admin: await usuario("ADMIN"), lectura: await usuario("LECTURA"), superadmin: await usuario("SUPERADMIN") };
}

export async function persona(extra: { fechaIngresoPuesto?: Date } = {}) {
  const k = uid();
  return db().persona.create({
    data: {
      numeroEmpleado: `E${k}`,
      nombre: `Empleado ${k}`,
      area: { connectOrCreate: { where: { nombre: "PINTURA" }, create: { nombre: "PINTURA" } } },
      turno: { connectOrCreate: { where: { nombre: "1ER" }, create: { nombre: "1ER" } } },
      puesto: "OPERADOR",
      fechaIngresoPuesto: extra.fechaIngresoPuesto ?? null,
    },
  });
}

/** Modelo + examen + versión con clave (BORRADOR). */
export async function examenConBorrador(clave: ("G" | "B")[] = CLAVE_HIGHLAND, extra: { modoTeoria?: string } = {}) {
  const k = uid();
  const modelo = await db().modelo.create({ data: { slug: `m-${k}`, nombre: `MODELO ${k}`, grupo: "ENSAMBLES" } });
  const examen = await db().examen.create({ data: { modeloId: modelo.id, nombre: `Examen ${k}` } });
  const version = await nuevaVersion(examen.id, 1, clave, extra);
  return { modelo, examen, version };
}

export async function nuevaVersion(
  examenId: string,
  numero: number,
  clave: ("G" | "B")[],
  extra: { modoTeoria?: string } = {},
) {
  const version = await db().examenVersion.create({
    data: { examenId, version: numero, modoTeoria: extra.modoTeoria ?? "MANUAL" },
  });
  await db().piezaClave.createMany({
    data: clave.map((esperado, i) => ({ versionId: version.id, orden: i + 1, numero: i + 1, esperado })),
  });
  return version;
}

/** Examen con v1 PUBLICADA vigente desde `desde` (por defecto T0). */
export async function examenPublicado(admin: Actor, clave: ("G" | "B")[] = CLAVE_HIGHLAND, desde = T0) {
  const r = await examenConBorrador(clave);
  const v1 = await publicarVersion(admin, r.version.id, { vigenteDesde: desde, ahora: desde });
  return { ...r, version: v1 };
}

/** Tablet compartida ya emparejada. */
export async function dispositivo(admin: Actor) {
  return db().dispositivo.create({
    data: { nombre: `Tablet ${uid()}`, tokenHash: `hash-${uid()}`, emparejadoEn: T0, registradoPorId: admin.id },
  });
}

/** Invierte la respuesta correcta (para provocar errores a propósito). */
export const contraria = (x: "G" | "B") => (x === "G" ? "B" : "G");

/**
 * Cómo llega por el ORM una escritura que un trigger rechazó (Prisma 6 + SQLite: P2003 sin el texto del RAISE).
 * El texto de cada trigger se verifica con SQL directo en tests/integridad/triggers.test.ts.
 */
export const BLOQUEO_TRIGGER = { code: "P2003" } as const;
