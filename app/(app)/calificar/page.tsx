import Link from "next/link";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { formatFecha } from "@/lib/time";
import { Encabezado, Pill, Tabla, td, th, Vacio } from "@/components/ui";

const MODO: Record<string, string> = {
  KIOSCO: "Abrir aquí",
  DISPOSITIVO: "Tablet compartida",
  CAPTURA_PAPEL: "Papel",
  IMPORTADO: "Importado",
};

export default async function PorCalificar() {
  const s = await requireSesion();
  const pendientes = await db().intento.findMany({
    where: { estado: "PENDIENTE_CALIFICAR" },
    include: { persona: true, examen: true, version: { select: { version: true, modoTeoria: true } } },
    orderBy: { fechaAplicacion: "asc" },
    take: 300,
  });
  const puede = can(s.actor, "intento:calificar");

  return (
    <>
      <Encabezado
        titulo="Por calificar"
        descripcion={
          puede
            ? "Exámenes enviados que esperan la teoría o la calificación de preguntas abiertas. No cuentan para el nivel ILUO hasta quedar finalizados."
            : "Exámenes que esperan calificación de un Admin. Puedes consultarlos, pero no calificarlos."
        }
      />
      {pendientes.length === 0 ? (
        <Vacio>No hay exámenes pendientes de calificar.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th className={th}>Empleado</th>
              <th className={th}>Examen</th>
              <th className={th}>Aplicado</th>
              <th className={th}>Modo</th>
              <th className={th}>Física</th>
              <th className={th}>Falta</th>
              <th className={th}>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pendientes.map((i) => (
              <tr key={i.id} className="hover:bg-primary-soft">
                <td className={td}>
                  {i.persona.nombre}
                  <span className="block font-mono text-caption text-ink-mute">{i.persona.numeroEmpleado}</span>
                </td>
                <td className={td}>
                  {i.examen?.nombre ?? "—"}
                  {i.version && <span className="ml-1 text-caption text-ink-mute">v{i.version.version}</span>}
                </td>
                <td className={`${td} whitespace-nowrap`}>{formatFecha(i.fechaAplicacion)}</td>
                <td className={td}>{MODO[i.modo] ?? i.modo}</td>
                <td className={`${td} tabular`}>
                  {i.aciertos ?? "—"}/{i.totalPiezas ?? "—"}
                </td>
                <td className={td}>
                  <Pill tono="warn">{i.version?.modoTeoria === "MANUAL" ? "Teoría" : "Preguntas abiertas"}</Pill>
                </td>
                <td className={`${td} text-right`}>
                  <Link href={`/calificar/${i.id}`} className={puede ? "btn-primary" : "btn-secondary"}>
                    {puede ? "Calificar" : "Ver"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
