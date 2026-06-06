"use client";

import { useEffect, useRef, useState } from "react";
import { updateEstado, reagendar, deleteCita, getHorasDisponibles, sendConfirmacionEmail, getUbicacionParaCita, updateCitaTarifa, getPagos, createPago, updatePago, deletePago } from "./actions";
import { getPlantillaRecordatorio, savePlantillaRecordatorio } from "@/app/configuracion/actions";
import { DEFAULT_PLANTILLA_RECORDATORIO } from "@/app/configuracion/constants";
import type { CitaConRel, EstadoCita, MetodoPago, Pago } from "./types";
import { ESTADO_CONFIG, METODOS_PAGO } from "./types";
import { durationMinutes, formatTime, toDateStr, bogotaToISO, parseTS } from "./utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  CalendarDays,
  Clock,
  Stethoscope,
  Mail,
  MapPin,
  Video,
  Trash2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  DollarSign,
  Pencil,
  Check,
  X as XIcon,
  Plus,
} from "lucide-react";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

const DURATION_OPTIONS = [15, 20, 30, 45, 60, 90, 120];

function normalizarTelefono(tel: string): string {
  const digits = tel.replace(/\D/g, "");
  return digits.startsWith("57") ? digits : "57" + digits;
}

const VARS_RECORDATORIO = [
  { key: "{paciente}", label: "Nombre del paciente" },
  { key: "{doctor}",   label: "Título + nombre del especialista" },
  { key: "{fecha}",    label: "Fecha de la cita" },
  { key: "{hora}",     label: "Hora de la cita" },
] as const;

function urlRecordatorio(
  tel: string,
  paciente: string,
  titulo: string | null,
  doctor: string,
  fecha: string,
  hora: string,
  plantilla: string,
  lugar?: { nombre: string | null; direccion: string | null } | null,
  meetLink?: string | null,
) {
  const prefijo = titulo ?? "Dr.";
  let msg = plantilla
    .replace(/\{paciente\}/g, paciente)
    .replace(/\{doctor\}/g, `${prefijo} ${doctor}`)
    .replace(/\{fecha\}/g, fecha)
    .replace(/\{hora\}/g, hora);
  if (meetLink) {
    msg += `\n\nCita virtual\nLink de la videollamada: ${meetLink}`;
  } else {
    if (lugar?.nombre) msg += `\n\nLugar: ${lugar.nombre}`;
    if (lugar?.direccion) msg += `\nDirección: ${lugar.direccion}`;
  }
  return `https://wa.me/${normalizarTelefono(tel)}?text=${encodeURIComponent(msg)}`;
}

function urlChat(tel: string) {
  return `https://wa.me/${normalizarTelefono(tel)}`;
}

type Action = "" | "confirmar" | "cancelar" | "reagendar";

interface Props {
  cita: CitaConRel | null;
  onClose: () => void;
  onUpdate: () => Promise<void>;
}

