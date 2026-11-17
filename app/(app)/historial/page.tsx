import { requireSesion } from "@/lib/auth/session";
import { Proximamente } from "@/components/ui";

export default async function Pagina() {
  await requireSesion();
  return (
    <Proximamente
      titulo="Historial de cambios"
      descripcion="Bitácora de solo lectura (AuditLog): quién cambió qué y cuándo."
      fase="Historial de cambios"
    />
  );
}
