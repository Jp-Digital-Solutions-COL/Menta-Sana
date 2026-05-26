"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { CitaConRel, DoctorBasic, HorarioCalendario } from "./types";
import { ESTADO_CONFIG } from "./types";
import { durationMinutes, formatTime, isSameDay, toDateStr, addDays, getBogotaHM, bogotaToISO, parseTS } from "./utils";

const HOUR_HEIGHT = 64;
const GRID_START = 7;
const GRID_END = 20;
const HOURS = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);
const TOTAL_H = HOURS.length * HOUR_HEIGHT;
const SNAP_MIN = 15;
const SNAP_PX = SNAP_MIN * (HOUR_HEIGHT / 60);
const WORK_START = 8;
const WORK_END = 18;

function topPx(date: Date): number {
  const { h, m } = getBogotaHM(date);
  return (h * 60 + m - GRID_START * 60) * (HOUR_HEIGHT / 60);
}
function timeTopPx(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h * 60 + m - GRID_START * 60) * (HOUR_HEIGHT / 60);
}
function heightPx(dur: number): number {
  return Math.max(dur * (HOUR_HEIGHT / 60), 24);
}
const UBICACION_COLORS = ["#0D9488", "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899", "#10B981"];

function ubicacionColor(ubicacionId: string | null, sortedIds: (string | null)[]): string {
  const idx = sortedIds.indexOf(ubicacionId ?? null);
  return UBICACION_COLORS[idx >= 0 ? idx % UBICACION_COLORS.length : 0];
}
function timeFromClickY(clientY: number, rect: DOMRect): string {
  const y = clientY - rect.top;
  const totalMin = (y / HOUR_HEIGHT) * 60 + GRID_START * 60;
  const rounded = Math.round(totalMin / 30) * 30;
  const clamped = Math.max(GRID_START * 60, Math.min((GRID_END - 1) * 60, rounded));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function snapTop(rawTop: number, maxTop: number): number {
  const snapped = Math.round(rawTop / SNAP_PX) * SNAP_PX;
  return Math.max(0, Math.min(maxTop, snapped));
}
function estadoDot(estado: string): string {
  const map: Record<string, string> = {
    programada: "bg-blue-500",
    confirmada: "bg-green-500",
    cancelada: "bg-red-500",
    atendida: "bg-violet-500",
    no_asistio: "bg-amber-500",
  };
  return map[estado] ?? "bg-gray-400";
}

function topToTime(top: number): { h: number; m: number } {
  const totalMin = (top / HOUR_HEIGHT) * 60 + GRID_START * 60;
  const snapped = Math.round(totalMin / SNAP_MIN) * SNAP_MIN;
  const clamped = Math.max(GRID_START * 60, Math.min(GRID_END * 60, snapped));
  return { h: Math.floor(clamped / 60), m: clamped % 60 };
}

/**
 * Asigna a cada cita su posición horizontal en la columna del día.
 * - Columnas fijas por doctor (orden de `doctors`): el doctor 0 siempre a la izquierda, el 1 a la derecha, etc.
 * - Si una cita no se solapa con ninguna otra → ancho completo (leftPct 0, widthPct 100).
 */
function computeDoctorLayout(
  citas: CitaConRel[],
  doctors: DoctorBasic[]
): Map<string, { leftPct: number; widthPct: number }> {
  if (citas.length === 0) return new Map();

  // Doctores visibles (en orden) que tienen al menos una cita este día
  const activeDoctorIds = doctors
    .map((d) => d.id)
    .filter((id) => citas.some((c) => c.doctor_id === id));
  const doctorCol = new Map(activeDoctorIds.map((id, i) => [id, i]));
  const totalCols = activeDoctorIds.length;

  const result = new Map<string, { leftPct: number; widthPct: number }>();

  for (const cita of citas) {
    const start = new Date(cita.inicio).getTime();
    const end = new Date(cita.fin).getTime();

    // ¿Se solapa con alguna otra cita del día?
    const hasOverlap = citas.some((other) => {
      if (other.id === cita.id) return false;
      const oStart = new Date(other.inicio).getTime();
      const oEnd = new Date(other.fin).getTime();
      return start < oEnd && end > oStart;
    });

    if (!hasOverlap || totalCols <= 1) {
      // Sin solapamiento → ancho completo
      result.set(cita.id, { leftPct: 0, widthPct: 100 });
    } else {
      const col = doctorCol.get(cita.doctor_id) ?? 0;
      result.set(cita.id, {
        leftPct: (col / totalCols) * 100,
        widthPct: (1 / totalCols) * 100,
      });
    }
  }

  return result;
}

interface GhostState {
  citaId: string;
  top: number;
  height: number;
  originalDayIdx: number;
  targetDayIdx: number;
}

interface Props {
  startDate: Date;
  today: Date;
  doctors: DoctorBasic[];
  allDoctors: DoctorBasic[];
  citas: CitaConRel[];
  horarios?: HorarioCalendario[];
  onCitaClick: (c: CitaConRel) => void;
  onDayClick: (d: Date) => void;
  onSlotClick?: (day: Date, time: string) => void;
  onReschedule?: (id: string, inicioISO: string, finISO: string) => Promise<void>;
}

export default function CalendarWeekView({
  startDate,
  today,
  doctors,
  allDoctors,
  citas,
  horarios = [],
  onCitaClick,
  onDayClick,
  onSlotClick,
  onReschedule,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const [ghost, setGhost] = useState<GhostState | null>(null);

  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - GRID_START) * HOUR_HEIGHT;
    }
  }, []);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
  const doctorIds = new Set(doctors.map((d) => d.id));

  // Unique ubicacion_ids for color mapping: null (main consultorio) always first
  const allUbicacionIds: (string | null)[] = (() => {
    const seen = new Set<string | null>([null]);
    for (const c of citas) seen.add(c.ubicacion_id ?? null);
    return [...seen];
  })();

  const now = new Date();
  const nowBog = getBogotaHM(now);
  const todayInWeek = weekDays.some((d) => isSameDay(d, today));
  const nowTop =
    todayInWeek && nowBog.h >= GRID_START && nowBog.h < GRID_END
      ? (nowBog.h * 60 + nowBog.m - GRID_START * 60) * (HOUR_HEIGHT / 60)
      : null;

  function getDayIdxFromClientX(clientX: number): number {
    if (!gridRef.current) return 0;
    const rect = gridRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const colW = rect.width / 7;
    return Math.max(0, Math.min(6, Math.floor(x / colW)));
  }

  function handleDragStart(_event: DragStartEvent) {
    isDraggingRef.current = true;
    dragMovedRef.current = false;
    // Ghost shown only after real movement in handleDragMove
  }

  function handleDragMove(event: DragMoveEvent) {
    if (!event.active.data.current) return;
    const { originalTop, originalDayIdx, dur } = event.active.data.current as {
      originalTop: number;
      originalDayIdx: number;
      dur: number;
    };

    const totalDelta = Math.abs(event.delta.x) + Math.abs(event.delta.y);
    if (totalDelta < 8) return;
    dragMovedRef.current = true;

    const rawTop = originalTop + event.delta.y;
    const maxTop = TOTAL_H - heightPx(dur);
    const snappedTop = snapTop(rawTop, maxTop);

    const activatorX = (event.activatorEvent as PointerEvent).clientX;
    const targetDayIdx = getDayIdxFromClientX(activatorX + event.delta.x);

    setGhost({
      citaId: event.active.id as string,
      top: snappedTop,
      height: heightPx(dur),
      originalDayIdx,
      targetDayIdx,
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    requestAnimationFrame(() => { isDraggingRef.current = false; });
    setGhost(null);

    if (!event.active.data.current) return;
    const { cita, originalTop, originalDayIdx, dur } = event.active.data.current as {
      cita: CitaConRel;
      originalTop: number;
      originalDayIdx: number;
      dur: number;
    };

    if (!dragMovedRef.current) {
      // No real movement → click
      onCitaClick(cita);
      return;
    }

    if (!onReschedule) return;

    const rawTop = originalTop + event.delta.y;
    const maxTop = TOTAL_H - heightPx(dur);
    const newTop = snapTop(rawTop, maxTop);

    const activatorX = (event.activatorEvent as PointerEvent).clientX;
    const targetDayIdx = getDayIdxFromClientX(activatorX + event.delta.x);

    const dayChanged = targetDayIdx !== originalDayIdx;
    const timeChanged = Math.abs(newTop - originalTop) >= SNAP_PX / 2;
    if (!dayChanged && !timeChanged) return;

    const { h, m } = topToTime(newTop);
    const targetDay = weekDays[targetDayIdx];
    const [y, mo, d] = toDateStr(targetDay).split("-").map(Number);
    const newISOStart = bogotaToISO(y, mo, d, h, m);
    const newStart = new Date(newISOStart);
    const origDate = parseTS(cita.inicio);
    if (newStart.getTime() === origDate.getTime()) return;

    await onReschedule(cita.id, newISOStart, new Date(newStart.getTime() + dur * 60000).toISOString());
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Day headers */}
        <div className="flex border-b shrink-0 bg-background">
          <div className="w-14 shrink-0 border-r" />
          {weekDays.map((day) => {
            const isToday = isSameDay(day, today);
            return (
              <button
                key={toDateStr(day)}
                onClick={() => onDayClick(day)}
                aria-label={`Ver día ${day.getDate()}`}
                className={`flex-1 flex flex-col items-center py-2 transition-colors hover:bg-muted/80 border-l first:border-l-0 min-w-0 ${isToday ? "bg-primary/5" : ""}`}
              >
                <span className={`text-[10px] uppercase font-semibold tracking-wider ${isToday ? "text-primary" : "text-foreground/55"}`}>
                  {new Intl.DateTimeFormat("es-MX", { weekday: "short" }).format(day)}
                </span>
                <span className={`text-xl font-bold leading-none mt-1 w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isToday ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted"}`}>
                  {day.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        {/* Scrollable time grid */}
        <div
          className="flex flex-1 overflow-y-auto select-none"
          ref={scrollRef}
        >
          {/* Time gutter */}
          <div className="w-14 shrink-0 border-r bg-background">
            {HOURS.map((h) => (
              <div
                key={h}
                className={`relative border-t border-border/20 ${h < WORK_START || h >= WORK_END ? "bg-muted/80" : ""}`}
                style={{ height: HOUR_HEIGHT }}
              >
                <span className={`absolute -top-2.5 right-2 text-[10px] tabular-nums select-none ${h < WORK_START || h >= WORK_END ? "text-muted-foreground/40" : "text-muted-foreground/70"}`}>
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* Columns container */}
          <div className="flex flex-1 relative" style={{ minHeight: TOTAL_H }} ref={gridRef}>
            {/* Hour + half-hour lines */}
            {HOURS.map((_, i) => (
              <div key={i}>
                <div className="absolute left-0 right-0 border-t border-border/[0.35] pointer-events-none" style={{ top: i * HOUR_HEIGHT }} />
                <div className="absolute left-0 right-0 border-t border-dashed border-border/[0.18] pointer-events-none" style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
              </div>
            ))}

            {/* Current-time indicator */}
            {nowTop !== null && (
              <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top: nowTop }}>
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 -ml-1" />
                <div className="flex-1 border-t-2 border-red-500/75" />
              </div>
            )}

            {/* Day columns */}
            {weekDays.map((day, dayIdx) => {
              const isToday = isSameDay(day, today);
              const dayCitas = citas
                .filter((c) => isSameDay(parseTS(c.inicio), day) && doctorIds.has(c.doctor_id))
                .sort((a, b) => a.inicio.localeCompare(b.inicio));

              const colGhost = ghost?.targetDayIdx === dayIdx ? ghost : null;
              const layout = computeDoctorLayout(dayCitas, doctors);

              // Almuerzo blocks: one sub-band per doctor that has almuerzo on this weekday
              const almuerzoBands = doctors
                .flatMap((doc, i) => {
                  const h = horarios.find(
                    (h) => h.doctor_id === doc.id && h.dia_semana === day.getDay()
                  );
                  return h?.almuerzo_inicio && h?.almuerzo_fin
                    ? [{ inicio: h.almuerzo_inicio.slice(0, 5), fin: h.almuerzo_fin.slice(0, 5), docIdx: i }]
                    : [];
                });
              const alBandCount = almuerzoBands.length;

              return (
                <div
                  key={toDateStr(day)}
                  className={`flex-1 relative border-l first:border-l-0 min-w-0 cursor-pointer transition-colors duration-100 ${isToday ? "bg-primary/[0.03]" : "hover:bg-muted/[0.08]"}`}
                  style={{ height: TOTAL_H }}
                  onClick={(e) => {
                    if (!onSlotClick || isDraggingRef.current) return;
                    if ((e.target as HTMLElement).closest("[data-cita-id]")) return;
                    onSlotClick(day, timeFromClickY(e.clientY, e.currentTarget.getBoundingClientRect()));
                  }}
                >
                  {/* Off-hours / descanso: solo cuando hay un doctor seleccionado */}
                  {doctors.length === 1 && (() => {
                    const doctorHasSchedules = horarios.some((h) => h.doctor_id === doctors[0].id);
                    const h = horarios.find(
                      (h) => h.doctor_id === doctors[0].id && h.dia_semana === day.getDay()
                    );
                    if (doctorHasSchedules && !h) {
                      return <WeekRestDayBlock />;
                    }
                    const wTop = h?.hora_inicio
                      ? Math.max(0, timeTopPx(h.hora_inicio.slice(0, 5)))
                      : (WORK_START - GRID_START) * HOUR_HEIGHT;
                    const wBottom = h?.hora_fin
                      ? Math.min(TOTAL_H, timeTopPx(h.hora_fin.slice(0, 5)))
                      : (WORK_END - GRID_START) * HOUR_HEIGHT;
                    return (
                      <>
                        <WeekOffHoursBlock top={0} height={wTop} />
                        <WeekOffHoursBlock top={wBottom} height={TOTAL_H - wBottom} />
                      </>
                    );
                  })()}

                  {almuerzoBands.map((band, bi) => (
                    <WeekAlmuerzoBlock
                      key={`al-${band.docIdx}`}
                      inicio={band.inicio}
                      fin={band.fin}
                      leftPct={(bi / alBandCount) * 100}
                      widthPct={(1 / alBandCount) * 100}
                    />
                  ))}

                  {colGhost && (
                    <WeekGhost ghost={colGhost} citas={citas} allUbicacionIds={allUbicacionIds} />
                  )}

                  {dayCitas.map((cita) => {
                    const dt = parseTS(cita.inicio);
                    const dur = durationMinutes(cita.inicio, cita.fin);
                    const top = topPx(dt);
                    const h = heightPx(dur);
                    if (top < -h || top > TOTAL_H) return null;

                    const color = ubicacionColor(cita.ubicacion_id, allUbicacionIds);
                    const { leftPct, widthPct } = layout.get(cita.id) ?? { leftPct: 0, widthPct: 100 };

                    return (
                      <WeekCitaBlock
                        key={cita.id}
                        cita={cita}
                        top={top}
                        h={h}
                        dur={dur}
                        color={color}
                        dayIdx={dayIdx}
                        isDraggingThis={ghost?.citaId === cita.id}
                        leftPct={leftPct}
                        widthPct={widthPct}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DndContext>
  );
}

function WeekCitaBlock({
  cita,
  top,
  h,
  dur,
  color,
  dayIdx,
  isDraggingThis,
  leftPct,
  widthPct,
}: {
  cita: CitaConRel;
  top: number;
  h: number;
  dur: number;
  color: string;
  dayIdx: number;
  isDraggingThis: boolean;
  leftPct: number;
  widthPct: number;
}) {
  const isBloqueada = cita.estado === "bloqueada";
  const ec = ESTADO_CONFIG[cita.estado];
  const dt = parseTS(cita.inicio);

  const { attributes, listeners, setNodeRef } = useDraggable({
    id: cita.id,
    data: { cita, originalTop: Math.max(0, top), originalDayIdx: dayIdx, dur },
  });

  return (
    <button
      ref={setNodeRef}
      data-cita-id={cita.id}
      {...listeners}
      {...attributes}
      className={`absolute rounded text-left overflow-hidden transition-opacity hover:brightness-95 hover:shadow-sm cursor-grab active:cursor-grabbing ${ec.bg}`}
      style={{
        top: Math.max(0, top),
        height: h,
        left: `calc(${leftPct}% + 1px)`,
        width: `calc(${widthPct}% - 2px)`,
        borderLeft: isBloqueada ? `3px solid #9ca3af` : `3px solid ${color}`,
        backgroundImage: isBloqueada
          ? "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.04) 4px, rgba(0,0,0,0.04) 8px)"
          : undefined,
        opacity: isDraggingThis ? 0.35 : 1,
      }}
    >
      <div className="px-1.5 py-0.5 h-full overflow-hidden">
        <div className="flex items-start gap-1 min-w-0">
          <p className={`text-[11px] font-semibold leading-tight truncate flex-1 min-w-0 ${ec.text}`}>
            {isBloqueada ? (cita.motivo || "Bloqueado") : cita.pacientes?.nombre}
          </p>
          {!isBloqueada && h >= 28 && (
            <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-[3px] ${estadoDot(cita.estado)}`} />
          )}
        </div>
        {h >= 34 && (
          <p className={`text-[10px] tabular-nums leading-tight opacity-70 ${ec.text}`}>
            {formatTime(dt)}{dur >= 30 ? ` · ${dur}min` : ""}
          </p>
        )}
      </div>
    </button>
  );
}

function WeekRestDayBlock() {
  return (
    <div
      className="absolute inset-0 pointer-events-none flex items-center justify-center"
      style={{
        background: "hsl(var(--muted))",
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(0,0,0,0.055) 6px, rgba(0,0,0,0.055) 12px)",
      }}
    >
      <p className="text-[10px] text-muted-foreground/50 font-medium select-none tracking-wide [writing-mode:vertical-lr] rotate-180">
        Día de descanso
      </p>
    </div>
  );
}

function WeekOffHoursBlock({ top, height }: { top: number; height: number }) {
  if (height <= 0) return null;
  return (
    <div
      className="absolute left-0 right-0 pointer-events-none overflow-hidden"
      style={{
        top,
        height,
        background: "hsl(var(--muted))",
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.06) 5px, rgba(0,0,0,0.06) 10px)",
      }}
    >
      {height > 20 && (
        <p className="text-[9px] text-muted-foreground/50 font-medium px-1 pt-0.5 select-none leading-tight">
          Fuera de horario
        </p>
      )}
    </div>
  );
}

function WeekAlmuerzoBlock({
  inicio,
  fin,
  leftPct,
  widthPct,
}: {
  inicio: string;
  fin: string;
  leftPct: number;
  widthPct: number;
}) {
  const [ih, im] = inicio.split(":").map(Number);
  const [fh, fm] = fin.split(":").map(Number);
  const top = (ih * 60 + im - GRID_START * 60) * (HOUR_HEIGHT / 60);
  const h = Math.max(((fh * 60 + fm) - (ih * 60 + im)) * (HOUR_HEIGHT / 60), 12);
  if (top + h <= 0 || top >= TOTAL_H) return null;
  return (
    <div
      className="absolute rounded overflow-hidden pointer-events-none"
      style={{
        top: Math.max(0, top),
        height: h,
        left: `calc(${leftPct}% + 1px)`,
        width: `calc(${widthPct}% - 2px)`,
        background: "rgba(241,245,249,0.96)",
        borderLeft: "3px solid #cbd5e1",
      }}
    >
      <p className="text-[9px] text-slate-400 font-medium px-1 pt-0.5 leading-tight select-none">
        Almuerzo
      </p>
    </div>
  );
}

function WeekGhost({ ghost, citas, allUbicacionIds }: { ghost: GhostState; citas: CitaConRel[]; allUbicacionIds: (string | null)[] }) {
  const cita = citas.find((c) => c.id === ghost.citaId);
  if (!cita) return null;
  const isBloqueada = cita.estado === "bloqueada";
  const ec = ESTADO_CONFIG[cita.estado];
  const color = isBloqueada ? "#9ca3af" : ubicacionColor(cita.ubicacion_id, allUbicacionIds);
  const { h: th, m: tm } = topToTime(ghost.top);
  const timeLabel = `${String(th).padStart(2, "0")}:${String(tm).padStart(2, "0")}`;

  return (
    <div
      className={`absolute left-0.5 right-0.5 rounded overflow-hidden pointer-events-none z-30 ring-2 ring-primary shadow-lg ${ec.bg}`}
      style={{
        top: ghost.top,
        height: ghost.height,
        borderLeft: isBloqueada ? `3px solid #9ca3af` : `3px solid ${color}`,
      }}
    >
      <div className="px-1.5 py-0.5 h-full overflow-hidden">
        <p className={`text-[11px] font-semibold leading-tight truncate ${ec.text}`}>
          {isBloqueada ? (cita.motivo || "Bloqueado") : cita.pacientes?.nombre}
        </p>
        {ghost.height >= 34 && (
          <p className={`text-[10px] leading-tight opacity-70 ${ec.text}`}>{timeLabel}</p>
        )}
      </div>
    </div>
  );
}
