"use server";

import { redirect } from "next/navigation";
import { cambiarPassword } from "@/lib/services/auth";
import { errorParaUsuario } from "@/lib/errores-ui";
import { requireSesion } from "@/lib/auth/session";

export type EstadoPassword = { error?: string };

export async function cambiarPasswordAction(_prev: EstadoPassword, form: FormData): Promise<EstadoPassword> {
  const s = await requireSesion({ permitirCambioPassword: true });
  const nueva = String(form.get("nueva") ?? "");
  if (nueva !== String(form.get("confirmar") ?? "")) return { error: "La confirmación no coincide" };
  try {
    await cambiarPassword(s.actor, String(form.get("actual") ?? ""), nueva, s.sesionId);
  } catch (e) {
    return { error: errorParaUsuario(e, "cambiarPassword").message };
  }
  redirect("/");
}
