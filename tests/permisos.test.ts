import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../lib/db";
import type { Actor } from "../lib/domain";
import { can, LISTA_PERMISOS, PERMISOS_DE_ESCRITURA } from "../lib/auth/permissions";
import { crearBorrador, publicarVersion } from "../lib/services/versiones";
import {
  anularIntento,
  calificarRespuestaAbierta,
  capturarPapel,
  capturarTeoriaManual,
  cerrarIncompleto,
} from "../lib/services/intentos";
import { desactivarPersona, reactivarPersona } from "../lib/services/personas";
import {
  cambiarRol,
  crearUsuario,
  desactivarUsuario,
  reactivarUsuario,
  restablecerPassword,
} from "../lib/services/usuarios";
import { actores, dias, usuario } from "./helpers";

let admin: Actor, lectura: Actor, superadmin: Actor;
beforeAll(async () => {
  ({ admin, lectura, superadmin } = await actores());
});

const prohibido = { status: 403, code: "PROHIBIDO" };

describe("matriz de permisos", () => {
  it("todos ven, exportan, asignan, abren aquí y cancelan las suyas", () => {
    for (const a of [admin, lectura, superadmin]) {
      for (const p of [
        "ver",
        "reporte:exportar",
        "asignacion:crear",
        "asignacion:abrir_aqui",
        "asignacion:cancelar_propia",
      ] as const) {
        expect(can(a, p)).toBe(true);
      }
    }
  });

  it("solo Admin edita datos de evaluación; solo Superadmin gestiona usuarios", () => {
    const soloAdmin = PERMISOS_DE_ESCRITURA.filter(
      (p) =>
        !p.startsWith("asignacion:crear") &&
        !["asignacion:abrir_aqui", "asignacion:cancelar_propia", "usuario:gestionar"].includes(p),
    );
    for (const p of soloAdmin) {
      expect([can(admin, p), can(lectura, p), can(superadmin, p)]).toEqual([true, false, false]);
    }
    expect([
      can(admin, "usuario:gestionar"),
      can(lectura, "usuario:gestionar"),
      can(superadmin, "usuario:gestionar"),
    ]).toEqual([false, false, true]);
    expect(can(null, "ver")).toBe(false);
    expect(LISTA_PERMISOS.length).toBeGreaterThan(15);
  });
});

describe("403 en el servidor", () => {
  it("Superadmin y Lectura reciben 403 en toda escritura de evaluación", async () => {
    for (const a of [lectura, superadmin]) {
      await expect(crearBorrador(a, "x")).rejects.toMatchObject(prohibido);
      await expect(publicarVersion(a, "x", { motivo: "m" })).rejects.toMatchObject(prohibido);
      await expect(
        capturarPapel(a, { personaId: "x", examenId: "x", fechaAplicacion: dias(1), piezas: [] }),
      ).rejects.toMatchObject(prohibido);
      await expect(capturarTeoriaManual(a, "x", 5)).rejects.toMatchObject(prohibido);
      await expect(calificarRespuestaAbierta(a, "x", 1)).rejects.toMatchObject(prohibido);
      await expect(anularIntento(a, "x", "m")).rejects.toMatchObject(prohibido);
      await expect(cerrarIncompleto(a, "x")).rejects.toMatchObject(prohibido);
      await expect(desactivarPersona(a, "x")).rejects.toMatchObject(prohibido);
      await expect(reactivarPersona(a, "x")).rejects.toMatchObject(prohibido);
    }
  });

  it("Admin y Lectura reciben 403 en gestión de usuarios", async () => {
    const otro = await usuario("LECTURA");
    for (const a of [admin, lectura]) {
      await expect(
        crearUsuario(a, { email: "n@x.mx", nombre: "Nuevo", rol: "LECTURA", passwordTemporal: "Temporal123" }),
      ).rejects.toMatchObject(prohibido);
      await expect(cambiarRol(a, otro.id, "ADMIN")).rejects.toMatchObject(prohibido);
      await expect(desactivarUsuario(a, otro.id)).rejects.toMatchObject(prohibido);
      await expect(reactivarUsuario(a, otro.id)).rejects.toMatchObject(prohibido);
      await expect(restablecerPassword(a, otro.id, "Temporal123")).rejects.toMatchObject(prohibido);
    }
  });
});

describe("gestión de usuarios (Superadmin)", () => {
  it("crea Admin/Lectura con cambio de contraseña obligatorio, pero nunca otro Superadmin", async () => {
    const u = await crearUsuario(superadmin, {
      email: "  Nuevo.Admin@Planta.MX ",
      nombre: "Nuevo Admin",
      rol: "ADMIN",
      passwordTemporal: "Temporal123",
    });
    expect(u).toMatchObject({ email: "nuevo.admin@planta.mx", rol: "ADMIN" });
    expect(await db().usuario.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({
      debeCambiarPassword: true,
      creadoPorId: superadmin.id,
    });
    expect(await db().auditLog.count({ where: { entidad: "Usuario", entidadId: u.id } })).toBe(1);
    await expect(
      crearUsuario(superadmin, {
        email: "otro.super@x.mx",
        nombre: "Otro",
        rol: "SUPERADMIN",
        passwordTemporal: "Temporal123",
      }),
    ).rejects.toMatchObject(prohibido);
    await expect(cambiarRol(superadmin, u.id, "SUPERADMIN")).rejects.toMatchObject(prohibido);
  });

  it("no puede desactivarse ni cambiarse el rol a sí mismo, ni tocar a otro Superadmin", async () => {
    await expect(desactivarUsuario(superadmin, superadmin.id)).rejects.toMatchObject(prohibido);
    await expect(cambiarRol(superadmin, superadmin.id, "ADMIN")).rejects.toMatchObject(prohibido);
    const otroSuper = await usuario("SUPERADMIN");
    await expect(desactivarUsuario(superadmin, otroSuper.id)).rejects.toMatchObject(prohibido);
  });

  it("desactivar revoca sus sesiones y no borra el usuario", async () => {
    const u = await usuario("ADMIN");
    await db().sesion.create({ data: { usuarioId: u.id, expiraEn: dias(400) } });
    await desactivarUsuario(superadmin, u.id);
    expect(await db().usuario.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({ activo: false });
    expect(await db().sesion.count({ where: { usuarioId: u.id, revocadaEn: null } })).toBe(0);
  });
});
