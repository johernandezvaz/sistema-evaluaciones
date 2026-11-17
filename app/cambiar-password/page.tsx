import type { Metadata } from "next";
import Link from "next/link";
import { PantallaMarca } from "@/components/marca";
import { requireSesion } from "@/lib/auth/session";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Cambiar contraseña · Evaluaciones ILUO" };

export default async function CambiarPasswordPage() {
  const s = await requireSesion({ permitirCambioPassword: true });
  return (
    <PantallaMarca
      titulo="Cambiar contraseña"
      subtitulo={
        s.debeCambiarPassword
          ? "Tu contraseña es temporal. Elige una nueva para continuar."
          : `Sesión de ${s.actor.nombre}. Las demás sesiones abiertas se cerrarán.`
      }
    >
      <PasswordForm />
      {!s.debeCambiarPassword && (
        <Link href="/" className="mt-4 block text-center text-caption text-primary hover:underline">
          Volver
        </Link>
      )}
    </PantallaMarca>
  );
}
