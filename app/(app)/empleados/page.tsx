import Link from "next/link";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/auth/session";
import { formatFecha } from "@/lib/time";
import { Encabezado, Pill, Tabla, td, th, Vacio } from "@/components/ui";

export default async function Empleados({ searchParams }: { searchParams: Promise<{ q?: string; area?: string }> }) {
  await requireSesion();
  const { q = "", area = "" } = await searchParams;
  const texto = q.trim();
  const [areas, personas] = await Promise.all([
    db().area.findMany({ orderBy: { orden: "asc" } }),
    db().persona.findMany({
      where: {
        ...(area ? { area: { nombre: area } } : {}),
        ...(texto ? { OR: [{ nombre: { contains: texto } }, { numeroEmpleado: { contains: texto } }] } : {}),
      },
      include: { area: true, turno: true },
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
      take: 500,
    }),
  ]);

  return (
    <>
      <Encabezado
        titulo="Empleados"
        descripcion="Consulta de empleados y su historial de exámenes. Alta, edición y desactivación llegan en la fase de catálogos."
      />
      <form className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <div>
          <label htmlFor="q" className="label">
            Buscar
          </label>
          <input id="q" name="q" defaultValue={texto} placeholder="Nombre o número" className="input w-64" />
        </div>
        <div>
          <label htmlFor="area" className="label">
            Área
          </label>
          <select id="area" name="area" defaultValue={area} className="input w-44">
            <option value="">Todas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.nombre}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Filtrar
        </button>
      </form>
      {personas.length === 0 ? (
        <Vacio>No hay empleados con ese filtro.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th className={th}>No.</th>
              <th className={th}>Nombre</th>
              <th className={th}>Área</th>
              <th className={th}>Turno</th>
              <th className={th}>Puesto</th>
              <th className={th}>Ingreso al puesto</th>
              <th className={th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {personas.map((p) => (
              <tr key={p.id} className="hover:bg-primary-soft">
                <td className={`${td} font-mono`}>{p.numeroEmpleado}</td>
                <td className={td}>
                  <Link href={`/empleados/${p.id}`} className="text-primary hover:underline">
                    {p.nombre}
                  </Link>
                </td>
                <td className={td}>{p.area.nombre}</td>
                <td className={td}>{p.turno.nombre}</td>
                <td className={td}>{p.puesto}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {p.fechaIngresoPuesto ? formatFecha(p.fechaIngresoPuesto) : "—"}
                </td>
                <td className={td}>{p.activo ? <Pill tono="ok">Activo</Pill> : <Pill>Inactivo</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
