import { redirect } from "next/navigation";
import { PantallaMarca } from "@/components/marca";
import { requireSesion } from "@/lib/auth/session";
import { SalirForm } from "./salir-form";

export default async function SalirKiosco() {
  const s = await requireSesion({ permitirKiosco: true });
  if (!s.kioscoIntentoId) redirect("/");
  return (
    <PantallaMarca
      titulo="Salir del modo examen"
      subtitulo={`Solo ${s.actor.nombre} puede salir: escribe tu contraseña.`}
    >
      <SalirForm volverA={`/kiosco/${s.kioscoIntentoId}`} />
    </PantallaMarca>
  );
}
