import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // NEXT_DIST_DIR permite verificar un build (p. ej. ".next-check") sin pisar el .next de un `next dev` en marcha.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // La carpeta de formatos originales y el diseño no forman parte del build.
  outputFileTracingExcludes: { "*": ["formatos/**", "design/**", "docs/**", "tmp/**"] },
};

export default nextConfig;
