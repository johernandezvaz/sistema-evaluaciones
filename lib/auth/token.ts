import { jwtVerify, SignJWT } from "jose";

export const COOKIE_SESION = "sesion";
export const COOKIE_TABLET = "tablet";

export type ClaimsSesion = { sid: string; kiosco?: string };

function secreto(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET debe tener al menos 32 caracteres");
  return new TextEncoder().encode(s);
}

export async function firmarSesion(claims: ClaimsSesion, expira: Date): Promise<string> {
  return new SignJWT({ sid: claims.sid, ...(claims.kiosco ? { kiosco: claims.kiosco } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expira.getTime() / 1000))
    .sign(secreto());
}

export async function leerSesion(token: string | undefined): Promise<ClaimsSesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secreto(), { algorithms: ["HS256"] });
    if (typeof payload.sid !== "string") return null;
    return { sid: payload.sid, kiosco: typeof payload.kiosco === "string" ? payload.kiosco : undefined };
  } catch {
    return null;
  }
}

export const opcionesCookie = (expira: Date) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  expires: expira,
});
