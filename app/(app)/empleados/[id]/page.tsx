import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";
import { estadoCandidatoO } from "@/lib/iluo";
import { formatFecha } from "@/lib/time";
import { textoFisico, sinContestar } from "@/lib/scoring";
import { Encabezado, Pill, Tabla, td, th, Vacio } from "@/components/ui";
import { LetraILUO, MODO_INTENTO, PillEstado, PillResultado, pct1 } from "@/components/etiquetas";

export default async function Empleado({ params }: { params: Promise<{ id: string }> }) {
  await requireSesion();
  const { id } = await params;
  const persona = await db().persona.findUnique({ where: { id }, include: { area: true, turno: true } });
  if (!persona) notFound();

  const [cfg, niveles, intentos] = await Promise.all([
    getConfig(),
    db().nivelILUO.findMany({
      where: { personaId: id },
      include: { modelo: { select: { nombre: true, orden: true } } },
      orderBy: { modelo: { orden: "asc" } },
    }),
    db().intento.findMany({
      where: { personaId: id },
      include: {
        examen: { select: { nombre: true } },
        modelo: { select: { nombre: true } },
        version: { select: { version: true } },
        _count: { select: { piezas: true } },
      },
      orderBy: [{ fechaAplicacion: "desc" }, { creadoEn: "desc" }],
    }),
  ]);
  const ahora = new Date();

  return (
    <>
      <Link href="/empleados" className="mb-4 inline-flex items-center gap-1 text-caption text-primary hover:underline">
        <ArrowLeft size={14} aria-hidden /> Empleados
      </Link>
      <Encabezado
        titulo={persona.nombre}
        descripcion={`No. ${persona.numeroEmpleado} · ${persona.area.nombre} · ${persona.turno.nombre} · ${persona.puesto}`}
        acciones={persona.activo ? <Pill tono="ok">Activo</Pill> : <Pill>Inactivo</Pill>}
      />

      <dl className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <dt className="text-caption text-ink-mute">Ingreso al puesto</dt>
          <dd className="text-body-md">
            {persona.fechaIngresoPuesto ? formatFecha(persona.fechaIngresoPuesto) : "Falta fecha de ingreso al puesto"}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-mute">Exámenes presentados</dt>
          <dd className="text-body-md tabular">{intentos.filter((i) => i.estado !== "ANULADO").length}</dd>
        </div>
      </dl>

      <section className="card mb-6" aria-labelledby="t-niveles">
        <h2 id="t-niveles" className="text-heading-lg">
          Nivel ILUO por modelo
        </h2>
        {niveles.length === 0 ? (
          <p className="mt-2 text-caption text-ink-mute">Sin nivel en ningún modelo.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {niveles.map((n) => {
              const c = estadoCandidatoO({
                candidatoO: n.candidatoO,
                fechaEstimadaO: n.fechaEstimadaO,
                fechaIngresoPuesto: persona.fechaIngresoPuesto,
                mesesParaO: cfg.mesesParaO,
                ahora,
              });
              return (
                <li key={n.id} className="flex items-center gap-3 rounded-md border border-hairline px-3 py-2">
                  <LetraILUO letra={n.letra} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-md">{n.modelo.nombre}</span>
                    <span className="block text-caption text-ink-mute">
                      {formatFecha(n.fecha)} · {n.origen === "MANUAL" ? "manual" : "por examen"}
                      {n.candidatoO &&
                        (c.faltaFechaIngreso
                          ? " · Candidato a O · falta fecha de ingreso"
                          : c.listoParaO
                            ? " · Listo para O"
                            : ` · Candidato a O desde ${formatFecha(c.fechaEstimadaO!)}`)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="t-historial">
        <h2 id="t-historial" className="mb-3 text-heading-lg">
          Historial de exámenes
        </h2>
        {intentos.length === 0 ? (
          <Vacio>Todavía no ha presentado exámenes.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={th}>Aplicado</th>
                <th className={th}>Examen</th>
                <th className={th}>Ronda</th>
                <th className={th}>Modo</th>
                <th className={th}>Física</th>
                <th className={th}>Calificación</th>
                <th className={th}>Estado</th>
                <th className={th}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {intentos.map((i) => (
                <tr key={i.id} className={`hover:bg-primary-soft ${i.estado === "ANULADO" ? "text-ink-mute" : ""}`}>
                  <td className={`${td} whitespace-nowrap`}>{formatFecha(i.fechaAplicacion)}</td>
                  <td className={td}>
                    {i.examen?.nombre ?? i.modelo.nombre}
                    {i.version && <span className="ml-1 text-caption text-ink-mute">v{i.version.version}</span>}
                  </td>
                  <td className={`${td} tabular`}>{i.ronda}</td>
                  <td className={td}>{MODO_INTENTO[i.modo] ?? i.modo}</td>
                  <td className={`${td} whitespace-nowrap tabular`}>
                    {i.aciertos !== null && i.totalPiezas !== null
                      ? textoFisico(i.aciertos, i.totalPiezas, sinContestar(i.totalPiezas, i._count.piezas))
                      : "—"}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className="mr-2 tabular">{pct1(i.calificacion)}</span>
                    <PillResultado resultado={i.resultado} />
                  </td>
                  <td className={td}>
                    <PillEstado estado={i.estado} />
                    {i.estado === "ANULADO" && i.anuladoMotivo && (
                      <span className="block text-caption text-ink-mute">{i.anuladoMotivo}</span>
                    )}
                  </td>
                  <td className={`${td} text-right`}>
                    {i.versionId && (
                      <Link href={`/calificar/${i.id}`} className="btn-secondary">
                        Ver
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </section>
    </>
  );
}
