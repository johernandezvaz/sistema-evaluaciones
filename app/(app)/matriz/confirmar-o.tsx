"use client";

import { useActionState } from "react";
import { confirmarOAction, type EstadoConfirmar } from "./actions";

export function ConfirmarOBoton({ personaId, modeloId }: { personaId: string; modeloId: string }) {
  const [estado, accion, enviando] = useActionState<EstadoConfirmar, FormData>(
    confirmarOAction.bind(null, personaId, modeloId),
    {},
  );
  return (
    <form action={accion} className="inline-flex flex-col items-end gap-1">
      <button
        type="submit"
        className="btn-primary"
        disabled={enviando || estado.ok}
        title="Registra la O como cambio manual con el motivo «Cumplió antigüedad para O»."
      >
        {enviando ? "Confirmando…" : estado.ok ? "Confirmado" : "Confirmar O"}
      </button>
      {estado.error && (
        <span role="alert" className="text-caption text-status-fail">
          {estado.error}
        </span>
      )}
    </form>
  );
}
