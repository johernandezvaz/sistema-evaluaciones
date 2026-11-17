import { ZodError } from "zod";
import { AppError } from "./errors";
import { esBloqueoDeIntegridad } from "./db";

export const MENSAJE_INTEGRIDAD = "No se pudo guardar: la operación viola una regla de integridad";
export const MENSAJE_INESPERADO = "Ocurrió un error inesperado. Intenta de nuevo o avisa al administrador.";

export type ErrorUI = { ok: false; code: string; message: string; status: number; data?: Record<string, unknown> };

export function errorParaUsuario(e: unknown, contexto = "accion"): ErrorUI {
  if (e instanceof AppError) return { ok: false, code: e.code, message: e.message, status: e.status, data: e.data };
  if (e instanceof ZodError) {
    const primero = e.issues[0];
    return {
      ok: false,
      code: "DATOS_INVALIDOS",
      message: `Datos inválidos${primero ? `: ${primero.message}` : ""}`,
      status: 400,
    };
  }
  if (esBloqueoDeIntegridad(e)) {
    console.error(`[integridad] ${contexto}:`, e);
    return { ok: false, code: "INTEGRIDAD", message: MENSAJE_INTEGRIDAD, status: 409 };
  }
  console.error(`[error] ${contexto}:`, e);
  return { ok: false, code: "INESPERADO", message: MENSAJE_INESPERADO, status: 500 };
}

export type ResultadoAccion<T> = { ok: true; data: T } | ErrorUI;

export async function ejecutar<T>(contexto: string, fn: () => Promise<T>): Promise<ResultadoAccion<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (esControlDeNext(e)) throw e; 
    return errorParaUsuario(e, contexto);
  }
}

function esControlDeNext(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"));
}
