import type { LetraILUO, Resultado } from "./domain";
import { nivelPorResultado } from "./scoring";
import { addMonths } from "./time";

export type CriterioNivel = "ULTIMO" | "MEJOR";

export type IntentoParaNivel = {
  id: string;
  fechaAplicacion: Date;
  creadoEn: Date;
  calificacion: number;
  resultado: Resultado;
};

export type CambioManual = { letra: LetraILUO; fecha: Date };

export type NivelCalculado = {
  letra: LetraILUO;
  origen: "INTENTO" | "MANUAL";
  intentoId: string | null;
  fecha: Date;
  candidatoO: boolean;
  fechaEstimadaO: Date | null;
};

const RANGO: Record<LetraILUO, number> = { I: 0, L: 1, U: 2, O: 3 };

const t = (d: Date) => d.getTime();

function masReciente(a: IntentoParaNivel, b: IntentoParaNivel): number {
  return (
    t(b.fechaAplicacion) - t(a.fechaAplicacion) ||
    t(b.creadoEn) - t(a.creadoEn) ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}

export function elegirIntento(intentos: IntentoParaNivel[], criterio: CriterioNivel): IntentoParaNivel | null {
  if (intentos.length === 0) return null;
  const orden =
    criterio === "ULTIMO"
      ? masReciente
      : (a: IntentoParaNivel, b: IntentoParaNivel) => b.calificacion - a.calificacion || masReciente(a, b);
  return [...intentos].sort(orden)[0]!;
}

const desdeManual = (m: CambioManual): NivelCalculado => ({
  letra: m.letra,
  origen: "MANUAL",
  intentoId: null,
  fecha: m.fecha,
  candidatoO: false,
  fechaEstimadaO: null,
});

export function calcularNivel(input: {
  intentos: IntentoParaNivel[];
  manuales: CambioManual[];
  criterio: CriterioNivel;
  fechaIngresoPuesto: Date | null;
  mesesParaO: number;
}): NivelCalculado | null {
  const manuales = [...input.manuales].sort((a, b) => t(b.fecha) - t(a.fecha));
  const ultimoManual = manuales[0] ?? null;
  const baseIL = manuales.find((m) => m.letra === "I" || m.letra === "L") ?? null;

  const candidatos = ultimoManual
    ? input.intentos.filter((i) => t(i.fechaAplicacion) > t(ultimoManual.fecha))
    : input.intentos;
  const elegido = elegirIntento(candidatos, input.criterio);
  if (!elegido) return ultimoManual ? desdeManual(ultimoManual) : null;

  const n = nivelPorResultado({
    resultado: elegido.resultado,
    fechaIngresoPuesto: input.fechaIngresoPuesto,
    fecha: elegido.fechaAplicacion,
    mesesParaO: input.mesesParaO,
  });

  if (n.letra === null) {

    if (input.criterio === "MEJOR") return ultimoManual ? desdeManual(ultimoManual) : null;
    return baseIL ? desdeManual(baseIL) : null; 
  }
  if (input.criterio === "MEJOR" && ultimoManual && RANGO[n.letra] < RANGO[ultimoManual.letra]) {
    return desdeManual(ultimoManual);
  }
  return {
    letra: n.letra,
    origen: "INTENTO",
    intentoId: elegido.id,
    fecha: elegido.fechaAplicacion,
    candidatoO: n.candidatoO,
    fechaEstimadaO: n.fechaEstimadaO,
  };
}

export function estadoCandidatoO(input: {
  candidatoO: boolean;
  fechaEstimadaO: Date | null;
  fechaIngresoPuesto: Date | null;
  mesesParaO: number;
  ahora: Date;
}): { listoParaO: boolean; faltaFechaIngreso: boolean; fechaEstimadaO: Date | null } {
  if (!input.candidatoO) return { listoParaO: false, faltaFechaIngreso: false, fechaEstimadaO: null };
  const fecha = input.fechaIngresoPuesto ? addMonths(input.fechaIngresoPuesto, input.mesesParaO) : input.fechaEstimadaO;
  return {
    listoParaO: !!fecha && t(input.ahora) >= t(fecha),
    faltaFechaIngreso: !input.fechaIngresoPuesto,
    fechaEstimadaO: fecha,
  };
}

export const MOTIVO_ANTIGUEDAD_O = "Cumplió antigüedad para O";
