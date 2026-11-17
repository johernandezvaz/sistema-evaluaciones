import { Pill } from "./ui";

export type Tono = "ok" | "fail" | "warn" | "neutral" | "info";

export const ESTADO_INTENTO: Record<string, { texto: string; tono: Tono }> = {
  EN_CURSO: { texto: "En curso", tono: "info" },
  PENDIENTE_CALIFICAR: { texto: "Pendiente de calificar", tono: "warn" },
  FINALIZADO: { texto: "Finalizado", tono: "ok" },
  ANULADO: { texto: "Anulado", tono: "neutral" },
};

export const RESULTADO: Record<string, { texto: string; tono: "ok" | "fail" | "warn" }> = {
  KAPPA_90: { texto: "Kappa 90", tono: "ok" },
  KAPPA_80: { texto: "Kappa 80", tono: "warn" },
  REPROBADO: { texto: "Reprobado", tono: "fail" },
};

export const MODO_INTENTO: Record<string, string> = {
  KIOSCO: "Abrir aquí",
  DISPOSITIVO: "Tablet compartida",
  CAPTURA_PAPEL: "Captura en papel",
  IMPORTADO: "Importado",
};

export const pct1 = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : `${(x * 100).toFixed(1)}%`;

export function PillEstado({ estado }: { estado: string }) {
  const e = ESTADO_INTENTO[estado] ?? { texto: estado, tono: "neutral" as const };
  return <Pill tono={e.tono}>{e.texto}</Pill>;
}

export function PillResultado({ resultado }: { resultado: string | null }) {
  if (!resultado) return null;
  const r = RESULTADO[resultado];
  return r ? <Pill tono={r.tono}>{r.texto}</Pill> : <Pill>{resultado}</Pill>;
}

export const CLASES_LETRA: Record<string, string> = {
  I: "bg-status-neutral-soft text-status-neutral border-transparent",
  L: "bg-status-neutral-soft text-status-neutral border-primary",
  U: "bg-status-warn-soft text-status-warn border-transparent",
  O: "bg-status-ok-soft text-status-ok border-transparent",
};

export const NOMBRE_LETRA: Record<string, string> = {
  I: "No habilitado",
  L: "En capacitación",
  U: "Habilitado (Kappa 80 o candidato a O)",
  O: "Certificado",
};

export function LetraILUO({ letra, className = "" }: { letra: string; className?: string }) {
  return (
    <span
      className={`inline-flex size-7 items-center justify-center rounded-full border text-micro ${CLASES_LETRA[letra] ?? ""} ${className}`}
      title={NOMBRE_LETRA[letra]}
    >
      {letra}
    </span>
  );
}
