import type { LucideIcon } from "lucide-react";

export function Encabezado({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] leading-tight font-medium tracking-[-0.5px] md:text-display-lg">{titulo}</h1>
        {descripcion && <p className="mt-1 max-w-2xl text-body-md text-ink-mute">{descripcion}</p>}
      </div>
      {acciones}
    </div>
  );
}

export function StatTile({
  etiqueta,
  valor,
  detalle,
  icono: Icono,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  detalle?: string;
  icono?: LucideIcon;
}) {
  return (
    <div className="stat-tile">
      <div className="flex items-center justify-between gap-2 text-caption text-ink-mute">
        {etiqueta}
        {Icono && <Icono size={16} aria-hidden className="text-ink-mute-2" />}
      </div>
      <p className="mt-2 text-display-md tabular">{valor}</p>
      {detalle && <p className="mt-1 text-caption text-ink-mute-2">{detalle}</p>}
    </div>
  );
}

const TONO = {
  ok: "bg-status-ok-soft text-status-ok",
  warn: "bg-status-warn-soft text-status-warn",
  fail: "bg-status-fail-soft text-status-fail",
  neutral: "bg-status-neutral-soft text-status-neutral",
  info: "bg-primary-soft text-primary",
} as const;

export function Pill({
  tono = "neutral",
  children,
  title,
}: {
  tono?: keyof typeof TONO;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span className={`pill ${TONO[tono]}`} title={title}>
      {children}
    </span>
  );
}

export function Tabla({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-canvas">
      <table className="w-full border-collapse text-left text-body-md">{children}</table>
    </div>
  );
}

export const th = "bg-canvas-soft px-4 py-3 text-micro tracking-wide text-ink-mute uppercase whitespace-nowrap";
export const td = "border-t border-hairline px-4 py-3 align-middle";

export function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-hairline-strong bg-canvas p-8 text-center text-ink-mute">
      {children}
    </p>
  );
}

export function Proximamente({ titulo, descripcion, fase }: { titulo: string; descripcion: string; fase: string }) {
  return (
    <>
      <Encabezado titulo={titulo} descripcion={descripcion} />
      <Vacio>Esta pantalla se construye en la fase: {fase}.</Vacio>
    </>
  );
}
