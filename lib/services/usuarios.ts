import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Actor, Rol } from "../domain";
import { db } from "../db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { requirePermission, ROLES_GESTIONABLES } from "../auth/permissions";
import { registrarAudit } from "./audit";

const BCRYPT_COST = Number(process.env.BCRYPT_COST ?? 12);
export const PasswordSchema = z.string().min(8, "Mínimo 8 caracteres").max(200);
export const hashPassword = (p: string) => bcrypt.hash(PasswordSchema.parse(p), BCRYPT_COST);

export const CrearUsuarioInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Correo inválido")),
  nombre: z.string().trim().min(2).max(120),
  rol: z.enum(["SUPERADMIN", "ADMIN", "LECTURA"]),
  passwordTemporal: PasswordSchema,
});

function rolGestionable(rol: Rol) {
  if (!ROLES_GESTIONABLES.includes(rol)) throw new ForbiddenError("No se puede crear ni asignar el rol Superadmin");
}

async function objetivo(actor: Actor, usuarioId: string) {
  if (usuarioId === actor.id) throw new ForbiddenError("No puedes cambiar tu propio rol ni desactivarte");
  const u = await db().usuario.findUnique({ where: { id: usuarioId } });
  if (!u) throw new NotFoundError("El usuario");
  if (u.rol === "SUPERADMIN") throw new ForbiddenError("No se puede modificar a otro Superadmin");
  return u;
}

export async function crearUsuario(actor: Actor, input: z.input<typeof CrearUsuarioInput>) {
  requirePermission(actor, "usuario:gestionar");
  const d = CrearUsuarioInput.parse(input);
  rolGestionable(d.rol);
  if (await db().usuario.findUnique({ where: { email: d.email } }))
    throw new AppError("EMAIL_DUPLICADO", "Ya existe un usuario con ese correo", 409);
  const passwordHash = await hashPassword(d.passwordTemporal);
  return db().$transaction(async (tx) => {
    const u = await tx.usuario.create({
      data: {
        email: d.email,
        nombre: d.nombre,
        rol: d.rol,
        passwordHash,
        debeCambiarPassword: true,
        creadoPorId: actor.id,
      },
      select: { id: true, email: true, nombre: true, rol: true, activo: true },
    });
    await registrarAudit(tx, actor, {
      accion: "CREAR",
      entidad: "Usuario",
      entidadId: u.id,
      resumen: `Creó al usuario ${u.email} (${u.rol})`,
    });
    return u;
  });
}

export async function cambiarRol(actor: Actor, usuarioId: string, rol: Rol) {
  requirePermission(actor, "usuario:gestionar");
  rolGestionable(rol);
  const u = await objetivo(actor, usuarioId);
  return db().$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: u.id }, data: { rol } });
    await tx.sesion.updateMany({ where: { usuarioId: u.id, revocadaEn: null }, data: { revocadaEn: new Date() } });
    await registrarAudit(tx, actor, {
      accion: "EDITAR",
      entidad: "Usuario",
      entidadId: u.id,
      resumen: `Cambió el rol de ${u.email}`,
      antes: { rol: u.rol },
      despues: { rol },
    });
  });
}

export async function desactivarUsuario(actor: Actor, usuarioId: string) {
  requirePermission(actor, "usuario:gestionar");
  const u = await objetivo(actor, usuarioId);
  const ahora = new Date();
  return db().$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: u.id }, data: { activo: false, desactivadoEn: ahora } });
    await tx.sesion.updateMany({ where: { usuarioId: u.id, revocadaEn: null }, data: { revocadaEn: ahora } });
    await registrarAudit(tx, actor, {
      accion: "DESACTIVAR",
      entidad: "Usuario",
      entidadId: u.id,
      resumen: `Desactivó a ${u.email}`,
    });
  });
}

export async function reactivarUsuario(actor: Actor, usuarioId: string) {
  requirePermission(actor, "usuario:gestionar");
  const u = await objetivo(actor, usuarioId);
  return db().$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: u.id }, data: { activo: true, desactivadoEn: null } });
    await registrarAudit(tx, actor, {
      accion: "ACTIVAR",
      entidad: "Usuario",
      entidadId: u.id,
      resumen: `Reactivó a ${u.email}`,
    });
  });
}

export async function restablecerPassword(actor: Actor, usuarioId: string, passwordTemporal: string) {
  requirePermission(actor, "usuario:gestionar");
  const u = await objetivo(actor, usuarioId);
  const passwordHash = await hashPassword(passwordTemporal);
  return db().$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: u.id }, data: { passwordHash, debeCambiarPassword: true } });
    await tx.sesion.updateMany({ where: { usuarioId: u.id, revocadaEn: null }, data: { revocadaEn: new Date() } });
    await registrarAudit(tx, actor, {
      accion: "RESTABLECER_PASSWORD",
      entidad: "Usuario",
      entidadId: u.id,
      resumen: `Restableció la contraseña de ${u.email}`,
    });
  });
}

export async function asegurarSuperadminInicial(env = process.env) {
  const email = env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = env.SUPERADMIN_PASSWORD;
  if (!email || !password) throw new Error("Define SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD en .env");
  const existente = await db().usuario.findUnique({ where: { email } });
  if (existente) return { creado: false, id: existente.id };
  const passwordHash = await hashPassword(password);
  return db().$transaction(async (tx) => {
    const u = await tx.usuario.create({
      data: { email, nombre: "Superadmin", rol: "SUPERADMIN", passwordHash, debeCambiarPassword: true },
    });
    await registrarAudit(tx, null, {
      accion: "CREAR",
      entidad: "Usuario",
      entidadId: u.id,
      resumen: `Alta inicial del Superadmin ${email} (CLI)`,
    });
    return { creado: true, id: u.id };
  });
}
