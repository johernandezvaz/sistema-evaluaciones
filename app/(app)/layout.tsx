import { cookies } from "next/headers";
import { Shell } from "@/components/shell/shell";
import { requireSesion } from "@/lib/auth/session";
import { esSoloLectura } from "@/lib/auth/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSesion();
  const colapsada = (await cookies()).get("sidebar")?.value === "colapsada";
  return (
    <Shell
      usuario={{ nombre: s.actor.nombre, email: s.email, rol: s.actor.rol }}
      soloLectura={esSoloLectura(s.actor.rol)}
      colapsadaInicial={colapsada}
    >
      {children}
    </Shell>
  );
}
