import Image from "next/image";

export function Logo({ ancho = 160, className }: { ancho?: number; className?: string }) {
  return (
    <Image
      src="/safe-demo_logo-blc-Photoroom.png"
      alt="Safe Demo"
      width={ancho}
      height={Math.round((ancho * 520) / 750)}
      priority
      className={className}
    />
  );
}

export function PantallaMarca({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh md:grid-cols-[minmax(320px,2fr)_3fr]">
      <section className="flex items-center justify-center bg-navy px-6 py-8 md:py-0">
        <div className="text-center text-on-dark">
          <Logo ancho={220} className="mx-auto h-auto w-40 md:w-56" />
          <p className="mt-6 hidden text-heading-md text-on-dark/80 md:block">Evaluaciones y certificación ILUO</p>
        </div>
      </section>
      <section className="flex items-center justify-center bg-canvas-soft px-4 py-10">
        <div className="card w-full max-w-sm">
          <h1 className="text-display-md">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-caption text-ink-mute">{subtitulo}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </section>
    </main>
  );
}
