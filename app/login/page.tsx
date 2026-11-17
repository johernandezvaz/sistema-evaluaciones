import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PantallaMarca } from "@/components/marca";
import { getSesion } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión · Evaluaciones ILUO" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSesion()) redirect("/");
  const { next } = await searchParams;
  return (
    <PantallaMarca titulo="Iniciar sesión" subtitulo="Usa el correo y la contraseña que te dio el administrador.">
      <LoginForm next={next} />
    </PantallaMarca>
  );
}
