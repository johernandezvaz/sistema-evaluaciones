import type { Rol } from "@/lib/domain";

export type ItemNav = { href: string; titulo: string; icono: IconoNav; soloRoles?: Rol[] };
export type IconoNav =
  | "inicio"
  | "empleados"
  | "examenes"
  | "asignaciones"
  | "calificar"
  | "matriz"
  | "kappa"
  | "reportes"
  | "historial"
  | "configuracion"
  | "usuarios";

export const NAVEGACION: ItemNav[] = [
  { href: "/", titulo: "Inicio", icono: "inicio" },
  { href: "/empleados", titulo: "Empleados", icono: "empleados" },
  { href: "/examenes", titulo: "Modelos y exámenes", icono: "examenes" },
  { href: "/asignaciones", titulo: "Asignaciones", icono: "asignaciones" },
  { href: "/calificar", titulo: "Por calificar", icono: "calificar" },
  { href: "/matriz", titulo: "Matriz ILUO", icono: "matriz" },
  { href: "/kappa", titulo: "Estudio Kappa", icono: "kappa" },
  { href: "/reportes", titulo: "Reportes", icono: "reportes" },
  { href: "/historial", titulo: "Historial de cambios", icono: "historial" },
  { href: "/configuracion", titulo: "Configuración", icono: "configuracion" },
  { href: "/usuarios", titulo: "Usuarios", icono: "usuarios", soloRoles: ["SUPERADMIN"] },
];

export const navPara = (rol: Rol) => NAVEGACION.filter((i) => !i.soloRoles || i.soloRoles.includes(rol));

export const itemActivo = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

export const tituloDeRuta = (pathname: string) =>
  [...NAVEGACION].reverse().find((i) => itemActivo(pathname, i.href))?.titulo ?? "";

export const ETIQUETA_ROL: Record<Rol, string> = { SUPERADMIN: "Superadmin", ADMIN: "Admin", LECTURA: "Solo lectura" };
