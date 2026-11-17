import Link from "next/link";
import { AlertTriangle, ClipboardCheck, Hourglass, QrCode, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/auth/session";
import { vencerVencidas } from "@/lib/services/asignaciones";
import { preguntasSinRespuestaCorrecta } from "@/lib/services/versiones";
import { Encabezado, StatTile, Pill } from "@/components/ui";

export default async function Inicio() {
  const s = await requireSesion();
  await vencerVencidas();
  const [empleados, pendientes, enCurso, porCalificar, incompletos, modelos] = await Promise.all([
    db().persona.count({ where: { activo: true } }),
    db().asignacion.count({ where: { estado: "PENDIENTE" } }),
    db().asignacion.count({ where: { estado: "EN_CURSO" } }),
    db().intento.count({ where: { estado: "PENDIENTE_CALIFICAR" } }),
    db().intento.count({ where: { estado: "EN_CURSO", asignacion: { estado: { not: "EN_CURSO" } } } }),
    db().modelo.findMany({
      where: { activo: true },
      orderBy: [{ grupo: "asc" }, { orden: "asc" }],
      include: {
        examenes: {
          include: {
            versiones: {
              select: {
                estado: true,
                preguntas: {
                  select: {
                    orden: true,
                    texto: true,
                    tipo: true,
                    respuestaCorrecta: true,
                    flechas: { select: { zonaCorrecta: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);
  const conExamen = modelos.filter((m) => m.examenes.some((e) => e.versiones.some((v) => v.estado === "PUBLICADA")));
  
  const sinRespuesta = (m: (typeof modelos)[number]) =>
    m.examenes
      .flatMap((e) => e.versiones.filter((v) => v.estado === "PUBLICADA"))
      .reduce((n, v) => n + preguntasSinRespuestaCorrecta(v.preguntas).length, 0);
  const porConfirmar = modelos.filter((m) => m.porConfirmar);

  return (
    <>
      <Encabezado
        titulo={`Hola, ${s.actor.nombre.split(" ")[0]}`}
        descripcion="Resumen de evaluaciones y certificación ILUO."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile etiqueta="Empleados activos" valor={empleados} icono={Users} />
        <StatTile
          etiqueta="Asignaciones pendientes"
          valor={pendientes}
          detalle={`${enCurso} en curso`}
          icono={QrCode}
        />
        <StatTile
          etiqueta="Por calificar"
          valor={porCalificar}
          detalle="Teoría o preguntas abiertas"
          icono={ClipboardCheck}
        />
        <StatTile
          etiqueta="Exámenes incompletos"
          valor={incompletos}
          detalle="Vencieron sin enviarse"
          icono={Hourglass}
        />
      </div>

      <section className="card mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-heading-lg">Modelos</h2>
          <p className="text-caption text-ink-mute">
            {conExamen.length} de {modelos.length} con examen publicado
          </p>
        </div>
        <ul className="mt-4 divide-y divide-hairline">
          {modelos.map((m) => {
            const publicado = conExamen.includes(m);
            const faltan = publicado ? sinRespuesta(m) : 0;
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {m.nombre}{" "}
                  <span className="text-caption text-ink-mute-2">· {m.grupo.replace("_", " ").toLowerCase()}</span>
                </span>
                <span className="flex flex-wrap justify-end gap-2">
                  {faltan > 0 && (
                    <Pill
                      tono="warn"
                      title="Se publicó aceptando la advertencia: la pantalla de calificar no puede marcar esas preguntas como correctas o incorrectas."
                    >
                      {faltan} pregunta{faltan === 1 ? "" : "s"} sin respuesta correcta
                    </Pill>
                  )}
                  {m.porConfirmar && (
                    <Pill tono="warn" title={m.notaMapeo ?? undefined}>
                      Por confirmar
                    </Pill>
                  )}
                  {publicado ? (
                    <Pill tono="info">Examen publicado</Pill>
                  ) : m.examenes.length ? (
                    <Pill>Examen en borrador</Pill>
                  ) : (
                    <Pill>Sin examen en el sistema</Pill>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {porConfirmar.length > 0 && (
        <section className="card mt-6">
          <h2 className="flex items-center gap-2 text-heading-lg">
            <AlertTriangle size={18} aria-hidden className="text-status-warn" /> Pendientes de configurar
          </h2>
          <p className="mt-1 text-caption text-ink-mute">
            Mapeos de baja confianza y claves faltantes que Calidad debe confirmar. El panel completo llega con la
            pantalla de modelos y exámenes.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-body-md">
            {porConfirmar.map((m) => (
              <li key={m.id}>
                <Link href="/examenes" className="text-primary hover:underline">
                  {m.nombre}
                </Link>
                {m.notaMapeo && <span className="text-ink-mute"> — {m.notaMapeo}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
