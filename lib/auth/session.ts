import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESION, firmarSesion, leerSesion, opcionesCookie } from "./token";
import { validarSesion, type SesionValida } from "../services/auth";

export const getSesion = cache(async (): Promise<SesionValida | null> => {
  const claims = await leerSesion((await cookies()).get(COOKIE_SESION)?.value);
  if (!claims) return null;
  return validarSesion(claims.sid);
});

type Opciones = { permitirCambioPassword?: boolean; permitirKiosco?: boolean };

export async function requireSesion(opts: Opciones = {}): Promise<SesionValida> {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (s.kioscoIntentoId && !opts.permitirKiosco) redirect(`/kiosco/${s.kioscoIntentoId}`);
  if (s.debeCambiarPassword && !opts.permitirCambioPassword) redirect("/cambiar-password");
  return s;
}

export async function escribirCookieSesion(sesionId: string, expiraEn: Date, kiosco?: string | null) {
  const token = await firmarSesion({ sid: sesionId, kiosco: kiosco ?? undefined }, expiraEn);
  (await cookies()).set(COOKIE_SESION, token, opcionesCookie(expiraEn));
}

export async function borrarCookieSesion() {
  (await cookies()).delete(COOKIE_SESION);
}
