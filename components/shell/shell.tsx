"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Grid3x3,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  QrCode,
  Settings,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Rol } from "@/lib/domain";
import { logoutAction, guardarSidebarAction } from "@/app/(app)/actions";
import { ETIQUETA_ROL, itemActivo, navPara, tituloDeRuta, type IconoNav } from "./navegacion";

const ICONOS: Record<IconoNav, LucideIcon> = {
  inicio: LayoutDashboard,
  empleados: Users,
  examenes: ClipboardList,
  asignaciones: QrCode,
  calificar: ClipboardCheck,
  matriz: Grid3x3,
  kappa: BarChart3,
  reportes: FileText,
  historial: History,
  configuracion: Settings,
  usuarios: UserCog,
};

type Props = {
  usuario: { nombre: string; email: string; rol: Rol };
  soloLectura: boolean;
  colapsadaInicial: boolean;
  children: React.ReactNode;
};

export function Shell({ usuario, soloLectura, colapsadaInicial, children }: Props) {
  const pathname = usePathname();
  const [colapsada, setColapsada] = useState(colapsadaInicial);
  const [drawer, setDrawer] = useState(false);
  const [, startTransition] = useTransition();
  const items = navPara(usuario.rol);

  useEffect(() => setDrawer(false), [pathname]);

  const alternar = () => {
    const v = !colapsada;
    setColapsada(v);
    startTransition(() => guardarSidebarAction(v));
  };

  const nav = (compacta: boolean) => (
    <nav aria-label="Principal" className="flex-1 overflow-y-auto px-2 py-4">
      <ul className="space-y-1">
        {items.map((i) => {
          const Icono = ICONOS[i.icono];
          const activo = itemActivo(pathname, i.href);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                title={compacta ? i.titulo : undefined}
                aria-current={activo ? "page" : undefined}
                className={`relative flex min-h-11 items-center gap-3 rounded-sm px-3 text-button-md transition-colors ${
                  activo ? "bg-navy-soft text-on-dark" : "text-on-dark/75 hover:bg-navy-soft hover:text-on-dark"
                } ${compacta ? "justify-center px-0" : ""}`}
              >
                {activo && <span aria-hidden className="absolute inset-y-1 left-0 w-1 rounded-r-xs bg-primary" />}
                <Icono size={18} aria-hidden className="shrink-0" />
                <span className={compacta ? "sr-only" : "truncate"}>{i.titulo}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const marca = (compacta: boolean) => (
    <div
      className={`flex h-20 shrink-0 items-center border-b border-navy-soft ${compacta ? "justify-center" : "px-5"}`}
    >
      <Link href="/" aria-label="Inicio">
        {compacta ? (
          <Image src="/favicon_io/android-chrome-192x192.png" alt="" width={32} height={32} className="rounded-xs" />
        ) : (
          <Image src="/safe-demo_logo-blc-Photoroom.png" alt="Safe Demo" width={84} height={58} priority />
        )}
      </Link>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col bg-navy text-on-dark transition-[width] md:flex ${
          colapsada ? "w-sidebar-collapsed" : "w-sidebar-collapsed lg:w-sidebar"
        }`}
      >
        <div className="lg:hidden">{marca(true)}</div>
        <div className="hidden lg:block">{marca(colapsada)}</div>
        <div className="flex flex-1 flex-col lg:hidden">{nav(true)}</div>
        <div className="hidden flex-1 flex-col lg:flex">{nav(colapsada)}</div>
        <button
          type="button"
          onClick={alternar}
          className="hidden min-h-11 items-center gap-3 border-t border-navy-soft px-5 text-caption text-on-dark/70 hover:text-on-dark lg:flex"
          aria-label={colapsada ? "Expandir menú" : "Colapsar menú"}
        >
          {colapsada ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
          {!colapsada && "Colapsar"}
        </button>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-navy/50"
            onClick={() => setDrawer(false)}
          />
          <aside className="relative flex h-full w-sidebar flex-col bg-navy text-on-dark shadow-3">
            <button
              type="button"
              onClick={() => setDrawer(false)}
              className="absolute top-3 right-3 p-2 text-on-dark/80"
              aria-label="Cerrar menú"
            >
              <X size={20} aria-hidden />
            </button>
            {marca(false)}
            {nav(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-hairline bg-canvas px-4 py-3 md:px-6">
          <button type="button" className="-ml-1 p-2 md:hidden" onClick={() => setDrawer(true)} aria-label="Abrir menú">
            <Menu size={20} aria-hidden />
          </button>
          <p className="min-w-0 flex-1 truncate text-heading-md">{tituloDeRuta(pathname)}</p>
          {soloLectura && (
            <span
              className="pill border border-hairline-strong bg-status-neutral-soft text-status-neutral"
              title={
                usuario.rol === "SUPERADMIN"
                  ? "Puedes ver todo, asignar exámenes y gestionar usuarios; no editas datos de evaluación."
                  : "Puedes ver todo y asignar exámenes; no editas datos de evaluación."
              }
            >
              Solo lectura
            </span>
          )}
          <MenuUsuario usuario={usuario} />
        </header>
        <main className="mx-auto w-full max-w-app flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

function MenuUsuario({ usuario }: { usuario: Props["usuario"] }) {
  const [abierto, setAbierto] = useState(false);
  const iniciales = usuario.nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        className="flex min-h-10 items-center gap-2 rounded-sm px-2 hover:bg-canvas-soft"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-micro text-primary">
          {iniciales}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-button-md leading-tight">{usuario.nombre}</span>
          <span className="block text-micro text-ink-mute">{ETIQUETA_ROL[usuario.rol]}</span>
        </span>
      </button>
      {abierto && (
        <>
          <button
            type="button"
            aria-label="Cerrar"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setAbierto(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-64 rounded-md border border-hairline bg-canvas py-2 shadow-2"
          >
            <p className="truncate px-4 pb-2 text-caption text-ink-mute">{usuario.email}</p>
            <Link
              href="/cambiar-password"
              role="menuitem"
              className="flex min-h-10 items-center gap-2 px-4 text-button-md hover:bg-primary-soft"
            >
              <KeyRound size={16} aria-hidden /> Cambiar contraseña
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                role="menuitem"
                className="flex min-h-10 w-full items-center gap-2 px-4 text-button-md hover:bg-primary-soft"
              >
                <LogOut size={16} aria-hidden /> Cerrar sesión
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
