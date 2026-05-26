"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CitaConRel, DoctorBasic, HorarioCalendario, PacienteBasic } from "./types";
import { getCitas, reagendar } from "./actions";
import {
  startOfWeek,
  endOfWeek,
  addDays,
  isSameDay,
  toDateStr,
  formatDayLabel,
  formatWeekRange,
  bogotaToISO,
} from "./utils";
import CalendarDayView from "./calendar-day-view";
import CalendarWeekView from "./calendar-week-view";
import NuevaCitaDialog from "./nueva-cita-dialog";
import BloquearHorasDialog from "./bloquear-horas-dialog";
import CitaDetailSheet from "./cita-detail-sheet";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Calendar, CalendarDays, Ban, Zap } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

type ViewMode = "day" | "week";

interface Props {
  doctors: DoctorBasic[];
  pacientes: PacienteBasic[];
  initialCitas: CitaConRel[];
  todayStr: string; // "YYYY-MM-DD"
  lockedDoctor?: DoctorBasic;
  horarios?: HorarioCalendario[];
}

function makeNoon(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

const PICKER_WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

function getMonthDays(monthStart: Date): (Date | null)[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0, Sun=6
  const days: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

export default function AgendaClient({
  doctors,
  pacientes,
  initialCitas,
  todayStr,
  lockedDoctor,
  horarios = [],
}: Props) {
  const todayDate = useMemo(() => makeNoon(todayStr), [todayStr]);

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(todayDate);
  const [selectedDoctorId, setSelectedDoctorId] = useState(lockedDoctor?.id ?? "todos");
  const [citas, setCitas] = useState<CitaConRel[]>(initialCitas);
  const [loadedWeekStart, setLoadedWeekStart] = useState(() =>
    startOfWeek(todayDate)
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPreset, setDialogPreset] = useState<{ fecha: string; hora: string } | null>(null);
  const [bloqueoOpen, setBloqueoOpen] = useState(false);
  const [bloqueoPreset, setBloqueoPreset] = useState<{ fecha: string; hora: string } | null>(null);
  const [detailCita, setDetailCita] = useState<CitaConRel | null>(null);
  const [, startTransition] = useTransition();

  const [isPending, setIsPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Date picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(
    () => new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
  );
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pickerFixed, setPickerFixed] = useState(false);
  const [pickerTop, setPickerTop] = useState(0);

  useEffect(() => {
    if (!pickerOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [pickerOpen]);

  const weekStart = startOfWeek(currentDate);
  const weekEnd = endOfWeek(currentDate);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  async function refreshCitas(wStart: Date) {
    setIsPending(true);
    try {
      const we = endOfWeek(wStart);
      const [sy, sm, sd] = toDateStr(wStart).split("-").map(Number);
      const [ey, em, ed] = toDateStr(we).split("-").map(Number);
      const data = await getCitas(
        bogotaToISO(sy, sm, sd, 0, 0),
        bogotaToISO(ey, em, ed, 23, 59),
        lockedDoctor?.id
      );
      setCitas(data);
      setLoadedWeekStart(wStart);
    } finally {
      setIsPending(false);
    }
  }

  async function handleCitaCreated() {
    await refreshCitas(loadedWeekStart);
    showToast("Cita creada");
  }

  async function handleCitaUpdated() {
    await refreshCitas(loadedWeekStart);
    showToast("Cita actualizada");
  }

  async function handleReschedule(id: string, inicioISO: string, finISO: string) {
    try {
      const result = await reagendar(id, inicioISO, finISO);
      if (result?.error) {
        console.error("Reagendar error:", result.error);
        return;
      }
      await refreshCitas(loadedWeekStart);
      showToast("Cita reagendada");
    } catch (err) {
      console.error("Reagendar failed:", err);
    }
  }

  function handleSlotClick(day: Date, time: string) {
    setDialogPreset({ fecha: toDateStr(day), hora: time });
    setDialogOpen(true);
  }

  function navigateTo(newDate: Date) {
    setCurrentDate(newDate);
    const newWeekStart = startOfWeek(newDate);
    if (newWeekStart.getTime() !== loadedWeekStart.getTime()) {
      startTransition(async () => {
        await refreshCitas(newWeekStart);
      });
    }
  }

  function handleDayClick(day: Date) {
    setCurrentDate(day);
    setViewMode("day");
    const newWeekStart = startOfWeek(day);
    if (newWeekStart.getTime() !== loadedWeekStart.getTime()) {
      startTransition(async () => {
        await refreshCitas(newWeekStart);
      });
    }
  }

  function handlePickerSelect(day: Date) {
    setPickerOpen(false);
    navigateTo(day);
  }

  const activeDoctors = useMemo(
    () => doctors.filter((d) => !d.bloqueado_pago),
    [doctors]
  );

  const blockedDoctors = useMemo(
    () => doctors.filter((d) => d.bloqueado_pago),
    [doctors]
  );

  const visibleDoctors = useMemo(
    () =>
      selectedDoctorId === "todos"
        ? activeDoctors
        : activeDoctors.filter((d) => d.id === selectedDoctorId),
    [activeDoctors, selectedDoctorId]
  );

  const headerLabel =
    viewMode === "day"
      ? formatDayLabel(currentDate)
      : formatWeekRange(weekStart, weekEnd);

  const isCurrentToday =
    viewMode === "day" && isSameDay(currentDate, todayDate);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-background flex-wrap shrink-0">
        {/* Inicio */}
        <Link href="/inicio" title="Ir al inicio">
          <Image
            src="/Menta-Sana_solo_logo.png"
            alt="Menta Sana"
            width={32}
            height={32}
            className="h-12 w-auto"
            unoptimized
            priority
          />
        </Link>
        <div className="h-4 w-px bg-border shrink-0" />
        {/* Navegación */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            title={viewMode === "day" ? "Día anterior" : "Semana anterior"}
            aria-label={viewMode === "day" ? "Día anterior" : "Semana anterior"}
            onClick={() =>
              navigateTo(addDays(viewMode === "day" ? currentDate : weekStart, viewMode === "day" ? -1 : -7))
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={isCurrentToday}
            onClick={() => navigateTo(todayDate)}
          >
            Hoy
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            title={viewMode === "day" ? "Día siguiente" : "Semana siguiente"}
            aria-label={viewMode === "day" ? "Día siguiente" : "Semana siguiente"}
            onClick={() =>
              navigateTo(addDays(viewMode === "day" ? currentDate : weekStart, viewMode === "day" ? 1 : 7))
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Etiqueta de fecha — abre el mini calendario */}
        <div ref={pickerRef} className="relative flex-1 min-w-[160px]">
          <button
            onClick={() => {
              setPickerMonth(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
              if (pickerRef.current) {
                const rect = pickerRef.current.getBoundingClientRect();
                const mobile = window.innerWidth < 640;
                setPickerFixed(mobile);
                setPickerTop(rect.bottom + 6);
              }
              setPickerOpen((o) => !o);
            }}
            className="flex items-center gap-1 text-sm font-semibold capitalize hover:text-primary transition-colors max-w-full"
          >
            <span className="truncate">{headerLabel}</span>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${pickerOpen ? "rotate-180" : ""}`} />
          </button>

          {pickerOpen && (
            <div
              className={`z-50 bg-card border rounded-lg shadow-lg p-3 ${
                pickerFixed
                  ? "fixed left-4 right-4"
                  : "absolute left-0 top-full mt-1.5 w-[264px]"
              }`}
              style={pickerFixed ? { top: pickerTop } : undefined}
            >
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setPickerMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold capitalize">
                  {new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(pickerMonth)}
                </span>
                <button
                  onClick={() => setPickerMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Weekday headers */}
              <div className="grid grid-cols-7 mb-1">
                {PICKER_WEEKDAYS.map((l) => (
                  <div key={l} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                    {l}
                  </div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7 gap-y-0.5">
                {getMonthDays(pickerMonth).map((day, i) => {
                  if (!day) return <div key={`e-${i}`} />;
                  const isToday_ = isSameDay(day, todayDate);
                  const isInSelectedWeek =
                    viewMode === "week" && isSameDay(startOfWeek(day), weekStart);
                  const isSelectedDay =
                    viewMode === "day" && isSameDay(day, currentDate);

                  let cls = "hover:bg-muted text-foreground";
                  if (isToday_) {
                    cls = "bg-primary text-primary-foreground font-bold";
                  } else if (isSelectedDay || isInSelectedWeek) {
                    cls = "bg-primary/10 text-primary font-medium";
                  }

                  return (
                    <button
                      key={day.getTime()}
                      onClick={() => handlePickerSelect(day)}
                      className={`h-8 w-full rounded text-xs transition-colors ${cls}`}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Filtro por doctor — oculto en modo doctor individual */}
        {!lockedDoctor && (
          <Select value={selectedDoctorId} onValueChange={(v) => v && setSelectedDoctorId(v)}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <span data-slot="select-value" className="flex flex-1 text-left truncate">
                {selectedDoctorId === "todos"
                  ? "Todos los doctores"
                  : (activeDoctors.find((d) => d.id === selectedDoctorId)?.nombre ?? "Todos los doctores")}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los doctores</SelectItem>
              {activeDoctors.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Toggle vista */}
        <div className="flex rounded-md border overflow-hidden">
          <Button
            variant={viewMode === "day" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 rounded-none gap-1.5"
            onClick={() => { navigateTo(todayDate); setViewMode("day"); }}
          >
            <Calendar className="h-3.5 w-3.5" />
            Día
          </Button>
          <Button
            variant={viewMode === "week" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 rounded-none border-l gap-1.5"
            onClick={() => setViewMode("week")}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Semana
          </Button>
        </div>

        {/* Nueva cita / Bloquear / Adelantar */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Nueva cita
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => setBloqueoOpen(true)}
          >
            <Ban className="h-3.5 w-3.5" />
            Bloquear
          </Button>
          {!lockedDoctor && (
            <Link href="/adelantar">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 border-teal-300 text-teal-700 hover:bg-teal-50"
              >
                <Zap className="h-3.5 w-3.5" />
                Adelantar
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── Aviso de bloqueo por pago ── */}
      {blockedDoctors.length > 0 && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-start gap-2.5">
          <Ban className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 leading-relaxed">
            <span className="font-semibold">Acceso suspendido por falta de pago: </span>
            {blockedDoctors.map((d) => d.nombre).join(", ")}.
            {" "}Contacte al administrador para regularizar.
          </div>
        </div>
      )}

      {/* ── Cuerpo del calendario ── */}
      <div className="flex-1 overflow-hidden relative">
        {/* Marca de agua */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <Image
            src="/Menta-Sana_solo_logo.png"
            alt=""
            width={420}
            height={420}
            className="w-[680px] h-auto opacity-[0.08]"
          />
        </div>

        {isPending && (
          <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center">
            <div className="bg-background/75 backdrop-blur-[2px] rounded-full px-3 py-1.5 flex items-center gap-2 shadow text-xs text-muted-foreground">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/50 border-t-foreground animate-spin" />
              Cargando...
            </div>
          </div>
        )}

        {viewMode === "day" ? (
          <CalendarDayView
            date={currentDate}
            today={todayDate}
            doctors={visibleDoctors}
            allDoctors={doctors}
            citas={citas}
            horarios={horarios}
            onCitaClick={setDetailCita}
            onSlotClick={handleSlotClick}
            onReschedule={handleReschedule}
          />
        ) : (
          <CalendarWeekView
            startDate={weekStart}
            today={todayDate}
            doctors={visibleDoctors}
            allDoctors={doctors}
            citas={citas}
            horarios={horarios}
            onCitaClick={setDetailCita}
            onDayClick={handleDayClick}
            onSlotClick={handleSlotClick}
            onReschedule={handleReschedule}
          />
        )}
      </div>

      {/* Dialogs */}
      <NuevaCitaDialog
        key={dialogOpen ? "cita-open" : "cita-closed"}
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setDialogPreset(null); }}
        doctors={activeDoctors}
        pacientes={pacientes}
        defaultDoctorId={selectedDoctorId !== "todos" ? selectedDoctorId : undefined}
        defaultFecha={dialogPreset?.fecha}
        defaultHora={dialogPreset?.hora}
        onCreated={handleCitaCreated}
      />

      <BloquearHorasDialog
        key={bloqueoOpen ? "bloqueo-open" : "bloqueo-closed"}
        open={bloqueoOpen}
        onClose={() => { setBloqueoOpen(false); setBloqueoPreset(null); }}
        doctors={activeDoctors}
        defaultDoctorId={selectedDoctorId !== "todos" ? selectedDoctorId : undefined}
        defaultFecha={bloqueoPreset?.fecha}
        defaultHoraInicio={bloqueoPreset?.hora}
        onCreated={handleCitaUpdated}
      />

      <CitaDetailSheet
        key={detailCita?.id ?? "none"}
        cita={detailCita}
        onClose={() => setDetailCita(null)}
        onUpdate={handleCitaUpdated}
      />

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[200] bg-foreground text-background text-sm px-4 py-3 rounded-lg shadow-xl font-medium flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
          <svg className="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          {toast}
        </div>
      )}
    </div>
  );
}
