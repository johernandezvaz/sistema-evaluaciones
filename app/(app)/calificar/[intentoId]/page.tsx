import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Minus, X } from "lucide-react";
import { requireSesion } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { datosParaCalificar, type EvaluacionPregunta } from "@/lib/services/calificacion";
import { formatFecha, formatFechaHora } from "@/lib/time";
import { Encabezado, Pill } from "@/components/ui";
import { ESTADO_INTENTO, LetraILUO, MODO_INTENTO, RESULTADO, pct1 } from "@/components/etiquetas";
import { PuntosAbiertaForm, TeoriaManualForm } from "./formularios";

type Datos = Awaited<ReturnType<typeof datosParaCalificar>>;
type Pregunta = Datos["preguntas"][number];

const EVALUACION: Record<EvaluacionPregunta, { texto: string; tono: "ok" | "fail" | "warn" | "neutral" | "info" }> = {
  CORRECTA: { texto: "Correcta", tono: "ok" },
  INCORRECTA: { texto: "Incorrecta", tono: "fail" },
  MANUAL: { texto: "Calificar a mano", tono: "warn" },
  SIN_CLAVE: { texto: "Sin respuesta correcta registrada", tono: "warn" },
  SIN_CONTESTAR: { texto: "Sin contestar", tono: "neutral" },
  NO_APLICA: { texto: "No aplica", tono: "neutral" },
};

const ESTADO = ESTADO_INTENTO;
const MODO = MODO_INTENTO;
const pct = pct1;

function formatoValor(p: Pregunta, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (Array.isArray(valor)) return valor.map(String).join(" · ");
  if (typeof valor === "object") {
    return Object.entries(valor as Record<string, unknown>)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([k, v]) => `${k} → ${String(v)}`)
      .join(" · ");
  }
  const s = String(valor);
  const opcion = Array.isArray(p.opciones) ? p.opciones.find((o) => o?.clave === s) : undefined;
  return opcion ? `${s}) ${opcion.texto}` : s;
}

function correctaDe(p: Pregunta): string | null {
  if (p.tipo === "ETIQUETAR_DIAGRAMA") {
    if (!p.flechas.length || p.flechas.some((f) => f.zonaCorrecta === null)) return null;
    return p.flechas.map((f) => `${f.numero} → ${f.zonaCorrecta}`).join(" · ");
  }
  if (p.respuestaCorrecta === null || p.respuestaCorrecta === undefined) return null;
  return formatoValor(p, p.respuestaCorrecta);
}

