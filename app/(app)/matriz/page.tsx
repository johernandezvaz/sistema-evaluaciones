import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireSesion } from "@/lib/auth/session";
import { datosMatriz, type Celda } from "@/lib/services/matriz";
import { formatFecha } from "@/lib/time";
import { Encabezado, Vacio } from "@/components/ui";
import { CLASES_LETRA, LetraILUO, NOMBRE_LETRA } from "@/components/etiquetas";
import { ConfirmarOBoton } from "./confirmar-o";

type Filtros = { area?: string; turno?: string; grupo?: string; q?: string };

const etiquetaGrupo = (g: string) => g.replace("_", " ").toLowerCase();

function marca(c: Celda): { corta: string | null; larga: string } {
  const base = `${c.letra} — ${NOMBRE_LETRA[c.letra] ?? ""} · ${formatFecha(c.fecha)} · ${c.origen === "MANUAL" ? "manual" : "por examen"}`;
  if (!c.candidatoO) return { corta: null, larga: base };
  if (c.faltaFechaIngreso)
    return { corta: "s/fecha", larga: `${base} · Candidato a O · Falta fecha de ingreso al puesto` };
  if (c.listoParaO) return { corta: "listo O", larga: `${base} · Listo para O (falta que un Admin lo confirme)` };
  return { corta: "cand. O", larga: `${base} · Candidato a O desde ${formatFecha(c.fechaEstimadaO!)}` };
}

