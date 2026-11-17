"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { abrirAsignacion } from "@/lib/services/asignaciones";
import { entrarModoKiosco, salirModoKiosco } from "@/lib/services/auth";
import { errorParaUsuario } from "@/lib/errores-ui";
import { NotFoundError } from "@/lib/errors";
import { escribirCookieSesion, requireSesion } from "@/lib/auth/session";

export type EstadoKiosco = { error?: string };

export async function abrirAquiAction(
  asignacionId: string,
  _prev: EstadoKiosco,
  _form: FormData,
): Promise<EstadoKiosco> {
  const s = await requireSesion();
  let intentoId: string;
  try {
    const a = await db().asignacion.findUnique({ where: { id: asignacionId }, include: { persona: true } });
    if (!a) throw new NotFoundError("La asignación");
    const r = await abrirAsignacion(
      { tipo: "SESION", sesionId: s.sesionId, actor: s.actor },
      a.persona.numeroEmpleado,
      a.codigo,
    );
    await entrarModoKiosco(s.actor, s.sesionId, r.intentoId);
    await escribirCookieSesion(s.sesionId, s.expiraEn, r.intentoId);
    intentoId = r.intentoId;
  } catch (e) {
    return { error: errorParaUsuario(e, "abrirAqui").message };
  }
  redirect(`/kiosco/${intentoId}`);
}

export async function salirKioscoAction(_prev: EstadoKiosco, form: FormData): Promise<EstadoKiosco> {
  const s = await requireSesion({ permitirKiosco: true });
  try {
    await salirModoKiosco(s.sesionId, String(form.get("password") ?? ""));
    await escribirCookieSesion(s.sesionId, s.expiraEn, null);
  } catch (e) {
    return { error: errorParaUsuario(e, "salirKiosco").message };
  }
  redirect("/asignaciones");
}
