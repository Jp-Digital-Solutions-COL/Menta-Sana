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
import { durationMinutes, formatTime, isSameDay, getBogotaHM, bogotaToISO, toDateStr, parseTS } from "./utils";
import { CalendarDays } from "lucide-react";

const HOUR_HEIGHT = 64;
const GRID_START = 7;
const GRID_END = 20;
const HOURS = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);
const TOTAL_H = HOURS.length * HOUR_HEIGHT;
const SNAP_MIN = 15;
const SNAP_PX = SNAP_MIN * (HOUR_HEIGHT / 60);
const WORK_START = 8;
const WORK_END = 18;

function topPx(date: Date) {
  const { h, m } = getBogotaHM(date);
  return (h * 60 + m - GRID_START * 60) * (HOUR_HEIGHT / 60);
}
function timeTopPx(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h * 60 + m - GRID_START * 60) * (HOUR_HEIGHT / 60);
}
function heightPx(dur: number) {
  return Math.max(dur * (HOUR_HEIGHT / 60), 28);
}
function doctorColor(index: number): string {
  return `hsl(${(index * 67) % 360} 65% 48%)`;
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
 * Greedy overlap layout — assigns each cita to a visual sub-column so
 * overlapping appointments appear side by side instead of on top of each other.
 * Returns { leftPct, widthPct } as 0-100 percentages of the doctor column.
 */
function computeOverlapLayout(
  citas: CitaConRel[]
): Map<string, { leftPct: number; widthPct: number }> {
  if (citas.length <= 1) {
    return new Map(citas.map((c) => [c.id, { leftPct: 0, widthPct: 100 }]));
  }

  const sorted = [...citas].sort(
    (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()
  );

  // Track end-time of the last cita placed in each sub-column
  const slotEnds: number[] = [];
  const citaSlot = new Map<string, number>();

  for (const cita of sorted) {
    const start = new Date(cita.inicio).getTime();
    const end = new Date(cita.fin).getTime();
    // Reuse the first slot that has already ended
    let slot = slotEnds.findIndex((t) => t <= start);
    if (slot === -1) {
      slot = slotEnds.length;
      slotEnds.push(end);
    } else {
      slotEnds[slot] = end;
    }
    citaSlot.set(cita.id, slot);
  }

  const totalSlots = slotEnds.length;
  const result = new Map<string, { leftPct: number; widthPct: number }>();
  for (const cita of citas) {
    const slot = citaSlot.get(cita.id) ?? 0;
    result.set(cita.id, {
      leftPct: (slot / totalSlots) * 100,
      widthPct: (1 / totalSlots) * 100,
    });
  }
  return result;
}

interface GhostState {
  citaId: string;
  top: number;
  height: number;
  colIdx: number;
}

interface Props {
  date: Date;
  today: Date;
  doctors: DoctorBasic[];
  allDoctors: DoctorBasic[];
  citas: CitaConRel[];
  horarios?: HorarioCalendario[];
  onCitaClick: (c: CitaConRel) => void;
  onSlotClick?: (day: Date, time: string) => void;
  onReschedule?: (id: string, inicioISO: string, finISO: string) => Promise<void>;
}

export default function CalendarDayView({
  date,
  today,
  doctors,
  allDoctors,
  citas,
  horarios = [],
  onCitaClick,
  onSlotClick,
  onReschedule,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const [ghost, setGhost] = useState<GhostState | null>(null);

  // No activationConstraint: every pointer-down goes through onDragStart/onDragEnd,
  // letting us distinguish click (no movement) from drag in handleDragEnd.
  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - GRID_START) * HOUR_HEIGHT;
    }
  }, []);

  const dayCitas = citas.filter((c) => isSameDay(parseTS(c.inicio), date));
  const isToday = isSameDay(date, today);
  const now = new Date();
  const nowBog = getBogotaHM(now);
  const nowTop =
    isToday && nowBog.h >= GRID_START && nowBog.h < GRID_END
      ? (nowBog.h * 60 + nowBog.m - GRID_START * 60) * (HOUR_HEIGHT / 60)
      : null;

  const showHeaders = doctors.length > 1;

  function handleDragStart(_event: DragStartEvent) {
    isDraggingRef.current = true;
    dragMovedRef.current = false;
    // Ghost is shown only after real movement in handleDragMove
  }

  function handleDragMove(event: DragMoveEvent) {
    if (!event.active.data.current) return;
    const { originalTop, colIdx, dur } = event.active.data.current as {
      originalTop: number;
      colIdx: number;
      dur: number;
    };

    const totalDelta = Math.abs(event.delta.x) + Math.abs(event.delta.y);
    if (totalDelta < 8) return; // not enough movement to be a drag yet
    dragMovedRef.current = true;

    const rawTop = originalTop + event.delta.y;
    const maxTop = TOTAL_H - heightPx(dur);
    const snapped = snapTop(rawTop, maxTop);
    setGhost({ citaId: event.active.id as string, top: snapped, height: heightPx(dur), colIdx });
  }

  async function handleDragEnd(event: DragEndEvent) {
    requestAnimationFrame(() => { isDraggingRef.current = false; });
    setGhost(null);

    if (!event.active.data.current) return;
    const { cita, originalTop, dur } = event.active.data.current as {
      cita: CitaConRel;
      originalTop: number;
      colIdx: number;
      dur: number;
    };

    if (!dragMovedRef.current) {
      // No real movement → it was a click
      onCitaClick(cita);
      return;
    }

    if (!onReschedule) return;

    const rawTop = originalTop + event.delta.y;
    const maxTop = TOTAL_H - heightPx(dur);
    const newTop = snapTop(rawTop, maxTop);

    if (Math.abs(newTop - originalTop) < SNAP_PX / 2) return;

    const { h, m } = topToTime(newTop);
    const [y, mo, d] = toDateStr(date).split("-").map(Number);
    const newISOStart = bogotaToISO(y, mo, d, h, m);
    const newStart = new Date(newISOStart);
    if (newStart.getTime() === new Date(cita.inicio).getTime()) return;

    await onReschedule(cita.id, newISOStart, new Date(newStart.getTime() + dur * 60000).toISOString());
  }

  if (doctors.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4 text-center px-4">
        <div className="rounded-full bg-muted p-4">
          <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">Sin doctores seleccionados</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Usa el filtro de doctores en la barra superior para ver las citas del día.
          </p>
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full overflow-hidden">
        {showHeaders && (
          <div className="flex border-b shrink-0 bg-background">
            <div className="w-14 shrink-0 border-r" />
            {doctors.map((doc, i) => {
              const doctorIdx = allDoctors.findIndex((d) => d.id === doc.id);
              const color = doctorColor(doctorIdx >= 0 ? doctorIdx : i);
              return (
                <div
                  key={doc.id}
                  className={`flex-1 px-3 py-2 text-xs font-semibold truncate min-w-[90px] flex items-center gap-1.5 ${i > 0 ? "border-l" : ""}`}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  {doc.nombre}
                </div>
              );
            })}
          </div>
        )}

        <div
          className="flex flex-1 overflow-y-auto overflow-x-auto select-none"
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

          {/* Grid + columns */}
          <div className="flex flex-1 relative" style={{ height: TOTAL_H }}>
            {HOURS.map((_, i) => (
              <div key={i}>
                <div className="absolute left-0 right-0 border-t border-border/[0.35] pointer-events-none" style={{ top: i * HOUR_HEIGHT }} />
                <div className="absolute left-0 right-0 border-t border-dashed border-border/[0.18] pointer-events-none" style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
              </div>
            ))}

            {nowTop !== null && (
              <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top: nowTop }}>
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 shrink-0" />
                <div className="flex-1 border-t-2 border-red-500/75" />
              </div>
            )}

            {doctors.map((doc, idx) => {
              const docCitas = dayCitas.filter((c) => c.doctor_id === doc.id);
              const doctorIdx = allDoctors.findIndex((d) => d.id === doc.id);
              const color = doctorColor(doctorIdx >= 0 ? doctorIdx : idx);
              const colGhost = ghost?.colIdx === idx ? ghost : null;
              const layout = computeOverlapLayout(docCitas);
              const doctorHasSchedules = horarios.some((h) => h.doctor_id === doc.id);
              const horarioDia = horarios.find(
                (h) => h.doctor_id === doc.id && h.dia_semana === date.getDay()
              );
              const isRestDay = doctorHasSchedules && !horarioDia;
              const almuerzo =
                horarioDia?.almuerzo_inicio && horarioDia?.almuerzo_fin
                  ? { inicio: horarioDia.almuerzo_inicio.slice(0, 5), fin: horarioDia.almuerzo_fin.slice(0, 5) }
                  : null;

              return (
                <div
                  key={doc.id}
                  className={`flex-1 relative min-w-[90px] cursor-pointer transition-colors duration-100 hover:bg-muted/[0.08] ${idx > 0 ? "border-l" : ""}`}
                  style={{ height: TOTAL_H }}
                  onClick={(e) => {
                    if (!onSlotClick || isDraggingRef.current) return;
                    if ((e.target as HTMLElement).closest("[data-cita-id]")) return;
                    onSlotClick(date, timeFromClickY(e.clientY, e.currentTarget.getBoundingClientRect()));
                  }}
                >
                  {/* Día de descanso o fuera de horario */}
                  {isRestDay ? (
                    <RestDayBlock />
                  ) : (() => {
                    const wTop = horarioDia?.hora_inicio
                      ? Math.max(0, timeTopPx(horarioDia.hora_inicio.slice(0, 5)))
                      : (WORK_START - GRID_START) * HOUR_HEIGHT;
                    const wBottom = horarioDia?.hora_fin
                      ? Math.min(TOTAL_H, timeTopPx(horarioDia.hora_fin.slice(0, 5)))
                      : (WORK_END - GRID_START) * HOUR_HEIGHT;
                    return (
                      <>
                        <OffHoursBlock top={0} height={wTop} />
                        <OffHoursBlock top={wBottom} height={TOTAL_H - wBottom} />
                      </>
                    );
                  })()}

                  {docCitas.length === 0 && !showHeaders && (
                    <div className="absolute flex items-center justify-center pointer-events-none left-0 right-0" style={{ top: (WORK_START - GRID_START) * HOUR_HEIGHT, height: (WORK_END - WORK_START) * HOUR_HEIGHT }}>
                      <p className="text-xs text-muted-foreground/40">Sin citas</p>
                    </div>
                  )}

                  {almuerzo && (
                    <AlmuerzoBlock
                      inicio={almuerzo.inicio}
                      fin={almuerzo.fin}
                    />
                  )}

                  {colGhost && (
                    <DragGhostDay ghost={colGhost} citas={citas} color={color} />
                  )}

                  {docCitas.map((cita) => {
                    const dt = parseTS(cita.inicio);
                    const dur = durationMinutes(cita.inicio, cita.fin);
                    const top = topPx(dt);
                    const h = heightPx(dur);
                    if (top < -h || top > TOTAL_H) return null;
                    const { leftPct, widthPct } = layout.get(cita.id) ?? { leftPct: 0, widthPct: 100 };

                    return (
                      <CitaBlock
                        key={cita.id}
                        cita={cita}
                        top={top}
                        h={h}
                        dur={dur}
                        color={color}
                        colIdx={idx}
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

function CitaBlock({
  cita,
  top,
  h,
  dur,
  color,
  colIdx,
  isDraggingThis,
  leftPct,
  widthPct,
}: {
  cita: CitaConRel;
  top: number;
  h: number;
  dur: number;
  color: string;
  colIdx: number;
  isDraggingThis: boolean;
  leftPct: number;
  widthPct: number;
}) {
  const isBloqueada = cita.estado === "bloqueada";
  const ec = ESTADO_CONFIG[cita.estado];
  const dt = parseTS(cita.inicio);

  const { attributes, listeners, setNodeRef } = useDraggable({
    id: cita.id,
    data: { cita, originalTop: Math.max(0, top), colIdx, dur },
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
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        borderLeft: isBloqueada ? `3px solid #9ca3af` : `3px solid ${color}`,
        backgroundImage: isBloqueada
          ? "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.04) 4px, rgba(0,0,0,0.04) 8px)"
          : undefined,
        opacity: isDraggingThis ? 0.35 : 1,
      }}
    >
      <div className="px-1.5 py-0.5">
        <div className="flex items-start gap-1 min-w-0">
          <p className={`text-xs font-semibold leading-tight truncate flex-1 min-w-0 ${ec.text}`}>
            {isBloqueada ? (cita.motivo || "Bloqueado") : cita.pacientes?.nombre}
          </p>
          {!isBloqueada && h >= 32 && (
            <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-[3px] ${estadoDot(cita.estado)}`} />
          )}
        </div>
        {h >= 38 && (
          <p className={`text-[10px] tabular-nums leading-tight opacity-70 ${ec.text}`}>
            {formatTime(dt)} · {dur}min
          </p>
        )}
      </div>
    </button>
  );
}

function RestDayBlock() {
  return (
    <div
      className="absolute inset-0 pointer-events-none flex items-center justify-center"
      style={{
        background: "hsl(var(--muted))",
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(0,0,0,0.055) 6px, rgba(0,0,0,0.055) 12px)",
      }}
    >
      <p className="text-[11px] text-muted-foreground/50 font-medium select-none tracking-wide">
        Día de descanso
      </p>
    </div>
  );
}

function OffHoursBlock({ top, height }: { top: number; height: number }) {
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
      {height > 24 && (
        <p className="text-[10px] text-muted-foreground/50 font-medium px-1.5 pt-1 select-none leading-tight">
          Fuera de horario
        </p>
      )}
    </div>
  );
}

function AlmuerzoBlock({ inicio, fin }: { inicio: string; fin: string }) {
  const [ih, im] = inicio.split(":").map(Number);
  const [fh, fm] = fin.split(":").map(Number);
  const top = (ih * 60 + im - GRID_START * 60) * (HOUR_HEIGHT / 60);
  const h = Math.max(((fh * 60 + fm) - (ih * 60 + im)) * (HOUR_HEIGHT / 60), 16);
  if (top + h <= 0 || top >= TOTAL_H) return null;
  return (
    <div
      className="absolute left-0.5 right-0.5 rounded overflow-hidden pointer-events-none"
      style={{
        top: Math.max(0, top),
        height: h,
        background: "rgba(241,245,249,0.96)",
        borderLeft: "3px solid #cbd5e1",
      }}
    >
      <p className="text-[10px] text-slate-400 font-medium px-1.5 pt-0.5 leading-tight select-none">
        Almuerzo
      </p>
    </div>
  );
}

function DragGhostDay({ ghost, citas, color }: { ghost: GhostState; citas: CitaConRel[]; color: string }) {
  const cita = citas.find((c) => c.id === ghost.citaId);
  if (!cita) return null;
  const isBloqueada = cita.estado === "bloqueada";
  const ec = ESTADO_CONFIG[cita.estado];
  const { h: th, m: tm } = topToTime(ghost.top);
  const timeLabel = `${String(th).padStart(2, "0")}:${String(tm).padStart(2, "0")}`;

  return (
    <div
      className={`absolute left-1 right-1 rounded overflow-hidden pointer-events-none z-30 ring-2 ring-primary shadow-lg ${ec.bg}`}
      style={{
        top: ghost.top,
        height: ghost.height,
        borderLeft: isBloqueada ? `3px solid #9ca3af` : `3px solid ${color}`,
      }}
    >
      <div className="px-1.5 py-0.5">
        <p className={`text-xs font-semibold leading-tight truncate ${ec.text}`}>
          {isBloqueada ? (cita.motivo || "Bloqueado") : cita.pacientes?.nombre}
        </p>
        {ghost.height >= 38 && (
          <p className={`text-[10px] leading-tight opacity-70 ${ec.text}`}>{timeLabel}</p>
        )}
      </div>
    </div>
  );
}