export default async function CalificarIntento({ params }: { params: Promise<{ intentoId: string }> }) {
  const { intentoId } = await params;
  const s = await requireSesion();
  let d: Datos;
  try {
    d = await datosParaCalificar(s.actor, intentoId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { intento, persona, examen, fisico, preguntas, resumenTeoria } = d;
  const est = ESTADO[intento.estado] ?? { texto: intento.estado, tono: "neutral" as const };
  const res = intento.resultado ? RESULTADO[intento.resultado] : null;
  const cerradas = resumenTeoria.correctas + resumenTeoria.incorrectas;
  const abiertasPendientes = preguntas.filter((p) => p.evaluacion === "MANUAL" && p.puntos === null && p.respuestaId);
  const enPapel = intento.modo === "CAPTURA_PAPEL" || intento.modo === "IMPORTADO";
  const pendiente = intento.estado === "PENDIENTE_CALIFICAR";

  return (
    <>
      <Link
        href={pendiente ? "/calificar" : `/empleados/${persona.id}`}
        className="mb-4 inline-flex items-center gap-1 text-caption text-primary hover:underline"
      >
        <ArrowLeft size={14} aria-hidden /> {pendiente ? "Por calificar" : persona.nombre}
      </Link>
      <Encabezado
        titulo={persona.nombre}
        descripcion={`No. ${persona.numeroEmpleado} · ${examen.nombre} · v${examen.version} · Ronda ${intento.ronda}`}
        acciones={<Pill tono={est.tono}>{est.texto}</Pill>}
      />

      <dl className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Dato etiqueta="Aplicado" valor={formatFecha(intento.fechaAplicacion)} />
        <Dato etiqueta="Modo" valor={MODO[intento.modo] ?? intento.modo} />
        <Dato etiqueta="Enviado" valor={intento.enviadoEn ? formatFechaHora(intento.enviadoEn) : "—"} />
        <Dato etiqueta="2ª inspección" valor={intento.segundaInspeccionNombre ?? "—"} />
      </dl>

      {intento.estado === "FINALIZADO" && (
        <section className="card mb-6 flex flex-wrap items-center gap-x-8 gap-y-3" aria-label="Resultado">
          <div>
            <p className="text-caption text-ink-mute">Calificación</p>
            <p className="text-display-md tabular">{pct(intento.calificacion)}</p>
          </div>
          {res && <Pill tono={res.tono}>{res.texto}</Pill>}
          <div>
            <p className="text-caption text-ink-mute">Nivel ILUO en el modelo</p>
            <p className="flex items-center text-heading-lg">
              {d.nivel ? <LetraILUO letra={d.nivel.letra} /> : "Sin nivel"}
              {d.nivel?.candidatoO && <span className="ml-2 text-caption text-ink-mute">Candidato a O</span>}
              {d.nivel && d.nivel.intentoId !== intento.id && (
                <span className="ml-2 text-caption text-ink-mute">
                  (lo define {d.nivel.origen === "MANUAL" ? "un cambio manual" : "otro intento"})
                </span>
              )}
            </p>
          </div>
          {d.desglose && <Desglose d={d.desglose} fisico={fisico} />}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">

        <section className="card" aria-labelledby="t-fisico">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="t-fisico" className="text-heading-lg">
              Parte física
            </h2>
            <p className="text-heading-md tabular">{fisico.texto}</p>
          </div>
          <p className="mt-1 text-caption text-ink-mute">
            G = buena, B = mala. Las piezas sin contestar cuentan como error.
          </p>
          <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
            {fisico.piezas.map((p) => {
              const sin = p.respuesta === null;
              const tono = sin
                ? "border-hairline-strong bg-canvas-soft text-ink-mute"
                : p.correcta
                  ? "border-status-ok/30 bg-status-ok-soft text-status-ok"
                  : "border-status-fail/30 bg-status-fail-soft text-status-fail";
              const Icono = sin ? Minus : p.correcta ? Check : X;
              const estado = sin ? "sin contestar" : p.correcta ? "correcta" : "incorrecta";
              return (
                <li
                  key={p.numero}
                  className={`rounded-sm border px-2 py-1.5 text-center ${tono}`}
                  title={`Pieza ${p.numero}: ${estado}${p.defecto ? ` · ${p.defecto}` : ""}`}
                >
                  <span className="block text-micro text-ink-mute tabular">#{p.numero}</span>
                  <span className="flex items-center justify-center gap-1 font-mono text-button-md">
                    <Icono size={12} aria-hidden />
                    {p.respuesta ?? "—"}
                  </span>
                  {!p.correcta && <span className="block text-micro">clave {p.esperado}</span>}
                  <span className="sr-only">{estado}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card" aria-labelledby="t-teoria">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="t-teoria" className="text-heading-lg">
              Teoría
            </h2>
            {cerradas > 0 && !enPapel && (
              <p className="text-caption text-ink-mute">
                Cerradas: <span className="text-status-ok tabular">{resumenTeoria.correctas} correctas</span> ·{" "}
                <span className="text-status-fail tabular">{resumenTeoria.incorrectas} incorrectas</span>
                {resumenTeoria.porRevisar > 0 && <> · {resumenTeoria.porRevisar} por revisar</>}
              </p>
            )}
          </div>

          {examen.modoTeoria === "MANUAL" && (
            <div className="mt-4 rounded-md border border-hairline bg-canvas-soft p-4">
              {d.puedeCalificar ? (
                <TeoriaManualForm intentoId={intento.id} teoriaMax={examen.teoriaMax} />
              ) : (
                <p className="text-body-md">
                  {enPapel ? "Calificada en papel" : "Teoría capturada"}:{" "}
                  <span className="tabular">
                    {intento.teoriaManual === null ? "pendiente" : `${intento.teoriaManual} de ${examen.teoriaMax}`}
                  </span>
                  {intento.estado === "PENDIENTE_CALIFICAR" && (
                    <span className="block text-caption text-ink-mute">Solo un Admin puede capturarla.</span>
                  )}
                </p>
              )}
            </div>
          )}
          {examen.modoTeoria === "POR_PREGUNTA" && abiertasPendientes.length > 0 && (
            <p className="mt-4 rounded-md bg-status-warn-soft px-3 py-2 text-caption text-status-warn">
              Faltan {abiertasPendientes.length} pregunta(s) abiertas por calificar.
            </p>
          )}

          {preguntas.length > 0 && enPapel ? (
            <>
              <p className="mt-4 text-caption text-ink-mute">
                Preguntas de la versión, solo como referencia: las respuestas quedaron en la hoja física.
              </p>
              <ol className="mt-2 divide-y divide-hairline">
                {preguntas.map((p) => (
                  <li key={p.id} className="py-3">
                    <p className="text-body-md">
                      <span className="mr-2 text-ink-mute tabular">{p.orden}.</span>
                      {p.texto}
                    </p>
                    <p className="mt-1 text-caption text-ink-mute">
                      {p.tipo === "TEXTO_ABIERTO"
                        ? "Pregunta abierta"
                        : `Respuesta correcta: ${correctaDe(p) ?? "no registrada"}`}
                    </p>
                  </li>
                ))}
              </ol>
            </>
          ) : preguntas.length === 0 ? (
            <p className="mt-4 text-caption text-ink-mute">Esta versión no tiene preguntas teóricas en el sistema.</p>
          ) : (
            <ol className="mt-4 divide-y divide-hairline">
              {preguntas.map((p) => {
                const ev = EVALUACION[p.evaluacion];
                const correcta = correctaDe(p);
                return (
                  <li key={p.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-body-md">
                        <span className="mr-2 text-ink-mute tabular">{p.orden}.</span>
                        {p.texto}
                      </p>
                      <Pill tono={ev.tono}>{ev.texto}</Pill>
                    </div>
                    {p.evaluacion !== "NO_APLICA" && (
                      <dl className="mt-2 grid gap-1 text-caption sm:grid-cols-2">
                        <div>
                          <dt className="text-ink-mute">Respuesta del empleado</dt>
                          <dd className="text-body-md">{formatoValor(p, p.valor)}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-mute">Respuesta correcta</dt>
                          <dd className="text-body-md">
                            {p.tipo === "TEXTO_ABIERTO" ? "Pregunta abierta" : (correcta ?? "No registrada")}
                          </dd>
                        </div>
                      </dl>
                    )}
                    {p.puntos !== null && (
                      <p className="mt-1 text-caption text-ink-mute tabular">
                        Puntos: {p.puntos} de {p.puntaje ?? 0}
                      </p>
                    )}
                    {d.puedeCalificar &&
                      examen.modoTeoria === "POR_PREGUNTA" &&
                      p.evaluacion === "MANUAL" &&
                      p.respuestaId &&
                      p.puntos === null && (
                        <PuntosAbiertaForm
                          intentoId={intento.id}
                          respuestaId={p.respuestaId}
                          puntaje={p.puntaje ?? 0}
                        />
                      )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}

function Desglose({ d, fisico }: { d: NonNullable<Datos["desglose"]>; fisico: Datos["fisico"] }) {
  const p1 = (x: number) => `${(x * 100).toFixed(1)}%`;
  const peso = (x: number) => `${Math.round(x * 100)}%`;
  const resultado =
    d.calificacion >= d.umbral90
      ? `Kappa 90 (≥ ${p1(d.umbral90)})`
      : d.calificacion >= d.umbral80
        ? `Kappa 80 (≥ ${p1(d.umbral80)} y < ${p1(d.umbral90)})`
        : `Reprobado (< ${p1(d.umbral80)})`;
  const filas = [
    {
      parte: "Física",
      base: `${fisico.aciertos} de ${fisico.totalPiezas} piezas`,
      pct: d.pctFisico,
      peso: d.pesoFisico,
    },
    {
      parte: "Teoría",
      base: `${d.teoriaPuntos} de ${d.teoriaMax}`,
      pct: d.pctTeorico,
      peso: d.pesoTeorico,
    },
  ];
  return (
    <div className="w-full border-t border-hairline pt-3">
      <p className="text-caption text-ink-mute">Cómo se calculó</p>
      <table className="mt-2 w-full max-w-xl text-left text-body-md tabular">
        <thead className="text-micro text-ink-mute uppercase">
          <tr>
            <th className="py-1 pr-4 font-medium">Parte</th>
            <th className="py-1 pr-4 font-medium">Obtuvo</th>
            <th className="py-1 pr-4 text-right font-medium">%</th>
            <th className="py-1 pr-4 text-right font-medium">Peso</th>
            <th className="py-1 text-right font-medium">Aporta</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.parte} className="border-t border-hairline">
              <td className="py-1 pr-4">{f.parte}</td>
              <td className="py-1 pr-4">{f.base}</td>
              <td className="py-1 pr-4 text-right">{p1(f.pct)}</td>
              <td className="py-1 pr-4 text-right">× {peso(f.peso)}</td>
              <td className="py-1 text-right">{p1(f.pct * f.peso)}</td>
            </tr>
          ))}
          <tr className="border-t border-hairline-strong">
            <td className="py-1 pr-4" colSpan={4}>
              Calificación final
            </td>
            <td className="py-1 text-right">{p1(d.calificacion)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-caption text-ink-mute">Resultado: {resultado}. Reglas vigentes al calificar.</p>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-caption text-ink-mute">{etiqueta}</dt>
      <dd className="text-body-md">{valor}</dd>
    </div>
  );
}