export default function CitaDetailSheet({ cita, onClose, onUpdate }: Props) {
  const [estado, setEstado] = useState<EstadoCita>("programada");
  const [action, setAction] = useState<Action>("");
  const [saving, setSaving] = useState(false);

  // Reagendar form
  const [reschedFecha, setReschedFecha] = useState("");
  const [reschedHora, setReschedHora] = useState("");
  const [reschedDur, setReschedDur] = useState(30);
  const [reschedSlots, setReschedSlots] = useState<{ hora: string; ocupado: boolean }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingDelete, setSavingDelete] = useState(false);

  // Email
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");

  // Ubicación para mensaje de WhatsApp
  const [ubicacionWA, setUbicacionWA] = useState<{ nombre: string | null; direccion: string | null; mapsUrl: string | null } | null>(null);

  // Plantilla de recordatorio
  const [plantillaRec, setPlantillaRec] = useState(DEFAULT_PLANTILLA_RECORDATORIO);
  const [editandoPlantilla, setEditandoPlantilla] = useState(false);
  const [savingPlantilla, setSavingPlantilla] = useState(false);
  const [plantillaSaved, setPlantillaSaved] = useState(false);
  const plantillaRef = useRef<HTMLTextAreaElement>(null);

  // Tarifa inline edit
  const [editingTarifa, setEditingTarifa] = useState(false);
  const [tarifaInput, setTarifaInput] = useState("");
  const [savingTarifa, setSavingTarifa] = useState(false);

  // Pagos
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loadingPagos, setLoadingPagos] = useState(false);
  const [showPagoForm, setShowPagoForm] = useState(false);
  const [editingPagoId, setEditingPagoId] = useState<string | null>(null);
  // Pago form state
  const [pagoMonto, setPagoMonto] = useState("");
  const [pagoMetodo, setPagoMetodo] = useState<MetodoPago>("efectivo");
  const [pagoFecha, setPagoFecha] = useState("");
  const [pagoRef, setPagoRef] = useState("");
  const [pagoNotas, setPagoNotas] = useState("");
  const [savingPago, setSavingPago] = useState(false);
  const [pagoError, setPagoError] = useState("");

  const [error, setError] = useState("");

  useEffect(() => {
    if (!cita) return;
    setEstado(cita.estado);
    setAction("");
    setError("");
    setConfirmDelete(false);
    setEmailSent(false);
    setEmailError("");
    setReschedFecha(toDateStr(parseTS(cita.inicio)));
    setReschedHora("");
    setReschedDur(durationMinutes(cita.inicio, cita.fin));
    setReschedSlots([]);
    setUbicacionWA(null);
    getUbicacionParaCita(cita.doctores.id, cita.id).then(setUbicacionWA);
    getPlantillaRecordatorio().then(setPlantillaRec);
    setEditandoPlantilla(false);
    // Tarifa
    setEditingTarifa(false);
    setTarifaInput(cita.tarifa != null ? String(cita.tarifa) : "");
    // Pagos
    setShowPagoForm(false);
    setEditingPagoId(null);
    setPagoError("");
    setLoadingPagos(true);
    getPagos(cita.id).then((p) => { setPagos(p); setLoadingPagos(false); });
  }, [cita?.id]);

  // Load slots when date changes in reagendar mode
  useEffect(() => {
    if (action !== "reagendar" || !cita || !reschedFecha) return;
    setLoadingSlots(true);
    setReschedHora("");
    const [y, mo, d] = reschedFecha.split("-").map(Number);
    getHorasDisponibles(cita.doctor_id, reschedFecha, bogotaToISO(y, mo, d, 0, 0), cita.id).then(
      ({ slots }) => { setReschedSlots(slots); setLoadingSlots(false); }

    );
  }, [reschedFecha, action, cita?.doctor_id, cita?.id]);

  async function handleAction(val: Action) {
    setAction(val);
    setError("");
    if (val === "confirmar" || val === "cancelar") {
      const nuevoEstado: EstadoCita = val === "confirmar" ? "confirmada" : "cancelada";
      setSaving(true);
      const r = await updateEstado(cita!.id, nuevoEstado);
      setSaving(false);
      if (r.error) { setError(r.error); setAction(""); }
      else { setEstado(nuevoEstado); setAction(""); await onUpdate(); }
    }
  }

  async function handleReagendar() {
    if (!cita || !reschedFecha || !reschedHora) return;
    setSaving(true);
    setError("");
    const [ry, rm, rd] = reschedFecha.split("-").map(Number);
    const [rh, rmin] = reschedHora.split(":").map(Number);
    const newISOStart = bogotaToISO(ry, rm, rd, rh, rmin);
    const r = await reagendar(cita.id, newISOStart, new Date(new Date(newISOStart).getTime() + reschedDur * 60000).toISOString());
    setSaving(false);
    if (r.error) { setError(r.error); }
    else { await onUpdate(); onClose(); }
  }

  async function handleDelete() {
    if (!cita) return;
    setSavingDelete(true);
    const r = await deleteCita(cita.id);
    if (r.error) { setError(r.error); setSavingDelete(false); }
    else { await onUpdate(); onClose(); }
  }

  async function handleSaveTarifa() {
    if (!cita) return;
    setSavingTarifa(true);
    const val = tarifaInput.trim() !== "" ? parseFloat(tarifaInput) : null;
    await updateCitaTarifa(cita.id, val);
    setSavingTarifa(false);
    setEditingTarifa(false);
    await onUpdate();
  }

  function openPagoForm(pago?: Pago) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    if (pago) {
      setEditingPagoId(pago.id);
      setPagoMonto(String(pago.monto));
      setPagoMetodo(pago.metodo_pago);
      setPagoFecha(pago.fecha_pago.slice(0, 10));
      setPagoRef(pago.referencia ?? "");
      setPagoNotas(pago.notas ?? "");
    } else {
      setEditingPagoId(null);
      setPagoMonto(cita?.tarifa != null ? String(cita.tarifa) : "");
      setPagoMetodo("efectivo");
      setPagoFecha(today);
      setPagoRef("");
      setPagoNotas("");
    }
    setPagoError("");
    setShowPagoForm(true);
  }

  function closePagoForm() {
    setShowPagoForm(false);
    setEditingPagoId(null);
    setPagoError("");
  }

  function insertarVarPlantilla(variable: string) {
    const el = plantillaRef.current;
    if (!el) { setPlantillaRec((p) => p + variable); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = plantillaRec.slice(0, start) + variable + plantillaRec.slice(end);
    setPlantillaRec(next);
    requestAnimationFrame(() => {
      el.selectionStart = start + variable.length;
      el.selectionEnd = start + variable.length;
      el.focus();
    });
  }

  async function handleGuardarPlantilla() {
    setSavingPlantilla(true);
    await savePlantillaRecordatorio(plantillaRec);
    setSavingPlantilla(false);
    setPlantillaSaved(true);
    setTimeout(() => setPlantillaSaved(false), 2500);
  }

  async function handleSavePago() {
    if (!cita || !pagoMonto.trim()) return;
    const monto = parseFloat(pagoMonto);
    if (isNaN(monto) || monto <= 0) { setPagoError("Ingresa un monto válido."); return; }
    setSavingPago(true);
    setPagoError("");
    if (editingPagoId) {
      const r = await updatePago(editingPagoId, { monto, metodoPago: pagoMetodo, fechaPago: pagoFecha, referencia: pagoRef || null, notas: pagoNotas || null });
      if (r.error) { setPagoError(r.error); setSavingPago(false); return; }
      setPagos((prev) => prev.map((p) => p.id === editingPagoId ? { ...p, monto, metodo_pago: pagoMetodo, fecha_pago: pagoFecha, referencia: pagoRef || null, notas: pagoNotas || null } : p));
    } else {
      const r = await createPago({ citaId: cita.id, pacienteId: cita.paciente_id, doctorId: cita.doctor_id, monto, metodoPago: pagoMetodo, fechaPago: pagoFecha, referencia: pagoRef || null, notas: pagoNotas || null });
      if (r.error) { setPagoError(r.error); setSavingPago(false); return; }
      if (r.data) setPagos((prev) => [...prev, r.data!]);
    }
    setSavingPago(false);
    closePagoForm();
  }

  async function handleDeletePago(id: string) {
    const r = await deletePago(id);
    if (!r.error) setPagos((prev) => prev.filter((p) => p.id !== id));
  }

  if (!cita) return null;

  const dt = parseTS(cita.inicio);
  const endDt = parseTS(cita.fin);
  const dur = durationMinutes(cita.inicio, cita.fin);
  const ec = ESTADO_CONFIG[estado];
  const isBloqueada = cita.estado === "bloqueada";
  const tel = cita.pacientes?.telefono ?? null;

  const totalPagado = pagos.reduce((s, p) => s + Number(p.monto), 0);
  const saldoPendiente = cita.tarifa != null ? cita.tarifa - totalPagado : null;
  const estadoPago =
    pagos.length === 0 ? "pendiente"
    : cita.tarifa != null && totalPagado >= cita.tarifa ? "pagado"
    : "parcial";

  const dateLabel = new Intl.DateTimeFormat("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "America/Bogota",
  }).format(dt);

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const c = cita!;
  async function handleSendEmail() {
    if (!c.pacientes?.email) return;
    setEmailLoading(true);
    setEmailError("");
    const r = await sendConfirmacionEmail({
      citaId: c.id,
      doctorId: c.doctor_id,
      to: c.pacientes.email,
      paciente: c.pacientes.nombre,
      doctor: c.doctores.nombre,
      fecha: dateLabel,
      hora: formatTime(dt),
      motivo: c.motivo ?? null,
      token: c.token_confirmacion ?? null,
    });
    setEmailLoading(false);
    if (r.error) setEmailError(r.error);
    else setEmailSent(true);
  }

  return (
    <Sheet open={!!cita} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0 overflow-hidden">

        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-base leading-tight">
                {isBloqueada ? "Horario bloqueado" : (cita.pacientes?.nombre ?? "Cita")}
              </SheetTitle>
              {!isBloqueada && cita.pacientes && (
                <SheetDescription className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {cita.pacientes.cedula && (
                    <span className="text-xs">CC {cita.pacientes.cedula}</span>
                  )}
                  {tel && <span className="text-xs">{tel}</span>}
                  {cita.pacientes.email && (
                    <span className="text-xs">{cita.pacientes.email}</span>
                  )}
                </SheetDescription>
              )}
            </div>
            <Badge variant="outline" className={`${ec.bg} ${ec.text} ${ec.border} shrink-0 mt-0.5`}>
              {ec.label}
            </Badge>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Info */}
          <div className="px-6 py-4 space-y-3 border-b">
            <div className="flex items-center gap-3 text-sm">
              <Stethoscope className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium">{cita.doctores.nombre}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="capitalize">{dateLabel}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>
                {formatTime(dt)} – {formatTime(endDt)}
                <span className="text-muted-foreground ml-1.5">({dur} min)</span>
              </span>
            </div>
            {cita.meet_link ? (
              <div className="flex items-start gap-3 text-sm">
                <Video className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-1.5">
                  <span className="font-medium text-blue-700">Cita virtual</span>
                  <a
                    href={cita.meet_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 w-full px-3 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    Unirse a la videollamada
                  </a>
                </div>
              </div>
            ) : ubicacionWA && (ubicacionWA.nombre || ubicacionWA.direccion) ? (
              <div className="flex items-start gap-3 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  {ubicacionWA.nombre && <span className="font-medium">{ubicacionWA.nombre}</span>}
                  {ubicacionWA.direccion && (
                    <p className="text-muted-foreground text-xs mt-0.5">{ubicacionWA.direccion}</p>
                  )}
                  {ubicacionWA.mapsUrl && (
                    <a
                      href={ubicacionWA.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline mt-0.5 inline-block"
                    >
                      Ver en mapa
                    </a>
                  )}
                </div>
              </div>
            ) : null}
            {cita.motivo && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                {cita.motivo}
              </p>
            )}

            {/* Tarifa */}
            {!isBloqueada && (
              <div className="flex items-center gap-3 text-sm">
                <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                {editingTarifa ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={tarifaInput}
                      onChange={(e) => setTarifaInput(e.target.value)}
                      placeholder="ej: 150000"
                      className="h-7 text-sm w-32"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSaveTarifa}
                      disabled={savingTarifa}
                      className="text-teal-700 hover:text-teal-800 p-0.5"
                      title="Guardar"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingTarifa(false); setTarifaInput(cita.tarifa != null ? String(cita.tarifa) : ""); }}
                      className="text-muted-foreground hover:text-foreground p-0.5"
                      title="Cancelar"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={cita.tarifa != null ? "font-medium" : "text-muted-foreground/60"}>
                      {cita.tarifa != null ? `$${Number(cita.tarifa).toLocaleString("es-CO")}` : "Sin tarifa"}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setTarifaInput(cita.tarifa != null ? String(cita.tarifa) : ""); setEditingTarifa(true); }}
                      className="text-muted-foreground hover:text-foreground p-0.5"
                      title="Editar tarifa"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Contacto — WhatsApp y correo */}
          {!isBloqueada && (
            <div className="px-6 py-4 border-b">
              {tel || cita.pacientes?.email ? (
                <div className="space-y-2">
                  {tel && (
                    <div className="space-y-1.5">
                      <div className="flex gap-2">
                        <a
                          href={urlRecordatorio(tel, cita.pacientes!.nombre, cita.doctores.titulo, cita.doctores.nombre, dateLabel, formatTime(dt), plantillaRec, ubicacionWA, cita.meet_link ?? null)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonVariants({ variant: "outline", size: "sm" }) +
                            " flex-1 gap-1.5 text-green-700 border-green-600/40 hover:bg-green-50 hover:text-green-800 justify-center"}
                        >
                          <WhatsAppIcon className="h-3.5 w-3.5 shrink-0" />
                          Recordatorio
                        </a>
                        <a
                          href={urlChat(tel)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonVariants({ variant: "outline", size: "sm" }) +
                            " flex-1 gap-1.5 text-green-700 border-green-600/40 hover:bg-green-50 hover:text-green-800 justify-center"}
                        >
                          <WhatsAppIcon className="h-3.5 w-3.5 shrink-0" />
                          Escribir
                        </a>
                      </div>

                      {/* Editor de plantilla de recordatorio */}
                      <button
                        onClick={() => setEditandoPlantilla((v) => !v)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-end pt-0.5"
                      >
                        <Pencil className="h-3 w-3" />
                        Personalizar mensaje
                        {editandoPlantilla
                          ? <ChevronUp className="h-3 w-3" />
                          : <ChevronDown className="h-3 w-3" />}
                      </button>

                      {editandoPlantilla && (
                        <div className="rounded-md border bg-muted/30 p-3 space-y-2.5">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1.5">
                              Insertar variable en la posición del cursor:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {VARS_RECORDATORIO.map((v) => (
                                <button
                                  key={v.key}
                                  onClick={() => insertarVarPlantilla(v.key)}
                                  title={v.label}
                                  className="px-2 py-0.5 rounded-full border border-teal-300 bg-teal-50 text-teal-700 text-xs font-mono hover:bg-teal-100 transition-colors"
                                >
                                  + {v.key}
                                </button>
                              ))}
                            </div>
                          </div>

                          <textarea
                            ref={plantillaRef}
                            value={plantillaRec}
                            onChange={(e) => setPlantillaRec(e.target.value)}
                            rows={3}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />

                          <div className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground whitespace-pre-wrap">
                            <span className="font-medium text-foreground">Vista previa:{"\n"}</span>
                            {(() => {
                              let preview = plantillaRec
                                .replace(/\{paciente\}/g, cita.pacientes?.nombre ?? "Paciente")
                                .replace(/\{doctor\}/g, `${cita.doctores.titulo ?? "Dr."} ${cita.doctores.nombre}`)
                                .replace(/\{fecha\}/g, dateLabel)
                                .replace(/\{hora\}/g, formatTime(dt));
                              if (cita.meet_link) {
                                preview += `\n\nCita virtual\nLink de la videollamada: ${cita.meet_link}`;
                              } else if (ubicacionWA?.nombre || ubicacionWA?.direccion) {
                                if (ubicacionWA.nombre) preview += `\n\nLugar: ${ubicacionWA.nombre}`;
                                if (ubicacionWA.direccion) preview += `\nDirección: ${ubicacionWA.direccion}`;
                              }
                              return preview;
                            })()}
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={handleGuardarPlantilla}
                              disabled={savingPlantilla}
                              className="bg-teal-600 hover:bg-teal-700 text-white h-7 text-xs"
                            >
                              {savingPlantilla ? "Guardando…" : "Guardar"}
                            </Button>
                            {plantillaSaved && (
                              <span className="flex items-center gap-1 text-xs text-emerald-600">
                                <Check className="h-3.5 w-3.5" /> Guardado
                              </span>
                            )}
                            <button
                              onClick={() => setEditandoPlantilla(false)}
                              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                            >
                              Cerrar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {cita.pacientes?.email && (
                    <button
                      onClick={handleSendEmail}
                      disabled={emailLoading || emailSent}
                      className={buttonVariants({ variant: "outline", size: "sm" }) +
                        ` w-full gap-1.5 justify-center ${
                          emailSent
                            ? "text-green-700 border-green-500/40"
                            : "text-blue-700 border-blue-500/40 hover:bg-blue-50 hover:text-blue-800"
                        }`}
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {emailLoading ? "Enviando..." : emailSent ? "Enviado ✓" : "Recordatorio correo"}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-1">
                  Sin teléfono ni correo registrado
                </p>
              )}
              {emailError && (
                <p className="mt-2 text-xs text-destructive">{emailError}</p>
              )}
            </div>
          )}

          {/* Acciones */}
          {!isBloqueada && (
            <div className="px-6 py-4 border-b space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Acción
                </Label>
                <Select
                  value={action}
                  onValueChange={(v) => v && handleAction(v as Action)}
                  disabled={saving}
                >
                  <SelectTrigger className="w-full">
                    <span data-slot="select-value" className="flex flex-1 items-center gap-2 text-left">
                      {saving ? "Guardando..." : (
                        action === "" ? <span className="text-muted-foreground">Seleccionar acción...</span>
                        : action === "confirmar" ? "Confirmar cita"
                        : action === "cancelar" ? "Cancelar cita"
                        : "Reagendar cita"
                      )}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmar">✓ Confirmar cita</SelectItem>
                    <SelectItem value="cancelar">✕ Cancelar cita</SelectItem>
                    <SelectItem value="reagendar">↻ Reagendar cita</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Formulario de reagendar */}
              {action === "reagendar" && (
                <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                  {/* Doctor y paciente (read-only) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Especialista</Label>
                      <p className="text-sm font-medium truncate">{cita.doctores.nombre}</p>
                    </div>
                    {cita.pacientes && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Paciente</Label>
                        <p className="text-sm font-medium truncate">{cita.pacientes.nombre}</p>
                      </div>
                    )}
                  </div>

                  {/* Duración */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Duración</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {DURATION_OPTIONS.map((min) => (
                        <button
                          key={min}
                          type="button"
                          onClick={() => setReschedDur(min)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                            reschedDur === min
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-input hover:bg-muted"
                          }`}
                        >
                          {min >= 60 ? `${min / 60}h` : `${min}min`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fecha */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nueva fecha</Label>
                    <input
                      type="date"
                      value={reschedFecha}
                      onChange={(e) => setReschedFecha(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>

                  {/* Slots */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Hora</Label>
                    {loadingSlots ? (
                      <div className="flex gap-1.5">
                        {[1,2,3,4].map(i => <div key={i} className="h-7 w-14 rounded-md bg-muted animate-pulse" />)}
                      </div>
                    ) : reschedSlots.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1">No hay horarios disponibles para esta fecha.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {reschedSlots.map((s) => {
                          const isSelected = reschedHora === s.hora;
                          let cls = "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ";
                          if (s.ocupado) {
                            cls += isSelected
                              ? "bg-amber-500 text-white border-amber-500"
                              : "bg-amber-50 border-amber-400 text-amber-700 hover:bg-amber-100";
                          } else {
                            cls += isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-input hover:bg-muted";
                          }
                          return (
                            <button
                              key={s.hora}
                              type="button"
                              onClick={() => setReschedHora(s.hora)}
                              className={cls}
                              title={s.ocupado ? "Hora ocupada — cita extra" : undefined}
                            >
                              {s.hora}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {error && <p className="text-xs text-destructive">{error}</p>}

                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => { setAction(""); setError(""); }}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={handleReagendar}
                      disabled={!reschedFecha || !reschedHora || saving}
                    >
                      {saving ? "Guardando..." : "Confirmar"}
                    </Button>
                  </div>
                </div>
              )}

              {error && action !== "reagendar" && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </div>
          )}

          {/* Pagos */}
          {!isBloqueada && (
            <div className="px-6 py-4 border-b space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold">Pago</span>
                  {pagos.length > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      estadoPago === "pagado" ? "bg-emerald-100 text-emerald-700"
                      : estadoPago === "parcial" ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                    }`}>
                      {estadoPago === "pagado" ? "Pagado" : estadoPago === "parcial" ? "Parcial" : "Pendiente"}
                    </span>
                  )}
                </div>
                {!showPagoForm && (
                  <button
                    type="button"
                    onClick={() => openPagoForm()}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Registrar pago
                  </button>
                )}
              </div>

              {loadingPagos ? (
                <p className="text-xs text-muted-foreground">Cargando...</p>
              ) : (
                <>
                  {pagos.length > 0 && (
                    <div className="space-y-2">
                      {pagos.map((p) => (
                        <div key={p.id} className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2 bg-muted/20 text-sm">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">${Number(p.monto).toLocaleString("es-CO")}</span>
                              <span className="text-xs text-muted-foreground capitalize">
                                {METODOS_PAGO.find((m) => m.value === p.metodo_pago)?.label ?? p.metodo_pago}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(p.fecha_pago + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                              {p.referencia && ` · ${p.referencia}`}
                            </p>
                            {p.notas && <p className="text-xs text-muted-foreground italic">{p.notas}</p>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openPagoForm(p)}
                              className="text-muted-foreground hover:text-foreground p-0.5"
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePago(p.id)}
                              className="text-muted-foreground hover:text-destructive p-0.5"
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {saldoPendiente != null && (
                        <div className="flex justify-between items-center px-1 text-xs text-muted-foreground">
                          <span>Total pagado: <span className="font-medium text-foreground">${totalPagado.toLocaleString("es-CO")}</span></span>
                          <span className={saldoPendiente <= 0 ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
                            {saldoPendiente <= 0 ? "Sin saldo pendiente" : `Saldo: $${saldoPendiente.toLocaleString("es-CO")}`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {pagos.length === 0 && !showPagoForm && (
                    <p className="text-xs text-muted-foreground">No hay pagos registrados.</p>
                  )}

                  {showPagoForm && (
                    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {editingPagoId ? "Editar pago" : "Nuevo pago"}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Monto (COP)</label>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={pagoMonto}
                            onChange={(e) => setPagoMonto(e.target.value)}
                            placeholder="150000"
                            className="h-8 text-sm"
                            autoFocus
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Método</label>
                          <select
                            value={pagoMetodo}
                            onChange={(e) => setPagoMetodo(e.target.value as MetodoPago)}
                            className="flex h-8 w-full rounded-lg border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            {METODOS_PAGO.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Fecha de pago</label>
                        <input
                          type="date"
                          value={pagoFecha}
                          onChange={(e) => setPagoFecha(e.target.value)}
                          className="flex h-8 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Referencia <span className="font-normal">(opcional)</span></label>
                        <Input
                          value={pagoRef}
                          onChange={(e) => setPagoRef(e.target.value)}
                          placeholder="# transferencia, recibo..."
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Notas <span className="font-normal">(opcional)</span></label>
                        <Input
                          value={pagoNotas}
                          onChange={(e) => setPagoNotas(e.target.value)}
                          placeholder="Observaciones..."
                          className="h-8 text-sm"
                        />
                      </div>
                      {pagoError && <p className="text-xs text-destructive">{pagoError}</p>}
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={closePagoForm} disabled={savingPago}>
                          Cancelar
                        </Button>
                        <Button type="button" size="sm" className="flex-1 h-8 text-xs" onClick={handleSavePago} disabled={!pagoMonto.trim() || !pagoFecha || savingPago}>
                          {savingPago ? "Guardando..." : editingPagoId ? "Actualizar" : "Registrar"}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Eliminar */}
          <div className="px-6 py-4">
            {!confirmDelete ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isBloqueada ? "Eliminar bloqueo" : "Eliminar cita"}
              </Button>
            ) : (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 space-y-3">
                <p className="text-sm font-medium text-destructive">
                  ¿{isBloqueada ? "Eliminar este bloqueo" : "Eliminar esta cita"}?
                </p>
                <p className="text-xs text-muted-foreground">Esta acción no se puede deshacer.</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmDelete(false)} disabled={savingDelete}>
                    Cancelar
                  </Button>
                  <Button variant="destructive" size="sm" className="flex-1" onClick={handleDelete} disabled={savingDelete}>
                    {savingDelete ? "Eliminando..." : "Sí, eliminar"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
