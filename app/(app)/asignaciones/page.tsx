import { db } from "@/lib/db";
import { requireSesion } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { vencerVencidas } from "@/lib/services/asignaciones";
import { formatFechaHora } from "@/lib/time";
import { Encabezado, Pill, Tabla, td, th, Vacio } from "@/components/ui";
import { AbrirAquiBoton } from "./abrir-aqui";

const TONO_ESTADO = { PENDIENTE: "info", EN_CURSO: "warn" } as const;

export default async function Asignaciones() {
  const s = await requireSesion();
  await vencerVencidas();
  const activas = await db().asignacion.findMany({
    where: { estado: { in: ["PENDIENTE", "EN_CURSO"] } },
    include: { persona: true, examen: true, asignadoPor: { select: { nombre: true } } },
    orderBy: { asignadoEn: "desc" },
    take: 200,
  });
  const puedeAbrir = can(s.actor, "asignacion:abrir_aqui");

  return (
    <>
      <Encabezado
        titulo="Asignaciones"
        descripcion="Exámenes asignados que aún no se terminan. La asignación masiva, los códigos imprimibles con QR y la cancelación llegan en la fase de asignaciones."
      />
      {activas.length === 0 ? (
        <Vacio>No hay asignaciones activas.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th className={th}>Empleado</th>
              <th className={th}>Examen</th>
              <th className={th}>Código</th>
              <th className={th}>Estado</th>
              <th className={th}>Ronda</th>
              <th className={th}>Asignó</th>
              <th className={th}>Vence (si no empieza)</th>
              <th className={th}>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {activas.map((a) => (
              <tr key={a.id} className="hover:bg-primary-soft">
                <td className={td}>
                  {a.persona.nombre}
                  <span className="block font-mono text-caption text-ink-mute">{a.persona.numeroEmpleado}</span>
                </td>
                <td className={td}>{a.examen.nombre}</td>
                <td className={`${td} font-mono tracking-widest`}>{a.codigo}</td>
                <td className={td}>
                  <Pill tono={TONO_ESTADO[a.estado as keyof typeof TONO_ESTADO] ?? "neutral"}>
                    {a.estado === "EN_CURSO" ? "En curso" : "Pendiente"}
                  </Pill>
                </td>
                <td className={`${td} tabular`}>{a.ronda}</td>
                <td className={td}>{a.asignadoPor.nombre}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {a.estado === "PENDIENTE" ? formatFechaHora(a.venceEn) : "—"}
                </td>
                <td className={`${td} text-right`}>
                  {puedeAbrir && a.estado === "PENDIENTE" && <AbrirAquiBoton asignacionId={a.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