export default async function Matriz({ searchParams }: { searchParams: Promise<Filtros> }) {
  const s = await requireSesion();
  const filtros = await searchParams;
  const d = await datosMatriz(s.actor, filtros);
  const listos = d.avisos.filter((a) => a.tipo === "LISTO_PARA_O");
  const sinFecha = d.avisos.filter((a) => a.tipo === "FALTA_FECHA_INGRESO");

  return (
    <>
      <Encabezado
        titulo="Matriz ILUO"
        descripcion="Nivel actual de cada empleado activo por modelo. I = no habilitado · L = en capacitación · U = habilitado · O = certificado."
      />

      <form className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <Campo id="q" etiqueta="Buscar">
          <input id="q" name="q" defaultValue={filtros.q ?? ""} placeholder="Nombre o número" className="input w-56" />
        </Campo>
        <Selector id="area" etiqueta="Área" valor={filtros.area} opciones={d.opciones.areas} />
        <Selector id="turno" etiqueta="Turno" valor={filtros.turno} opciones={d.opciones.turnos} />
        <Selector
          id="grupo"
          etiqueta="Grupo de modelos"
          valor={filtros.grupo}
          opciones={d.opciones.grupos}
          mostrar={etiquetaGrupo}
        />
        <button type="submit" className="btn-secondary">
          Filtrar
        </button>
      </form>

      {(listos.length > 0 || sinFecha.length > 0) && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {listos.length > 0 && (
            <section className="card" aria-labelledby="t-listos">
              <h2 id="t-listos" className="flex items-center gap-2 text-heading-md">
                <CheckCircle2 size={18} aria-hidden className="text-status-ok" /> Listos para O ({listos.length})
              </h2>
              <p className="mt-1 text-caption text-ink-mute">
                Sacaron Kappa 90 y ya cumplieron la antigüedad en el puesto.{" "}
                {d.puedeConfirmarO ? "Confírmalos para registrar la O." : "Un Admin debe confirmarlos."}
              </p>
              <ul className="mt-3 divide-y divide-hairline">
                {listos.map((a) => (
                  <li key={`${a.personaId}:${a.modeloId}`} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      <Link href={`/empleados/${a.personaId}`} className="text-primary hover:underline">
                        {a.persona}
                      </Link>
                      <span className="block text-caption text-ink-mute">
                        {a.modelo} · cumplió el {formatFecha(a.fechaEstimadaO!)}
                      </span>
                    </span>
                    {d.puedeConfirmarO && <ConfirmarOBoton personaId={a.personaId} modeloId={a.modeloId} />}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {sinFecha.length > 0 && (
            <section className="card" aria-labelledby="t-sinfecha">
              <h2 id="t-sinfecha" className="flex items-center gap-2 text-heading-md">
                <AlertTriangle size={18} aria-hidden className="text-status-warn" /> Falta fecha de ingreso al puesto (
                {sinFecha.length})
              </h2>
              <p className="mt-1 text-caption text-ink-mute">
                Candidatos a O sin fecha de ingreso: no se puede saber cuándo cumplen la antigüedad.
              </p>
              <ul className="mt-3 divide-y divide-hairline">
                {sinFecha.map((a) => (
                  <li key={`${a.personaId}:${a.modeloId}`} className="py-2">
                    <Link href={`/empleados/${a.personaId}`} className="text-primary hover:underline">
                      {a.persona}
                    </Link>
                    <span className="block text-caption text-ink-mute">{a.modelo}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {d.personas.length === 0 || d.modelos.length === 0 ? (
        <Vacio>No hay empleados o modelos con esos filtros.</Vacio>
      ) : (
        <div className="max-h-[70dvh] overflow-auto rounded-lg border border-hairline bg-canvas">
          <table className="border-separate border-spacing-0 text-left text-body-md">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 left-0 z-30 min-w-56 border-r border-b border-hairline bg-canvas-soft px-3 py-2 align-bottom text-micro text-ink-mute uppercase"
                >
                  Empleado
                </th>
                {d.modelos.map((m) => (
                  <th
                    key={m.id}
                    scope="col"
                    title={`${m.nombre} · ${etiquetaGrupo(m.grupo)}`}
                    className="sticky top-0 z-20 h-44 w-12 min-w-12 border-b border-l border-hairline bg-canvas-soft px-1 pb-2 align-bottom"
                  >
                    <span className="mx-auto block max-h-40 rotate-180 overflow-hidden text-micro text-ellipsis whitespace-nowrap text-ink-mute uppercase [writing-mode:vertical-rl]">
                      {m.nombre}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.personas.map((p) => (
                <tr key={p.id} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-b border-hairline bg-canvas px-3 py-1.5 text-left font-normal group-hover:bg-primary-soft"
                  >
                    <Link href={`/empleados/${p.id}`} className="block truncate text-primary hover:underline">
                      {p.nombre}
                    </Link>
                    <span className="block text-caption text-ink-mute">
                      {p.numeroEmpleado} · {p.area.nombre} · {p.turno.nombre}
                    </span>
                  </th>
                  {d.modelos.map((m) => {
                    const c = d.celdas.get(`${p.id}:${m.id}`);
                    if (!c)
                      return (
                        <td
                          key={m.id}
                          className="border-b border-l border-hairline text-center text-ink-mute-2 group-hover:bg-primary-soft"
                        >
                          <span aria-label={`${m.nombre}: sin nivel`}>·</span>
                        </td>
                      );
                    const { corta, larga } = marca(c);
                    return (
                      <td
                        key={m.id}
                        title={`${m.nombre}: ${larga}`}
                        className="border-b border-l border-hairline px-1 py-1 text-center group-hover:bg-primary-soft"
                      >
                        <span className="sr-only">
                          {m.nombre}: {larga}
                        </span>
                        <span aria-hidden className="flex flex-col items-center">
                          <LetraILUO letra={c.letra} />
                          {corta && (
                            <span
                              className={`mt-0.5 text-[10px] leading-none whitespace-nowrap ${
                                c.faltaFechaIngreso
                                  ? "text-status-warn"
                                  : c.listoParaO
                                    ? "text-status-ok"
                                    : "text-ink-mute"
                              }`}
                            >
                              {corta}
                            </span>
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th
                  scope="row"
                  className="sticky bottom-0 left-0 z-20 border-t border-r border-hairline-strong bg-canvas-soft px-3 py-2 text-left text-micro text-ink-mute uppercase"
                >
                  Certificados (O) / habilitados (U)
                </th>
                {d.modelos.map((m) => {
                  const r = d.resumen.get(m.id)!;
                  return (
                    <td
                      key={m.id}
                      className="sticky bottom-0 border-t border-l border-hairline-strong bg-canvas-soft px-1 py-2 text-center text-micro tabular"
                      title={`${m.nombre}: ${r.O} con O, ${r.U} con U, ${r.L} con L, ${r.I} con I`}
                    >
                      <span className="text-status-ok">{r.O}</span>
                      <span className="text-ink-mute-2">/</span>
                      <span className="text-status-warn">{r.U}</span>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-caption text-ink-mute" aria-label="Leyenda">
        {(["I", "L", "U", "O"] as const).map((l) => (
          <li key={l} className="flex items-center gap-2">
            <span
              className={`inline-flex size-6 items-center justify-center rounded-full border text-micro ${CLASES_LETRA[l]}`}
            >
              {l}
            </span>
            {NOMBRE_LETRA[l]}
          </li>
        ))}
        <li>«cand. O» = Kappa 90 sin la antigüedad · «listo O» = ya la cumple · «s/fecha» = falta fecha de ingreso</li>
      </ul>
    </>
  );
}

function Campo({ id, etiqueta, children }: { id: string; etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}

function Selector({
  id,
  etiqueta,
  valor,
  opciones,
  mostrar = (x) => x,
}: {
  id: string;
  etiqueta: string;
  valor?: string;
  opciones: string[];
  mostrar?: (x: string) => string;
}) {
  return (
    <Campo id={id} etiqueta={etiqueta}>
      <select id={id} name={id} defaultValue={valor ?? ""} className="input w-44">
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {mostrar(o)}
          </option>
        ))}
      </select>
    </Campo>
  );
}
