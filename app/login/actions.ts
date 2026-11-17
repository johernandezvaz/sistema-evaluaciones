"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { iniciarSesion } from "@/lib/services/auth";
import { errorParaUsuario } from "@/lib/errores-ui";
import { escribirCookieSesion } from "@/lib/auth/session";

export type EstadoLogin = { error?: string; email?: string };

const destinoSeguro = (n: FormDataEntryValue | null) =>
  typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";

export async function loginAction(_prev: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get("email") ?? "");
  let destino: string;
  try {
    const r = await iniciarSesion(email, String(form.get("password") ?? ""), {
      userAgent: (await headers()).get("user-agent"),
    });
    await escribirCookieSesion(r.sesionId, r.expiraEn);
    destino = r.debeCambiarPassword ? "/cambiar-password" : destinoSeguro(form.get("next"));
  } catch (e) {
    return { error: errorParaUsuario(e, "login").message, email };
  }
  redirect(destino);
}
