import { requireSesion } from "@/lib/auth/session";
import { Proximamente } from "@/components/ui";

export default async function Pagina() {
  await requireSesion();
  return (
    <Proximamente
      titulo="Modelos y exámenes"
      descripcion="Modelos, variantes y versiones: editor de borradores, clave G/B, diagrama con flechas, línea de tiempo y comparador de versiones."
      fase="Exámenes y versiones"
    />
  );
}
