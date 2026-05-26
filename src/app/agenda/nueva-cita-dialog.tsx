"use client";

import { useEffect, useMemo, useState } from "react";
import { createCita, createPaciente, getHorasDisponibles, getUbicacionesParaCita } from "./actions";
import type { DoctorBasic, PacienteBasic } from "./types";
import { TIPOS_DOCUMENTO } from "./types";
import { toDateStr, bogotaToISO } from "./utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { X, Search, Stethoscope, User, Plus, ArrowLeft, MapPin, MonitorSmartphone, Video } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  doctors: DoctorBasic[];
  pacientes: PacienteBasic[];
  defaultDoctorId?: string;
  defaultFecha?: string;  // "YYYY-MM-DD"
  defaultHora?: string;   // "HH:MM"
  onCreated: () => Promise<void>;
}

type SlotInfo = { hora: string; ocupado: boolean };
type UbicacionBasic = { id: string; nombre: string; direccion: string | null; telefono: string | null; maps_url: string | null; es_virtual: boolean };

export default function NuevaCitaDialog({
  open,
  onClose,
  doctors,
  pacientes,
  defaultDoctorId,
  defaultFecha,
  defaultHora,
  onCreated,
}: Props) {
  const [doctorId, setDoctorId] = useState(defaultDoctorId ?? "");
  const [fecha, setFecha] = useState(() => defaultFecha ?? toDateStr(new Date()));
  const [hora, setHora] = useState(defaultHora ?? "");
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [duracion, setDuracion] = useState(30);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [ubicaciones, setUbicaciones] = useState<UbicacionBasic[]>([]);
  const [ubicacionId, setUbicacionId] = useState("");

  // Patient search
  const [pacienteSearch, setPacienteSearch] = useState("");
  const [selectedPaciente, setSelectedPaciente] = useState<PacienteBasic | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Inline new patient
  const [creatingNew, setCreatingNew] = useState(false);
  const [newNombre, setNewNombre] = useState("");
  const [newTelefono, setNewTelefono] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCedula, setNewCedula] = useState("");
  const [newTipoDoc, setNewTipoDoc] = useState("CC");
  const [savingNew, setSavingNew] = useState(false);
  const [newError, setNewError] = useState("");

  const [meetLink, setMeetLink] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isVirtual = ubicaciones.find((u) => u.id === ubicacionId)?.es_virtual ?? false;
  const meetLinkValido = !isVirtual || meetLink.startsWith("https://meet.google.com/");

  // Fetch ubicaciones when doctor changes
  useEffect(() => {
    if (!doctorId) { setUbicaciones([]); setUbicacionId(""); return; }
    getUbicacionesParaCita(doctorId).then((ubs) => {
      setUbicaciones(ubs);
      // Pre-select principal consultorio if available
      setUbicacionId(ubs.length > 0 ? ubs[0].id : "");
    });
  }, [doctorId]);

  // Limpiar meet link cuando cambia a ubicación no virtual
  useEffect(() => {
    if (!isVirtual) setMeetLink("");
  }, [isVirtual]);

  // Fetch slots when doctor or date changes
  useEffect(() => {
    if (!doctorId || !fecha) { setSlots([]); return; }
    setLoadingSlots(true);
    const [y, mo, d] = fecha.split("-").map(Number);
    const dayStartISO = bogotaToISO(y, mo, d, 0, 0);
    getHorasDisponibles(doctorId, fecha, dayStartISO).then(({ slots: s, duracionCita }) => {
      setSlots(s);
      if (duracionCita) setDuracion(duracionCita);
      setLoadingSlots(false);
      setHora((prev) => (s.some((sl) => sl.hora === prev) ? prev : ""));
    });
  }, [doctorId, fecha]);

  // Verifica si la duración elegida cruza algún slot ocupado, no solo el de inicio
  const slotOcupado = useMemo(() => {
    if (!hora) return false;
    const [h, m] = hora.split(":").map(Number);
    const startMin = h * 60 + m;
    const endMin = startMin + duracion;
    return slots.some((s) => {
      const [sh, sm] = s.hora.split(":").map(Number);
      const sMin = sh * 60 + sm;
      return s.ocupado && sMin < endMin && sMin + 30 > startMin;
    });
  }, [hora, duracion, slots]);

  const filteredPacientes = useMemo(() => {
    const q = pacienteSearch.trim().toLowerCase();
    if (!q) return pacientes.slice(0, 8);
    return pacientes
      .filter((p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.cedula ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.telefono ?? "").includes(q)
      )
      .slice(0, 8);
  }, [pacientes, pacienteSearch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!doctorId || !selectedPaciente || !fecha || !hora) return;
    if (slotOcupado) return;
    setSaving(true);
    setError("");
    const [fy, fm, fd] = fecha.split("-").map(Number);
    const [fh, fmin] = hora.split(":").map(Number);
    const inicioISO = bogotaToISO(fy, fm, fd, fh, fmin);
    const finISO = new Date(new Date(inicioISO).getTime() + duracion * 60000).toISOString();
    const result = await createCita({
      doctorId,
      pacienteId: selectedPaciente.id,
      inicioISO,
      finISO,
      motivo,
      ubicacionId: ubicacionId === "__principal__" ? null : (ubicacionId || null),
      meetLink: isVirtual ? meetLink : null,
    });
    if (result.error) {
      setError(result.error);
      setSaving(false);
    } else {
      await onCreated();
      onClose();
    }
  }

  async function handleCreatePaciente() {
    if (!newNombre.trim()) return;
    setSavingNew(true);
    setNewError("");
    const result = await createPaciente({
      nombre: newNombre,
      telefono: newTelefono || undefined,
      email: newEmail || undefined,
      cedula: newCedula || undefined,
      tipo_documento: newCedula.trim() ? newTipoDoc : undefined,
    });
    setSavingNew(false);
    if (result.error) {
      setNewError(result.error);
    } else if (result.data) {
      setSelectedPaciente(result.data);
      setCreatingNew(false);
      setNewNombre("");
      setNewTelefono("");
      setNewEmail("");
      setNewCedula("");
      setNewTipoDoc("CC");
      setPacienteSearch("");
      setShowDropdown(false);
    }
  }

  const canSubmit = !!doctorId && !!selectedPaciente && !!fecha && !!hora && !saving && !slotOcupado && meetLinkValido;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="text-lg">Nueva cita</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* ── Profesional y horario ── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Profesional y horario
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">
                      Doctor <span className="text-destructive">*</span>
                    </Label>
                    <Select value={doctorId} onValueChange={(v) => v && setDoctorId(v)}>
                      <SelectTrigger>
                        <span data-slot="select-value" className="flex flex-1 text-left truncate">
                          {doctorId
                            ? (doctors.find((d) => d.id === doctorId)?.nombre ?? "Seleccionar...")
                            : "Seleccionar..."}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {doctors.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.nombre}
                            {d.especialidad && (
                              <span className="text-muted-foreground ml-1.5 text-xs">
                                · {d.especialidad}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="fecha" className="text-sm">
                      Fecha <span className="text-destructive">*</span>
                    </Label>
                    <input
                      id="fecha"
                      type="date"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                </div>

                {/* Slots de hora */}
                <div className="space-y-2">
                  <Label className="text-sm">
                    Hora <span className="text-destructive">*</span>
                  </Label>

                  {!doctorId || !fecha ? (
                    <p className="text-xs text-muted-foreground py-1">
                      Selecciona un doctor y una fecha para ver los horarios disponibles.
                    </p>
                  ) : loadingSlots ? (
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-7 w-14 rounded-md bg-muted animate-pulse" />
                      ))}
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1">
                      No hay horarios disponibles para esta fecha.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {slots.map((s) => {
                          const isSelected = hora === s.hora;
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
                              onClick={() => setHora(s.hora)}
                              className={cls}
                              title={s.ocupado ? "Hora ocupada — cita extra" : undefined}
                            >
                              {s.hora}
                            </button>
                          );
                        })}
                      </div>

                      {/* Leyenda y aviso de cruce */}
                      {slots.some((s) => s.ocupado) && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-600">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400 shrink-0" />
                          Hora ocupada
                        </div>
                      )}
                      {slotOcupado && (
                        <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-md px-2.5 py-2">
                          Esta hora ya tiene una cita agendada. Selecciona otra hora disponible.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Duración */}
                <div className="space-y-2">
                  <Label className="text-sm">Duración</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {[30, 45, 60, 90, 120].map((min) => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setDuracion(min)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                          duracion === min
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-input hover:bg-muted"
                        }`}
                      >
                        {min >= 60 ? `${min / 60}h` : `${min}min`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Consultorio */}
                {ubicaciones.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">Consultorio</Label>
                    <Select value={ubicacionId} onValueChange={(v) => setUbicacionId(v ?? "")}>
                      <SelectTrigger>
                        <span data-slot="select-value" className="flex flex-1 text-left truncate text-sm">
                          {ubicacionId
                            ? (() => {
                                const u = ubicaciones.find((x) => x.id === ubicacionId);
                                return u ? u.nombre : "Seleccionar...";
                              })()
                            : <span className="text-muted-foreground">Seleccionar consultorio...</span>}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {ubicaciones.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            <span className="flex items-center gap-1.5">
                              {u.es_virtual
                                ? <MonitorSmartphone className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                                : <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                              {u.nombre}
                              {u.id === "__principal__" && (
                                <span className="text-muted-foreground text-xs">· Principal</span>
                              )}
                              {u.id !== "__principal__" && !u.es_virtual && u.direccion && (
                                <span className="text-muted-foreground text-xs">· {u.direccion}</span>
                              )}
                              {u.es_virtual && (
                                <span className="text-teal-600 text-xs">· Virtual</span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Link de Google Meet — solo citas virtuales */}
                {isVirtual && (
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5">
                      <Video className="h-3.5 w-3.5 text-blue-600" />
                      Link de Google Meet <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={meetLink}
                      onChange={(e) => setMeetLink(e.target.value.trim())}
                      placeholder="https://meet.google.com/abc-defg-hij"
                      className={`text-sm ${meetLink && !meetLinkValido ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    />
                    {meetLink && !meetLinkValido && (
                      <p className="text-xs text-destructive">El link debe empezar con https://meet.google.com/</p>
                    )}
                    {!meetLink && (
                      <p className="text-xs text-muted-foreground">
                        Crea la reunión en{" "}
                        <a href="https://meet.google.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                          meet.google.com
                        </a>
                        {" "}→ &ldquo;Crear una reunión para más tarde&rdquo;
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t" />

              {/* ── Paciente ── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Paciente
                  </span>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">
                    Paciente <span className="text-destructive">*</span>
                  </Label>

                  {selectedPaciente ? (
                    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5 bg-muted/40">
                      <div>
                        <p className="text-sm font-medium">{selectedPaciente.nombre}</p>
                        <div className="flex gap-2 mt-0.5">
                          {selectedPaciente.cedula && (
                            <p className="text-xs text-muted-foreground">
                              {selectedPaciente.tipo_documento ?? "CC"} {selectedPaciente.cedula}
                            </p>
                          )}
                          {selectedPaciente.telefono && (
                            <p className="text-xs text-muted-foreground">{selectedPaciente.telefono}</p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedPaciente(null)}
                        aria-label="Cambiar paciente"
                        className="text-muted-foreground hover:text-foreground ml-2 p-0.5 rounded transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                  ) : creatingNew ? (
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setCreatingNew(false); setNewError(""); }}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Volver a buscar"
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </button>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Nuevo paciente
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">
                            Nombre <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            value={newNombre}
                            onChange={(e) => setNewNombre(e.target.value)}
                            placeholder="Nombre completo"
                            autoFocus
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Documento <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                          <div className="flex gap-1.5">
                            <Select value={newTipoDoc} onValueChange={(v) => v && setNewTipoDoc(v)}>
                              <SelectTrigger className="h-8 text-sm w-[72px] shrink-0 px-2">
                                <span data-slot="select-value">{newTipoDoc}</span>
                              </SelectTrigger>
                              <SelectContent>
                                {TIPOS_DOCUMENTO.map((t) => (
                                  <SelectItem key={t.value} value={t.value}>
                                    {t.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              value={newCedula}
                              onChange={(e) => setNewCedula(e.target.value)}
                              placeholder="123456789"
                              className="h-8 text-sm flex-1"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Teléfono <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                          <Input
                            value={newTelefono}
                            onChange={(e) => setNewTelefono(e.target.value)}
                            placeholder="+57 300 000 0000"
                            type="tel"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Correo <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                          <Input
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="correo@ejemplo.com"
                            type="email"
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      {newError && <p className="text-xs text-destructive">{newError}</p>}

                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCreatePaciente}
                        disabled={!newNombre.trim() || savingNew}
                        className="w-full"
                      >
                        {savingNew ? "Creando..." : "Crear y seleccionar"}
                      </Button>
                    </div>

                  ) : (
                    <div className="space-y-1.5">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          placeholder="Buscar paciente por nombre..."
                          value={pacienteSearch}
                          onChange={(e) => {
                            setPacienteSearch(e.target.value);
                            setShowDropdown(true);
                          }}
                          onFocus={() => setShowDropdown(true)}
                          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                          className="pl-8"
                          autoComplete="off"
                        />
                        {showDropdown && (
                          <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg overflow-hidden">
                            <div className="max-h-44 overflow-y-auto">
                              {filteredPacientes.length > 0 ? (
                                filteredPacientes.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors border-b last:border-b-0"
                                    onMouseDown={() => {
                                      setSelectedPaciente(p);
                                      setPacienteSearch("");
                                      setShowDropdown(false);
                                    }}
                                  >
                                    <span className="font-medium">{p.nombre}</span>
                                    <span className="flex gap-2 mt-0.5">
                                      {p.cedula && (
                                        <span className="text-muted-foreground text-xs">
                                          {p.tipo_documento ?? "CC"} {p.cedula}
                                        </span>
                                      )}
                                      {p.telefono && (
                                        <span className="text-muted-foreground text-xs">{p.telefono}</span>
                                      )}
                                      {p.email && !p.cedula && !p.telefono && (
                                        <span className="text-muted-foreground text-xs">{p.email}</span>
                                      )}
                                    </span>
                                  </button>
                                ))
                              ) : pacienteSearch.length > 0 ? (
                                <div className="px-3 py-2.5 text-sm text-muted-foreground">
                                  No se encontró &ldquo;{pacienteSearch}&rdquo;
                                </div>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2.5 text-sm font-medium text-primary flex items-center gap-2 border-t hover:bg-muted transition-colors"
                              onMouseDown={() => {
                                setCreatingNew(true);
                                setNewNombre(pacienteSearch);
                                setShowDropdown(false);
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              {pacienteSearch.trim()
                                ? `Crear "${pacienteSearch.trim()}"`
                                : "Crear nuevo paciente"}
                            </button>
                          </div>
                        )}
                      </div>

                      {!showDropdown && (
                        <button
                          type="button"
                          onClick={() => setCreatingNew(true)}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <Plus className="h-3 w-3" />
                          Crear nuevo paciente
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Motivo */}
                <div className="space-y-1.5">
                  <Label htmlFor="motivo" className="text-sm">
                    Motivo{" "}
                    <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                  </Label>
                  <Textarea
                    id="motivo"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Motivo de consulta, observaciones..."
                    rows={3}
                    className="resize-none"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* ── Footer ── */}
            <DialogFooter className="px-6 py-4 border-t bg-background shrink-0 gap-2">
              <Button variant="outline" type="button" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {saving ? "Guardando..." : "Crear cita"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </>
  );
}
