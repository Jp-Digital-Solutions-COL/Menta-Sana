const BOGOTA_TZ = "America/Bogota";

function bogotaDateStr(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Returns a Date anchored at noon Bogota time of the given date (17:00 UTC). Safe for all browser timezones. */
function bogotaNoon(date: Date): Date {
  return new Date(`${bogotaDateStr(date)}T12:00:00-05:00`);
}

/** Minutos de duración entre dos timestamps ISO. */
export function durationMinutes(inicio: string, fin: string): number {
  return Math.round(
    (new Date(fin).getTime() - new Date(inicio).getTime()) / 60000
  );
}

/** Extracts hours and minutes in America/Bogota timezone. */
export function getBogotaHM(date: Date): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: BOGOTA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return {
    h: Number(parts.find((p) => p.type === "hour")?.value ?? "0"),
    m: Number(parts.find((p) => p.type === "minute")?.value ?? "0"),
  };
}

/**
 * Converts Bogota local date/time components to a UTC ISO string.
 * Colombia is permanently UTC-5 (no DST).
 */
export function bogotaToISO(y: number, mo: number, d: number, h: number, m: number): string {
  const s = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-05:00`;
  return new Date(s).toISOString();
}

/** "HH:MM" in America/Bogota timezone. */
export function formatTime(date: Date): string {
  const { h, m } = getBogotaHM(date);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Current date in America/Bogota, anchored at noon to be timezone-safe. */
export function todayBogota(): Date {
  return bogotaNoon(new Date());
}

/** "YYYY-MM-DD" in America/Bogota timezone. */
export function toDateStr(date: Date): string {
  return bogotaDateStr(date);
}

/** Monday of the week containing `date` (Bogota calendar). */
export function startOfWeek(date: Date): Date {
  const noon = bogotaNoon(date);
  const day = noon.getDay(); // noon Bogota = 5pm UTC, UTC weekday === Bogota weekday
  return addDays(date, -(day === 0 ? 6 : day - 1));
}

/** Sunday of the week containing `date` (Bogota calendar). */
export function endOfWeek(date: Date): Date {
  return addDays(startOfWeek(date), 6);
}

/** Add `n` days to `date`, returning a noon-Bogota-anchored Date. */
export function addDays(date: Date, n: number): Date {
  const noon = bogotaNoon(date);
  return bogotaNoon(new Date(noon.getTime() + n * 24 * 3600 * 1000));
}

/** True if `a` and `b` fall on the same calendar day in America/Bogota. */
export function isSameDay(a: Date, b: Date): boolean {
  return bogotaDateStr(a) === bogotaDateStr(b);
}

export function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: BOGOTA_TZ,
  }).format(date);
}

export function formatWeekRange(start: Date, end: Date): string {
  const s = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: BOGOTA_TZ,
  }).format(start);
  const e = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: BOGOTA_TZ,
  }).format(end);
  return `${s} – ${e}`;
}

/**
 * Construye ISO UTC a partir de componentes de fecha/hora locales.
 * Equivale a new Date(y, m-1, d, h, min).toISOString() pero con tipos explícitos.
 */
export function localToISO(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number
): string {
  return new Date(y, m - 1, d, h, min, 0).toISOString();
}
