import { db } from "@/lib/db";
import type { Rol } from "@/lib/domain";
import { requireSesion } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { formatFechaHora } from "@/lib/time";
import { ETIQUETA_ROL } from "@/components/shell/navegacion";
import { Encabezado, Pill, Tabla, td, th, Vacio } from "@/components/ui";

export default async function Usuarios() {
  const s = await requireSesion();
  if (!can(s.actor, "usuario:gestionar")) {
    return (
      <>
        <Encabezado titulo="Usuarios" />
        <Vacio>No tienes permiso para gestionar usuarios (solo Superadmin).</Vacio>
      </>
    );
  }
  const usuarios = await db().usuario.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }] });
  return (
    <>
      <Encabezado
        titulo="Usuarios"
        descripcion="Superadmin crea y administra cuentas Admin y Solo lectura. Los usuarios se desactivan, nunca se borran."
      />
      <Tabla>
        <thead>
          <tr>
            <th className={th}>Nombre</th>
            <th className={th}>Correo</th>
            <th className={th}>Rol</th>
            <th className={th}>Estado</th>
            <th className={th}>Último acceso</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className="hover:bg-primary-soft">
              <td className={td}>{u.nombre}</td>
              <td className={td}>{u.email}</td>
              <td className={td}>{ETIQUETA_ROL[u.rol as Rol] ?? u.rol}</td>
              <td className={td}>
                {u.activo ? <Pill tono="info">Activo</Pill> : <Pill>Desactivado</Pill>}
                {u.debeCambiarPassword && <span className="ml-2 text-caption text-ink-mute">contraseña temporal</span>}
              </td>
              <td className={`${td} whitespace-nowrap`}>{u.ultimoAcceso ? formatFechaHora(u.ultimoAcceso) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
