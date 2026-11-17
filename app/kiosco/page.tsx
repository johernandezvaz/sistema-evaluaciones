import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth/session";
import { Logo } from "@/components/marca";

export default async function KioscoInicio() {
  const s = await getSesion();
  if (s?.kioscoIntentoId) redirect(`/kiosco/${s.kioscoIntentoId}`);
  if (s) redirect("/asignaciones");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-navy px-4 text-center text-on-dark">
      <Logo ancho={200} className="h-auto w-48" />
      <h1 className="text-display-lg">Examen en tablet</h1>
      <p className="max-w-md text-body-lg text-on-dark/80">
        Aquí el empleado ingresará su número y el código de su asignación. Esta pantalla se construye en la fase del
        kiosco.
      </p>
    </main>
  );
}
