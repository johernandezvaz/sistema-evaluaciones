export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Mexico_City";

export function formatFecha(d: Date, tz = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: tz, day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function formatFechaHora(d: Date, tz = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export const addMinutes = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
export const addHours = (d: Date, h: number) => addMinutes(d, h * 60);

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getTime());
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}
