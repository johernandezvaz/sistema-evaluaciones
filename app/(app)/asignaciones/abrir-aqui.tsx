"use client";

import { useActionState } from "react";
import { abrirAquiAction, type EstadoKiosco } from "@/app/kiosco/actions";

export function AbrirAquiBoton({ asignacionId }: { asignacionId: string }) {
  const [estado, accion, enviando] = useActionState<EstadoKiosco, FormData>(
    abrirAquiAction.bind(null, asignacionId),
    {},
  );
  return (
    <form action={accion} className="inline-flex flex-col items-end gap-1">
      <button
        type="submit"
        className="btn-secondary"
        disabled={enviando}
        title="Abre el examen en esta pantalla. Para salir del modo examen se pedirá tu contraseña."
      >
        {enviando ? "Abriendo…" : "Abrir aquí"}
      </button>
      {estado.error && (
        <span role="alert" className="max-w-56 text-right text-caption text-status-fail">
          {estado.error}
        </span>
      )}
    </form>
  );
}
