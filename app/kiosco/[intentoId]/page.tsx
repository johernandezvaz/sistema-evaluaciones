import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { requireSesion } from "@/lib/auth/session";
import { examenParaKiosco } from "@/lib/services/asignaciones";
import { AppError } from "@/lib/errors";
import { formatFechaHora } from "@/lib/time";

export default async function ExamenKiosco({ params }: { params: Promise<{ intentoId: string }> }) {
  const { intentoId } = await params;
  const s = await requireSesion({ permitirKiosco: true });
  if (s.kioscoIntentoId !== intentoId) redirect(s.kioscoIntentoId ? `/kiosco/${s.kioscoIntentoId}` : "/asignaciones");

  let dto;
  try {
    dto = await examenParaKiosco(intentoId);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    const msg = e instanceof AppError ? e.message : "No se pudo cargar el examen";
    return (
      <EncabezadoKiosco titulo="Examen no disponible">
        <p className="card text-body-lg">{msg}</p>
      </EncabezadoKiosco>
    );
  }

  return (
    <EncabezadoKiosco
      titulo={`${dto.examen} · v${dto.version}`}
      subtitulo={`${dto.persona.nombre} · No. ${dto.persona.numeroEmpleado}`}
    >
      {dto.terminaEn && (
        <p className="text-caption text-ink-mute">Tiempo límite: {formatFechaHora(new Date(dto.terminaEn))}</p>
      )}
      <section className="card">
        <h2 className="text-heading-lg">Piezas ({dto.piezas.length})</h2>
        <p className="mt-1 text-caption text-ink-mute">La captura de respuestas se construye en la fase del kiosco.</p>
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-2">
          {dto.piezas.map((p) => {
            const r = dto.contestadas.piezas.find((x) => x.numero === p.numero);
            return (
              <div
                key={p.numero}
                className="flex h-12 flex-col items-center justify-center rounded-xs border border-hairline bg-canvas tabular"
              >
                <span className="text-micro text-ink-mute">{p.numero}</span>
                <span className="text-caption">{r ? (r.respuesta === "G" ? "Buena" : "Mala") : "—"}</span>
              </div>
            );
          })}
        </div>
      </section>
    </EncabezadoKiosco>
  );
}

function EncabezadoKiosco({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 bg-navy px-6 py-4 text-on-dark">
        <div>
          <h1 className="text-heading-lg">{titulo}</h1>
          {subtitulo && <p className="text-caption text-on-dark/80">{subtitulo}</p>}
        </div>
        <Link href="/kiosco/salir" className="btn-on-dark min-h-12 border border-on-dark/30">
          <LockKeyhole size={16} aria-hidden /> Salir del modo examen
        </Link>
      </header>
      <main className="mx-auto max-w-app space-y-6 p-4 md:p-8">{children}</main>
    </>
  );
}
