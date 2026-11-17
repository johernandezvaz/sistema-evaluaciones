import { requireSesion } from "@/lib/auth/session";
import { Proximamente } from "@/components/ui";

export default async function Pagina() {
  await requireSesion();
  return (
    <Proximamente
      titulo="Configuración"
      descripcion="Umbrales, pesos, reglas ILUO, vencimientos de asignación y tablets compartidas (Dispositivos)."
      fase="Configuración"
    />
  );
}
