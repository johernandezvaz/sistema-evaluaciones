"use client";

import { useActionState } from "react";
import { calificarAbiertaAction, capturarTeoriaAction, type EstadoCalificar } from "../actions";

function MensajeError({ estado }: { estado: EstadoCalificar }) {
  if (!estado.error) return null;
  return (
    <p role="alert" className="rounded-md bg-status-fail-soft px-3 py-2 text-caption text-status-fail">
      {estado.error}
    </p>
  );
}

export function TeoriaManualForm({ intentoId, teoriaMax }: { intentoId: string; teoriaMax: number }) {
  const [estado, accion, enviando] = useActionState<EstadoCalificar, FormData>(
    capturarTeoriaAction.bind(null, intentoId),
    {},
  );
  return (
    <form action={accion} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="teoria" className="label">
            Calificación de teoría (0 a {teoriaMax})
          </label>
          <input
            id="teoria"
            name="teoria"
            inputMode="decimal"
            required
            autoFocus
            autoComplete="off"
            className="input w-32 text-right tabular"
          />
        </div>
        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar y calificar"}
        </button>
      </div>
      <MensajeError estado={estado} />
    </form>
  );
}

export function PuntosAbiertaForm({
  intentoId,
  respuestaId,
  puntaje,
}: {
  intentoId: string;
  respuestaId: string;
  puntaje: number;
}) {
  const [estado, accion, enviando] = useActionState<EstadoCalificar, FormData>(
    calificarAbiertaAction.bind(null, intentoId, respuestaId),
    {},
  );
  const id = `puntos-${respuestaId}`;
  return (
    <form action={accion} className="mt-3 space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={id} className="label">
            Puntos (0 a {puntaje})
          </label>
          <input id={id} name="puntos" inputMode="decimal" required className="input w-28 text-right tabular" />
        </div>
        <button type="submit" className="btn-secondary" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </button>
      </div>
      <MensajeError estado={estado} />
    </form>
  );
}
