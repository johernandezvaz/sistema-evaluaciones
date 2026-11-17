import { requireSesion } from "@/lib/auth/session";
import { Proximamente } from "@/components/ui";

export default async function Pagina() {
  await requireSesion();
  return (
    <Proximamente
      titulo="Reportes"
      descripcion="Exportación a Excel e impresión de resultados, matriz y códigos de asignación."
      fase="Reportes"
    />
  );
}
