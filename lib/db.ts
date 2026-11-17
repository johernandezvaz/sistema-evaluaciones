import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export function db(): PrismaClient {
  globalForPrisma.__prisma ??= new PrismaClient();
  return globalForPrisma.__prisma;
}

export type Tx = Prisma.TransactionClient;

export function esBloqueoDeIntegridad(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code === "P2002" || e.code === "P2003") return true;
  return e.code === "P2010" && (e.meta as { code?: string } | undefined)?.code === "1811";
}

export function esUnicoEn(e: unknown, campo: string): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    JSON.stringify(e.meta ?? {}).includes(campo)
  );
}
