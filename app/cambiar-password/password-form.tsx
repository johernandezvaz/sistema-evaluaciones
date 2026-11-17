"use client";

import { useActionState } from "react";
import { cambiarPasswordAction, type EstadoPassword } from "./actions";

const CAMPOS = [
  { name: "actual", label: "Contraseña actual", auto: "current-password" },
  { name: "nueva", label: "Nueva contraseña (mínimo 8 caracteres)", auto: "new-password" },
  { name: "confirmar", label: "Confirma la nueva contraseña", auto: "new-password" },
] as const;

export function PasswordForm() {
  const [estado, accion, enviando] = useActionState<EstadoPassword, FormData>(cambiarPasswordAction, {});
  return (
    <form action={accion} className="space-y-4">
      {CAMPOS.map((c) => (
        <div key={c.name}>
          <label htmlFor={c.name} className="label">
            {c.label}
          </label>
          <input
            id={c.name}
            name={c.name}
            type="password"
            autoComplete={c.auto}
            required
            minLength={c.name === "actual" ? 1 : 8}
            className="input"
          />
        </div>
      ))}
      {estado.error && (
        <p role="alert" className="rounded-md bg-status-fail-soft px-3 py-2 text-caption text-status-fail">
          {estado.error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={enviando}>
        {enviando ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
