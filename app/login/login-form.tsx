"use client";

import { useActionState } from "react";
import { loginAction, type EstadoLogin } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(loginAction, {});
  return (
    <form action={accion} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label htmlFor="email" className="label">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={estado.email}
          className="input"
          autoFocus
        />
      </div>
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
          className="input"
        />
      </div>
      {estado.error && (
        <p role="alert" className="rounded-md bg-status-fail-soft px-3 py-2 text-caption text-status-fail">
          {estado.error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
