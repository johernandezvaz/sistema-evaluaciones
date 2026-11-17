import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import type { Actor } from "../lib/domain";
import { hashPassword, desactivarUsuario, restablecerPassword } from "../lib/services/usuarios";
import {
  cambiarPassword,
  cerrarSesion,
  entrarModoKiosco,
  iniciarSesion,
  salirModoKiosco,
  validarSesion,
} from "../lib/services/auth";
import { abrirAsignacion, crearAsignacion } from "../lib/services/asignaciones";
import { COOKIE_SESION, COOKIE_TABLET, firmarSesion, leerSesion } from "../lib/auth/token";
import { middleware } from "../middleware";
import { actores, dias, examenPublicado, persona } from "./helpers";

process.env.SESSION_SECRET ??= "x".repeat(40);
const PASS = "Prueba-Segura-1";
let superadmin: Actor;

async function usuarioConPassword(rol: "ADMIN" | "LECTURA" = "ADMIN", extra: { debeCambiarPassword?: boolean } = {}) {
  const email = `u${Math.random().toString(36).slice(2)}@test.mx`;
  const u = await db().usuario.create({
    data: {
      email,
      nombre: `Usuario ${rol}`,
      rol,
      passwordHash: await hashPassword(PASS),
      debeCambiarPassword: extra.debeCambiarPassword ?? false,
    },
  });
  return { email, actor: { id: u.id, nombre: u.nombre, rol } as Actor };
}

beforeAll(async () => {
  ({ superadmin } = await actores());
});

describe("login y sesiones", () => {
  it("login correcto crea una sesión válida; correo en mayúsculas también", async () => {
    const { email, actor } = await usuarioConPassword();
    const r = await iniciarSesion(`  ${email.toUpperCase()} `, PASS, { userAgent: "vitest" });
    const s = await validarSesion(r.sesionId);
    expect(s).toMatchObject({
      actor: { id: actor.id, rol: "ADMIN" },
      kioscoIntentoId: null,
      debeCambiarPassword: false,
    });
    await cerrarSesion(r.sesionId);
    expect(await validarSesion(r.sesionId)).toBeNull();
  });

  it("contraseña incorrecta y correo inexistente dan el mismo mensaje; 5 fallos bloquean", async () => {
    const { email } = await usuarioConPassword();
    const malo = await iniciarSesion(email, "otra-cosa").catch((e: unknown) => e);
    const noExiste = await iniciarSesion("nadie@test.mx", PASS).catch((e: unknown) => e);
    expect(malo).toMatchObject({ code: "CREDENCIALES_INVALIDAS", message: "Correo o contraseña incorrectos" });
    expect(noExiste).toMatchObject({ code: "CREDENCIALES_INVALIDAS", message: "Correo o contraseña incorrectos" });
    for (let i = 0; i < 4; i++) await iniciarSesion(email, "otra-cosa").catch(() => {});
    await expect(iniciarSesion(email, PASS)).rejects.toMatchObject({ code: "LOGIN_BLOQUEADO", status: 429 });
  });

  it("desactivar o restablecer la contraseña invalida las sesiones al instante", async () => {
    const a = await usuarioConPassword();
    const s1 = await iniciarSesion(a.email, PASS);
    await desactivarUsuario(superadmin, a.actor.id);
    expect(await validarSesion(s1.sesionId)).toBeNull();
    await expect(iniciarSesion(a.email, PASS)).rejects.toMatchObject({ code: "CREDENCIALES_INVALIDAS" });

    const b = await usuarioConPassword();
    const s2 = await iniciarSesion(b.email, PASS);
    await restablecerPassword(superadmin, b.actor.id, "Temporal-1234");
    expect(await validarSesion(s2.sesionId)).toBeNull();
    expect((await iniciarSesion(b.email, "Temporal-1234")).debeCambiarPassword).toBe(true);
  });

  it("cambiar la contraseña quita la marca de temporal y cierra las otras sesiones", async () => {
    const a = await usuarioConPassword("LECTURA", { debeCambiarPassword: true });
    const vieja = await iniciarSesion(a.email, PASS);
    const actual = await iniciarSesion(a.email, PASS);
    expect(actual.debeCambiarPassword).toBe(true);
    await expect(cambiarPassword(a.actor, "incorrecta", "Nueva-Clave-99", actual.sesionId)).rejects.toMatchObject({
      code: "PASSWORD_ACTUAL",
    });
    await expect(cambiarPassword(a.actor, PASS, PASS, actual.sesionId)).rejects.toMatchObject({
      code: "PASSWORD_IGUAL",
    });
    await cambiarPassword(a.actor, PASS, "Nueva-Clave-99", actual.sesionId);
    expect(await validarSesion(vieja.sesionId)).toBeNull();
    expect(await validarSesion(actual.sesionId)).toMatchObject({ debeCambiarPassword: false });
  });

  it("el token firmado lleva solo el id de sesión (y el intento en modo kiosco)", async () => {
    const t = await firmarSesion({ sid: "s1", kiosco: "i9" }, dias(400));
    expect(await leerSesion(t)).toEqual({ sid: "s1", kiosco: "i9" });
    expect(await leerSesion(`${t.slice(0, -2)}xx`)).toBeNull(); // firma alterada
    expect(await leerSesion(await firmarSesion({ sid: "s1" }, new Date(Date.now() - 1000)))).toBeNull(); // expirado
  });
});

