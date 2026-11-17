import bcrypt from "bcryptjs";
import type { Actor, Rol } from "../domain";
import { db } from "../db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { requirePermission } from "../auth/permissions";
import { addMinutes } from "../time";
import { registrarAudit } from "./audit";
import { hashPassword, PasswordSchema } from "./usuarios";

export const HORAS_SESION = 12;
const MAX_FALLOS_LOGIN = 5;
const VENTANA_LOGIN_MIN = 15;

let hashFalso: string | undefined;
const HASH_FALSO = () => (hashFalso ??= bcrypt.hashSync("usuario-inexistente", Number(process.env.BCRYPT_COST ?? 12)));

export type SesionValida = {
  sesionId: string;
  expiraEn: Date;
  kioscoIntentoId: string | null;
  actor: Actor;
  email: string;
  debeCambiarPassword: boolean;
};

const CREDENCIALES = () => new AppError("CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos", 401);

export async function iniciarSesion(
  emailIn: string,
  password: string,
  opts: { userAgent?: string | null; ahora?: Date } = {},
): Promise<{ sesionId: string; expiraEn: Date; debeCambiarPassword: boolean }> {
  const ahora = opts.ahora ?? new Date();
  const email = emailIn.trim().toLowerCase();
  const fallos = await db().auditLog.count({
    where: {
      accion: "LOGIN_FALLIDO",
      entidad: "Usuario",
      resumen: email,
      fecha: { gte: addMinutes(ahora, -VENTANA_LOGIN_MIN) },
    },
  });
  if (fallos >= MAX_FALLOS_LOGIN) {
    throw new AppError("LOGIN_BLOQUEADO", `Demasiados intentos. Espera ${VENTANA_LOGIN_MIN} minutos.`, 429);
  }
  const u = await db().usuario.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, u?.passwordHash ?? HASH_FALSO());
  if (!u || !ok || !u.activo) {
    await db().$transaction((tx) =>
      registrarAudit(tx, null, {
        accion: "LOGIN_FALLIDO",
        entidad: "Usuario",
        entidadId: u?.id ?? null,
        resumen: email,
      }),
    );
    throw CREDENCIALES();
  }
  const expiraEn = addMinutes(ahora, HORAS_SESION * 60);
  const s = await db().$transaction(async (tx) => {
    const s = await tx.sesion.create({
      data: { usuarioId: u.id, expiraEn, creadaEn: ahora, userAgent: opts.userAgent?.slice(0, 300) ?? null },
    });
    await tx.usuario.update({ where: { id: u.id }, data: { ultimoAcceso: ahora } });
    await registrarAudit(
      tx,
      { id: u.id, nombre: u.nombre, rol: u.rol as Rol },
      { accion: "LOGIN", entidad: "Usuario", entidadId: u.id },
    );
    return s;
  });
  return { sesionId: s.id, expiraEn, debeCambiarPassword: u.debeCambiarPassword };
}

export async function validarSesion(sesionId: string, ahora = new Date()): Promise<SesionValida | null> {
  const s = await db().sesion.findUnique({ where: { id: sesionId }, include: { usuario: true } });
  if (!s || s.revocadaEn || s.expiraEn.getTime() <= ahora.getTime() || !s.usuario.activo) return null;
  return {
    sesionId: s.id,
    expiraEn: s.expiraEn,
    kioscoIntentoId: s.kioscoIntentoId,
    actor: { id: s.usuario.id, nombre: s.usuario.nombre, rol: s.usuario.rol as Rol },
    email: s.usuario.email,
    debeCambiarPassword: s.usuario.debeCambiarPassword,
  };
}

export async function cerrarSesion(sesionId: string, ahora = new Date()) {
  await db().sesion.updateMany({ where: { id: sesionId, revocadaEn: null }, data: { revocadaEn: ahora } });
}

export async function cambiarPassword(actor: Actor, actual: string, nueva: string, sesionActualId?: string) {
  const u = await db().usuario.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await bcrypt.compare(actual, u.passwordHash))) {
    throw new AppError("PASSWORD_ACTUAL", "La contraseña actual no es correcta", 400);
  }
  PasswordSchema.parse(nueva);
  if (nueva === actual) throw new AppError("PASSWORD_IGUAL", "La nueva contraseña debe ser distinta de la actual", 400);
  const passwordHash = await hashPassword(nueva);
  await db().$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: u.id }, data: { passwordHash, debeCambiarPassword: false } });

    await tx.sesion.updateMany({
      where: { usuarioId: u.id, revocadaEn: null, ...(sesionActualId ? { id: { not: sesionActualId } } : {}) },
      data: { revocadaEn: new Date() },
    });
    await registrarAudit(tx, actor, { accion: "CAMBIAR_PASSWORD", entidad: "Usuario", entidadId: u.id });
  });
}
export async function entrarModoKiosco(actor: Actor, sesionId: string, intentoId: string) {
  requirePermission(actor, "asignacion:abrir_aqui");
  const it = await db().intento.findUnique({ where: { id: intentoId } });
  if (!it) throw new NotFoundError("El examen");
  if (it.modo !== "KIOSCO" || it.aplicadoPorId !== actor.id)
    throw new ForbiddenError("Este examen no se abrió en esta sesión");
  const r = await db().sesion.updateMany({
    where: { id: sesionId, usuarioId: actor.id, revocadaEn: null },
    data: { kioscoIntentoId: intentoId },
  });
  if (r.count === 0) throw new ForbiddenError("Sesión no válida");
}

export async function salirModoKiosco(sesionId: string, password: string) {
  const s = await db().sesion.findUnique({ where: { id: sesionId }, include: { usuario: true } });
  if (!s || s.revocadaEn || !s.kioscoIntentoId)
    throw new AppError("NO_KIOSCO", "La sesión no está en modo examen", 400);
  if (!(await bcrypt.compare(password, s.usuario.passwordHash))) {
    throw new AppError("PASSWORD_INCORRECTA", "Contraseña incorrecta", 401);
  }
  await db().$transaction(async (tx) => {
    await tx.sesion.update({ where: { id: s.id }, data: { kioscoIntentoId: null } });
    await registrarAudit(
      tx,
      { id: s.usuario.id, nombre: s.usuario.nombre, rol: s.usuario.rol as Rol },
      {
        accion: "SALIR_KIOSCO",
        entidad: "Intento",
        entidadId: s.kioscoIntentoId,
      },
    );
  });
}
