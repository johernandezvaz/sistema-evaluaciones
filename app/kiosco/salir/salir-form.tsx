"use client";

import Link from "next/link";
import { useActionState } from "react";
import { salirKioscoAction, type EstadoKiosco } from "../actions";

export function SalirForm({ volverA }: { volverA: string }) {
  const [estado, accion, enviando] = useActionState<EstadoKiosco, FormData>(salirKioscoAction, {});
  return (
    <form action={accion} className="space-y-4">
      <div>
        <label htmlFor="password" className="label">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input min-h-12"
          autoFocus
        />
      </div>
      {estado.error && (
        <p role="alert" className="rounded-md bg-status-fail-soft px-3 py-2 text-caption text-status-fail">
          {estado.error}
        </p>
      )}
      <button type="submit" className="btn-primary min-h-12 w-full" disabled={enviando}>
        {enviando ? "Verificando…" : "Salir"}
      </button>
      <Link href={volverA} className="btn-secondary min-h-12 w-full">
        Volver al examen
      </Link>
    </form>
  );
}
