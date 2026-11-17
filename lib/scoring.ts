import type { LetraILUO, Resultado, RespuestaGB } from "./domain";
import { addMonths } from "./time";

export type Reglas = {
  pesoFisico: number;
  pesoTeorico: number;
  teoriaMax: number;
  umbral80: number;
  umbral90: number;
};

export const redondear4 = (x: number) => Math.round(x * 10_000) / 10_000;

export type PiezaEsperada = { numero: number; esperado: RespuestaGB };
export type PiezaRespondida = { numero: number; respuesta: RespuestaGB };

export function calificarFisico(clave: PiezaEsperada[], respuestas: PiezaRespondida[]) {
  if (clave.length === 0) throw new Error("La versión no tiene piezas");
  const porNumero = new Map(respuestas.map((r) => [r.numero, r.respuesta]));
  let aciertos = 0;
  const detalle = clave.map((k) => {
    const respuesta = porNumero.get(k.numero) ?? null;
    const correcta = respuesta === k.esperado;
    if (correcta) aciertos++;
    return { numero: k.numero, esperado: k.esperado, respuesta, correcta };
  });
  const totalPiezas = clave.length;
  return {
    totalPiezas,
    aciertos,
    errores: totalPiezas - aciertos,
    sinResponder: detalle.filter((d) => d.respuesta === null).length,
    pctFisico: redondear4(aciertos / totalPiezas),
    detalle,
  };
}

export const sinContestar = (totalPiezas: number, respondidas: number) => Math.max(0, totalPiezas - respondidas);

export function textoFisico(aciertos: number, totalPiezas: number, sinResponder: number): string {
  const base = `${aciertos}/${totalPiezas}`;
  return sinResponder > 0 ? `${base} · ${sinResponder} sin contestar` : base;
}

export function pctTeorico(teoriaPuntos: number, teoriaMax: number): number {
  if (teoriaMax <= 0) throw new Error("teoriaMax debe ser > 0");
  if (teoriaPuntos < 0 || teoriaPuntos > teoriaMax) throw new Error(`La teoría debe estar entre 0 y ${teoriaMax}`);
  return redondear4(teoriaPuntos / teoriaMax);
}

export function resultadoDe(final: number, reglas: Pick<Reglas, "umbral80" | "umbral90">): Resultado {
  const f = redondear4(final);
  if (f >= reglas.umbral90) return "KAPPA_90";
  if (f >= reglas.umbral80) return "KAPPA_80";
  return "REPROBADO";
}

export function calificacionFinal(input: {
  aciertos: number;
  totalPiezas: number;
  teoriaPuntos: number;
  reglas: Reglas;
}) {
  const { aciertos, totalPiezas, teoriaPuntos, reglas } = input;
  if (totalPiezas <= 0) throw new Error("totalPiezas debe ser > 0");
  if (aciertos < 0 || aciertos > totalPiezas) throw new Error("aciertos fuera de rango");
  if (Math.abs(reglas.pesoFisico + reglas.pesoTeorico - 1) > 1e-9) throw new Error("Los pesos deben sumar 1");
  const pf = redondear4(aciertos / totalPiezas);
  const pt = pctTeorico(teoriaPuntos, reglas.teoriaMax);
  const final = redondear4(
    reglas.pesoFisico * (aciertos / totalPiezas) + reglas.pesoTeorico * (teoriaPuntos / reglas.teoriaMax),
  );
  return { pctFisico: pf, pctTeorico: pt, final, resultado: resultadoDe(final, reglas) };
}

export function nivelPorResultado(input: {
  resultado: Resultado;
  fechaIngresoPuesto: Date | null;
  fecha: Date;
  mesesParaO: number;
}): { letra: LetraILUO | null; candidatoO: boolean; fechaEstimadaO: Date | null } {
  if (input.resultado === "REPROBADO") return { letra: null, candidatoO: false, fechaEstimadaO: null };
  if (input.resultado === "KAPPA_80") return { letra: "U", candidatoO: false, fechaEstimadaO: null };
  if (!input.fechaIngresoPuesto) return { letra: "U", candidatoO: true, fechaEstimadaO: null };
  const cumple = addMonths(input.fechaIngresoPuesto, input.mesesParaO);
  return cumple.getTime() <= input.fecha.getTime()
    ? { letra: "O", candidatoO: false, fechaEstimadaO: null }
    : { letra: "U", candidatoO: true, fechaEstimadaO: cumple };
}
