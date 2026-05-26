/** Minutos de duración entre dos timestamps ISO. */
export function durationMinutes(inicio: string, fin: string): number {
  return Math.round(
    (new Date(fin).getTime() - new Date(inicio).getTime()) / 60000
  );
}

/** "HH:MM" a partir de un Date (hora local del navegador). */
export function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Fecha actual en zona horaria America/Bogota como Date con métodos locales correctos. */
export function todayBogota(): Date {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // "YYYY-MM-DD"
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "YYYY-MM-DD" a partir de un Date (fecha local). */
export function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Lunes de la semana que contiene `date` (hora local). */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

/** Domingo de la semana que contiene `date`. */
export function endOfWeek(date: Date): Date {
  const s = startOfWeek(date);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
}

export function addDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatWeekRange(start: Date, end: Date): string {
  const s = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
  }).format(start);
  const e = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
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