describe("modo kiosco (Abrir aquí)", () => {
  it("encierra la sesión en el intento; salir exige la contraseña del mismo usuario", async () => {
    const a = await usuarioConPassword("LECTURA");
    const otro = await usuarioConPassword("ADMIN");
    const { examen } = await examenPublicado(otro.actor);
    const p = await persona();
    const ahora = new Date();
    const asig = await crearAsignacion(a.actor, { personaId: p.id, examenId: examen.id }, { ahora });
    const s = await iniciarSesion(a.email, PASS);
    const { intentoId } = await abrirAsignacion(
      { tipo: "SESION", sesionId: s.sesionId, actor: a.actor },
      p.numeroEmpleado,
      asig.codigo,
      { ahora },
    );

    // Otro usuario no puede encerrar su sesión en un intento que no abrió.
    const s2 = await iniciarSesion(otro.email, PASS);
    await expect(entrarModoKiosco(otro.actor, s2.sesionId, intentoId)).rejects.toMatchObject({ status: 403 });

    await entrarModoKiosco(a.actor, s.sesionId, intentoId);
    expect((await validarSesion(s.sesionId))?.kioscoIntentoId).toBe(intentoId);
    await expect(salirModoKiosco(s.sesionId, PASS + "x")).rejects.toMatchObject({ code: "PASSWORD_INCORRECTA" });
    expect((await validarSesion(s.sesionId))?.kioscoIntentoId).toBe(intentoId);
    await salirModoKiosco(s.sesionId, PASS);
    expect((await validarSesion(s.sesionId))?.kioscoIntentoId).toBeNull();
    expect(await db().auditLog.count({ where: { accion: "SALIR_KIOSCO", entidadId: intentoId } })).toBe(1);
  });
});

describe("middleware", () => {
  const pedir = async (ruta: string, cookies: Record<string, string> = {}) => {
    const req = new NextRequest(new URL(ruta, "http://localhost:3000"), {
      headers: {
        cookie: Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      },
    });
    const res = await middleware(req);
    const destino = res.headers.get("location");
    return destino ? new URL(destino).pathname + new URL(destino).search : "next";
  };

  it("sin sesión todo va a /login (con next), salvo /login", async () => {
    expect(await pedir("/matriz")).toBe("/login?next=%2Fmatriz");
    expect(await pedir("/")).toBe("/login");
    expect(await pedir("/login")).toBe("next");
    expect(await pedir("/kiosco/abc", { [COOKIE_SESION]: "basura" })).toBe("/login?next=%2Fkiosco%2Fabc");
  });

  it("sesión normal entra al panel; en /login la manda al inicio", async () => {
    const t = await firmarSesion({ sid: "s" }, dias(400));
    expect(await pedir("/matriz", { [COOKIE_SESION]: t })).toBe("next");
    expect(await pedir("/login", { [COOKIE_SESION]: t })).toBe("/");
  });

  it("modo kiosco: solo su examen, la salida y las imágenes; nunca /examenes/<id>", async () => {
    const t = await firmarSesion({ sid: "s", kiosco: "i1" }, dias(400));
    const c = { [COOKIE_SESION]: t };
    expect(await pedir("/kiosco/i1", c)).toBe("next");
    expect(await pedir("/kiosco/salir", c)).toBe("next");
    expect(await pedir("/examenes/highland/image1.png", c)).toBe("next");
    expect(await pedir("/examenes/highland", c)).toBe("/kiosco/i1");
    expect(await pedir("/kiosco/otro", c)).toBe("/kiosco/i1");
    expect(await pedir("/usuarios", c)).toBe("/kiosco/i1");
  });

  it("tablet compartida: solo /kiosco", async () => {
    const c = { [COOKIE_TABLET]: "token-de-tablet" };
    expect(await pedir("/kiosco", c)).toBe("next");
    expect(await pedir("/kiosco/i1", c)).toBe("next");
    expect(await pedir("/matriz", c)).toBe("/kiosco");
    expect(await pedir("/kiosco/salir", c)).toBe("/kiosco");
  });
});
