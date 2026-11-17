/**
 * Enrutamiento por cookie (primera barrera; la validez real se comprueba contra la tabla Sesion en el servidor):
 *   - Sin sesión ni tablet          → /login (salvo /login y el emparejamiento de tablets).
 *   - Sesión en modo kiosco         → solo /kiosco/<su intento> y /kiosco/salir.
 *   - Tablet compartida sin sesión  → solo /kiosco/** (nunca el panel).
 */
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, COOKIE_TABLET, leerSesion } from "./lib/auth/token";

/** Solo los archivos de imagen de public/examenes (NO las páginas /examenes/<id>, que muestran la clave). */
const esImagenDeExamen = (p: string) => p.startsWith("/examenes/") && /\.(png|jpe?g|gif|webp)$/i.test(p);

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const ir = (destino: string) => NextResponse.redirect(new URL(destino, req.url));
  const claims = await leerSesion(req.cookies.get(COOKIE_SESION)?.value);
  const tablet = !!req.cookies.get(COOKIE_TABLET)?.value;

  if (claims?.kiosco) {
    const propio = `/kiosco/${claims.kiosco}`;
    if (pathname === propio || pathname === "/kiosco/salir" || esImagenDeExamen(pathname)) return NextResponse.next();
    return ir(propio);
  }
  if (claims) {
    if (pathname === "/login") return ir("/");
    return NextResponse.next();
  }
  if (pathname === "/login" || pathname === "/kiosco/emparejar") return NextResponse.next();
  if (tablet) {
    if ((pathname === "/kiosco" || pathname.startsWith("/kiosco/")) && pathname !== "/kiosco/salir")
      return NextResponse.next();
    if (esImagenDeExamen(pathname)) return NextResponse.next();
    return ir("/kiosco");
  }
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon_io/|safe-demo_logo|robots.txt).*)"],
};
