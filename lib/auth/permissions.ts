import type { Actor, Rol } from "../domain";
import { ForbiddenError } from "../errors";

const TODOS: readonly Rol[] = ["SUPERADMIN", "ADMIN", "LECTURA"];
const ADMIN: readonly Rol[] = ["ADMIN"];
const SUPER: readonly Rol[] = ["SUPERADMIN"];

export const PERMISOS = {
  ver: TODOS,
  "reporte:exportar": TODOS,
  "asignacion:crear": TODOS,
  "asignacion:abrir_aqui": TODOS,
  "asignacion:cancelar_propia": TODOS,
  "asignacion:cancelar_cualquiera": ADMIN,
  "examen:editar": ADMIN,
  "intento:capturar_papel": ADMIN,
  "intento:calificar": ADMIN,
  "intento:anular": ADMIN,
  "intento:cerrar_incompleto": ADMIN,
  "persona:editar": ADMIN,
  "modelo:editar": ADMIN,
  "requisito:editar": ADMIN,
  "iluo:asignar_manual": ADMIN,
  "importacion:ejecutar": ADMIN,
  "config:editar": ADMIN,
  "dispositivo:gestionar": ADMIN,
  "usuario:gestionar": SUPER,
} as const satisfies Record<string, readonly Rol[]>;

export type Permiso = keyof typeof PERMISOS;
export const LISTA_PERMISOS = Object.keys(PERMISOS) as Permiso[];

export const PERMISOS_DE_ESCRITURA = LISTA_PERMISOS.filter((p) => p !== "ver" && p !== "reporte:exportar");

export function can(actor: Pick<Actor, "rol"> | null | undefined, permiso: Permiso): boolean {
  return !!actor && (PERMISOS[permiso] as readonly Rol[]).includes(actor.rol);
}

export function requirePermission(actor: Pick<Actor, "rol"> | null | undefined, permiso: Permiso): void {
  if (!can(actor, permiso)) throw new ForbiddenError();
}

export const ROLES_GESTIONABLES: readonly Rol[] = ["ADMIN", "LECTURA"];

export const esSoloLectura = (rol: Rol) => rol !== "ADMIN";
