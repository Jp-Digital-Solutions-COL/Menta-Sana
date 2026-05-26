"use client";

import { useState, useEffect } from "react";
import { getCandidatos, type CandidatoAdelantar } from "./actions";
import type { DoctorBasic } from "@/app/agenda/types";
import { startOfWeek, addDays } from "@/app/agenda/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle2,
} from "lucide-react";

const TZ = "America/Bogota";
const SESSION_KEY = "adelantar_contactados";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "HH:MM" → "2:30 p.m." / "9:00 a.m." */
function hora12(horaStr: string): string {
  const [h, m] = horaStr.split(":").map(Number);
  const ampm = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** "YYYY-MM-DD" → "domingo 24 de mayo" (sin coma) */
function fechaNatural(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const diaSemana = DIAS[new Date(y, m - 1, d).getDay()];
  return `${diaSemana} ${d} de ${MESES_ES[m - 1]}`;
}

/** ISO de la cita del paciente → "hoy" | "mañana" | "15 de junio" */
function labelFechaPaciente(iso: string): string {
  const fecha = fechaBogota(iso);
  const hoy = fechaBogota(new Date().toISOString());
  const manana = fechaBogota(new Date(Date.now() + 86400000).toISOString());
  if (fecha === hoy) return "hoy";
  if (fecha === manana) return "mañana";
  const [, m, d] = fecha.split("-").map(Number);
  return `${d} de ${MESES_ES[m - 1]}`;
}

function normalizarTel(tel: string): string {
  const limpio = tel.replace(/[\s\-\(\)\.]/g, "");
  if (limpio.startsWith("+57")) return limpio.slice(1);
  if (limpio.startsWith("57")) return limpio;
  return `57${limpio}`;
}

function fechaBogota(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(
    new Date(iso)
  );
}

function horaBogota(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function labelCita(iso: string): string {
  const fecha = fechaBogota(iso);
  const hoy = fechaBogota(new Date().toISOString());
  const manana = fechaBogota(new Date(Date.now() + 86400000).toISOString());
  const hora = horaBogota(iso);
  if (fecha === hoy) return `Hoy ${hora}`;
  if (fecha === manana) return `Mañana ${hora}`;
  const d = new Intl.DateTimeFormat("es-CO", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
  return `${d} ${hora}`;
}

function semanaLabel(lunes: Date): string {
  const domingo = addDays(lunes, 6);
  const fmtCorto = (d: Date) =>
    new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(d);
  const fmtLargo = (d: Date) =>
    new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  return `${fmtCorto(lunes)} – ${fmtLargo(domingo)}`;
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

interface Props {
  doctors: DoctorBasic[];
}

export default function AdelatarClient({ doctors }: Props) {
  const [doctorId, setDoctorId] = useState("");
  const [espacioFecha, setEspacioFecha] = useState("");
  const [espacioHora, setEspacioHora] = useState("");
  const [modoPeriodo, setModoPeriodo] = useState<"semana" | "rango">("semana");
  const [semanaLunes, setSemanaLunes] = useState<Date | null>(null);
  const [desdeStr, setDesdeStr] = useState("");
  const [hastaStr, setHastaStr] = useState("");
  const [candidatos, setCandidatos] = useState<CandidatoAdelantar[]>([]);
  const [buscado, setBuscado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contacted, setContacted] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) setContacted(new Set(JSON.parse(stored)));
    } catch {}
  }, []);

  const canSearch =
    !!doctorId &&
    !!espacioFecha &&
    !!espacioHora &&
    (modoPeriodo === "semana"
      ? semanaLunes !== null
      : !!(desdeStr && hastaStr && desdeStr <= hastaStr));

  async function handleBuscar() {
    if (!canSearch) return;
    setLoading(true);
    setBuscado(false);

    const espacioISO = `${espacioFecha}T${espacioHora}:00`;
    let desdeISO: string, hastaISO: string;

    if (modoPeriodo === "semana" && semanaLunes) {
      desdeISO = `${toYMD(semanaLunes)}T00:00:00`;
      hastaISO = `${toYMD(addDays(semanaLunes, 6))}T23:59:59`;
    } else {
      desdeISO = `${desdeStr}T00:00:00`;
      hastaISO = `${hastaStr}T23:59:59`;
    }

    const result = await getCandidatos(doctorId, espacioISO, desdeISO, hastaISO);
    setCandidatos(result);
    setBuscado(true);
    setLoading(false);
  }

  function markContacted(citaId: string) {
    const next = new Set(contacted);
    next.add(citaId);
    setContacted(next);
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify([...next]));
    } catch {}
  }

  const doctorSeleccionado = doctors.find((d) => d.id === doctorId);

  function buildWAUrl(telefono: string, pacienteNombre: string, citaInicio: string): string {
    const tel = normalizarTel(telefono);

    // Primer nombre del paciente
    const primerNombre = pacienteNombre.split(" ")[0];

    // Etiqueta del doctor
    const doctorLabel = doctorSeleccionado
      ? doctorSeleccionado.titulo
        ? `${doctorSeleccionado.titulo} ${doctorSeleccionado.nombre}`
        : `el/la doctor(a) ${doctorSeleccionado.nombre}`
      : "el doctor";

    // Fecha del espacio liberado
    const hoyStr = fechaBogota(new Date().toISOString());
    const mananaStr = fechaBogota(new Date(Date.now() + 86400000).toISOString());
    const natural = espacioFecha ? fechaNatural(espacioFecha) : "";
    const prefijoEspacio = espacioFecha === hoyStr
      ? `hoy ${natural}`
      : espacioFecha === mananaStr
        ? `mañana ${natural}`
        : `el ${natural}`;

    // Hora en formato 12h
    const horaFormateada = hora12(espacioHora);

    // Fecha de la cita actual del paciente
    const fechaCitaPaciente = labelFechaPaciente(citaInicio);

    const mensaje =
      `Hola ${primerNombre}, le escribimos del consultorio de ${doctorLabel}. ` +
      `Se abrió un espacio disponible ${prefijoEspacio} a las ${horaFormateada}. ` +
      `Vimos que su cita está agendada para ${fechaCitaPaciente}; si desea, podemos adelantarla a este nuevo horario. ` +
      `¿Le sirve? Quedamos atentos para confirmar.`;

    return `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
  }

  if (doctors.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        No tienes doctores asignados.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Adelantar citas</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Contacta pacientes cuando se libera un espacio en la agenda.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-5">
          {/* Doctor */}
          <div className="space-y-2">
            <Label>
              Doctor <span className="text-destructive">*</span>
            </Label>
            <Select value={doctorId} onValueChange={(v) => v && setDoctorId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar doctor" />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nombre}
                    {d.especialidad ? ` — ${d.especialidad}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Espacio liberado */}
          <div className="space-y-2">
            <Label>
              Espacio liberado <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={espacioFecha}
                onChange={(e) => setEspacioFecha(e.target.value)}
                className="flex-1"
              />
              <Input
                type="time"
                value={espacioHora}
                onChange={(e) => setEspacioHora(e.target.value)}
                className="w-32"
              />
            </div>
          </div>

          {/* Período */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>
                Período de búsqueda <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-1 ml-auto">
                {(["semana", "rango"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setModoPeriodo(m)}
                    className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                      modoPeriodo === m
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {m === "semana" ? "Semana" : "Rango"}
                  </button>
                ))}
              </div>
            </div>

            {modoPeriodo === "semana" ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() =>
                    setSemanaLunes(
                      semanaLunes
                        ? addDays(semanaLunes, -7)
                        : addDays(startOfWeek(new Date()), -7)
                    )
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 text-center text-sm min-w-0">
                  {semanaLunes ? (
                    semanaLabel(semanaLunes)
                  ) : (
                    <span className="text-muted-foreground">
                      Sin período seleccionado
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() =>
                    setSemanaLunes(
                      semanaLunes
                        ? addDays(semanaLunes, 7)
                        : startOfWeek(new Date())
                    )
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 items-center">
                <Input
                  type="date"
                  value={desdeStr}
                  onChange={(e) => setDesdeStr(e.target.value)}
                  className="flex-1"
                />
                <span className="text-muted-foreground text-sm shrink-0">–</span>
                <Input
                  type="date"
                  value={hastaStr}
                  onChange={(e) => setHastaStr(e.target.value)}
                  className="flex-1"
                />
              </div>
            )}
          </div>

          <Button
            className="w-full gap-2 bg-teal-600 hover:bg-teal-700 text-white"
            disabled={!canSearch || loading}
            onClick={handleBuscar}
          >
            <Search className="h-4 w-4" />
            {loading ? "Buscando..." : "Buscar candidatos"}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {buscado && (
        <div className="space-y-3">
          {candidatos.length === 0 ? (
            <p className="text-center py-10 text-sm text-muted-foreground">
              No hay pacientes candidatos en este período.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {candidatos.length}{" "}
                {candidatos.length === 1 ? "candidato" : "candidatos"}
              </p>
              <div className="space-y-2">
                {candidatos.map((c) => {
                  const pac = c.pacientes;
                  if (!pac) return null;
                  const isContacted = contacted.has(c.id);
                  const waUrl = pac.telefono
                    ? buildWAUrl(pac.telefono, pac.nombre, c.inicio)
                    : null;

                  return (
                    <Card
                      key={c.id}
                      className={isContacted ? "opacity-60" : ""}
                    >
                      <CardContent className="py-3 px-4 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {pac.nombre}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {labelCita(c.inicio)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isContacted && (
                            <Badge
                              variant="outline"
                              className="text-[10px] gap-1 text-teal-700 border-teal-300 bg-teal-50 hidden sm:flex"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Contactado
                            </Badge>
                          )}
                          {waUrl ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => markContacted(c.id)}
                            >
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">WhatsApp</span>
                              </Button>
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Sin teléfono
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
