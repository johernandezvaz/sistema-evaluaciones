import { describe, expect, it } from "vitest";
import { calificacionFinal, calificarFisico, nivelPorResultado, resultadoDe } from "../lib/scoring";
import { CONFIG_DEFAULTS } from "../lib/config";
import { CLAVE_HIGHLAND } from "./helpers";

const reglas = { pesoFisico: 0.9, pesoTeorico: 0.1, teoriaMax: 10, umbral80: 0.8, umbral90: 0.9 };

describe("scoring", () => {
  it("28/30 + teoría 10/10 → 0.94, Kappa 90", () => {
    const r = calificacionFinal({ aciertos: 28, totalPiezas: 30, teoriaPuntos: 10, reglas });
    expect(r.final).toBe(0.94);
    expect(r.pctFisico).toBe(0.9333);
    expect(r.resultado).toBe("KAPPA_90");
  });

  it("umbrales semiabiertos sin huecos", () => {
    expect(resultadoDe(0.7999, reglas)).toBe("REPROBADO");
    expect(resultadoDe(0.8, reglas)).toBe("KAPPA_80");
    expect(resultadoDe(0.8999, reglas)).toBe("KAPPA_80");
    expect(resultadoDe(0.9, reglas)).toBe("KAPPA_90");
    // 27/30 + 10/10 = 0.81 + 0.1 = 0.91 (flotante 0.9100000000000001 → se redondea)
    expect(calificacionFinal({ aciertos: 27, totalPiezas: 30, teoriaPuntos: 10, reglas }).final).toBe(0.91);
  });

  it("los defaults de configuración son los del Excel", () => {
    expect(CONFIG_DEFAULTS).toMatchObject({
      umbralKappa80: 0.8,
      umbralKappa90: 0.9,
      pesoFisicoDefault: 0.9,
      pesoTeoricoDefault: 0.1,
      teoriaMaxDefault: 10,
      mesesParaO: 6,
      minutosMaxExamen: 120,
      horasVigenciaAsignacion: 24,
    });
  });

  it("piezas sin responder cuentan como error", () => {
    const clave = CLAVE_HIGHLAND.map((esperado, i) => ({ numero: i + 1, esperado }));
    const r = calificarFisico(
      clave,
      clave.slice(0, 25).map((k) => ({ numero: k.numero, respuesta: k.esperado })),
    );
    expect(r).toMatchObject({ totalPiezas: 30, aciertos: 25, errores: 5, sinResponder: 5 });
  });

  it("rechaza datos imposibles", () => {
    expect(() => calificacionFinal({ aciertos: 31, totalPiezas: 30, teoriaPuntos: 10, reglas })).toThrow();
    expect(() => calificacionFinal({ aciertos: 20, totalPiezas: 30, teoriaPuntos: 11, reglas })).toThrow();
    expect(() =>
      calificacionFinal({ aciertos: 20, totalPiezas: 30, teoriaPuntos: 5, reglas: { ...reglas, pesoFisico: 0.8 } }),
    ).toThrow(/sumar 1/);
  });

  it("O exige 6 meses en el puesto; si no, U candidato a O", () => {
    const fecha = new Date("2026-06-15T00:00:00Z");
    expect(
      nivelPorResultado({
        resultado: "KAPPA_90",
        fechaIngresoPuesto: new Date("2025-12-15T00:00:00Z"),
        fecha,
        mesesParaO: 6,
      }).letra,
    ).toBe("O");
    const c = nivelPorResultado({
      resultado: "KAPPA_90",
      fechaIngresoPuesto: new Date("2026-01-20T00:00:00Z"),
      fecha,
      mesesParaO: 6,
    });
    expect(c).toMatchObject({ letra: "U", candidatoO: true });
    expect(c.fechaEstimadaO?.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(nivelPorResultado({ resultado: "KAPPA_80", fechaIngresoPuesto: null, fecha, mesesParaO: 6 }).letra).toBe(
      "U",
    );
    expect(
      nivelPorResultado({ resultado: "REPROBADO", fechaIngresoPuesto: null, fecha, mesesParaO: 6 }).letra,
    ).toBeNull();
  });
});
