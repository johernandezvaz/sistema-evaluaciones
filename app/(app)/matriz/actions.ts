"use server";

import { revalidatePath } from "next/cache";
import { requireSesion } from "@/lib/auth/session";
import { ejecutar } from "@/lib/errores-ui";
import { confirmarO } from "@/lib/services/iluo";

export type EstadoConfirmar = { error?: string; ok?: boolean };

export async function confirmarOAction(
  personaId: string,
  modeloId: string,
  _prev: EstadoConfirmar,
  _form: FormData,
): Promise<EstadoConfirmar> {
  const s = await requireSesion();
  const r = await ejecutar("confirmarO", () => confirmarO(s.actor, personaId, modeloId));
  if (!r.ok) return { error: r.message };
  revalidatePath("/matriz");
  revalidatePath(`/empleados/${personaId}`);
  return { ok: true };
}
