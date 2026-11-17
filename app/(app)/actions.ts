"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { cerrarSesion } from "@/lib/services/auth";
import { borrarCookieSesion, getSesion } from "@/lib/auth/session";

export async function logoutAction() {
  const s = await getSesion();
  if (s) await cerrarSesion(s.sesionId);
  await borrarCookieSesion();
  redirect("/login");
}

export async function guardarSidebarAction(colapsada: boolean) {
  (await cookies()).set("sidebar", colapsada ? "colapsada" : "abierta", {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}
