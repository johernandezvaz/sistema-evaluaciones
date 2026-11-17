"use server";

import { revalidatePath } from "next/cache";
import { requireSesion } from "@/lib/auth/session";
import { ejecutar } from "@/lib/errores-ui";
import { calificarRespuestaAbierta, capturarTeoriaManual } from "@/lib/services/intentos";

export type EstadoCalificar = { error?: string; ok?: boolean };

function numero(form: FormData, campo: string): number {
  const raw = String(form.get(campo) ?? "")
    .trim()
    .replace(",", ".");
  return raw === "" ? NaN : Number(raw);
}

export async function capturarTeoriaAction(
  intentoId: string,
  _prev: EstadoCalificar,
  form: FormData,
): Promise<EstadoCalificar> {
  const s = await requireSesion();
  const puntos = numero(form, "teoria");
  if (Number.isNaN(puntos)) return { error: "Escribe la calificación de teoría" };
  const r = await ejecutar("capturarTeoria", () => capturarTeoriaManual(s.actor, intentoId, puntos));
  if (!r.ok) return { error: r.message };
  revalidatePath("/calificar");
  revalidatePath(`/calificar/${intentoId}`);
  return { ok: true };
}

export async function calificarAbiertaAction(
  intentoId: string,
  respuestaId: string,
  _prev: EstadoCalificar,
  form: FormData,
): Promise<EstadoCalificar> {
  const s = await requireSesion();
  const puntos = numero(form, "puntos");
  if (Number.isNaN(puntos)) return { error: "Escribe los puntos" };
  const r = await ejecutar("calificarAbierta", () => calificarRespuestaAbierta(s.actor, respuestaId, puntos));
  if (!r.ok) return { error: r.message };
  revalidatePath("/calificar");
  revalidatePath(`/calificar/${intentoId}`);
  return { ok: true };
}
