import { requireSesion } from "@/lib/auth/session";
import { Proximamente } from "@/components/ui";

export default async function Pagina() {
  await requireSesion();
  return (
    <Proximamente
      titulo="Estudio Kappa"
      descripcion="Resultados por pieza y por persona, piezas que más confunden y defectos más mencionados."
      fase="Estudio Kappa"
    />
  );
}
