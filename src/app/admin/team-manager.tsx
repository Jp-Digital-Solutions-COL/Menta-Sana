"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  getAllSecretarias,
  createSecretaria,
  assignSecretariaToConsultorio,
  toggleSecretariaActivo,
  updateSecretaria,
  getDoctoresAdmin,
  createDoctorAdmin,
  updateDoctorAdmin,
  toggleDoctorActivoAdmin,
  toggleDoctorBloqueadoPago,
  getDoctoresConsultorio,
  getAsignaciones,
  toggleAsignacion,
  getDoctoresCuentas,
  createCuentaDoctor,
  resetPasswordForUser,
  resetPasswordForDoctor,
  type SecretariaGlobal,
  type DoctorAdmin,
  type DoctorItem,
  type AsignacionItem,
} from "./actions";
import { convertToWebP, uploadToCloudinary } from "@/lib/cloudinary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Lock,
  LockOpen,
  Loader2,
  Pencil,
  Plus,
  Search,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import { CollapsibleSection } from "./admin-client";
import type { ConsultorioAdmin } from "./admin-client";

// ── Phone helpers ──────────────────────────────────────────────────────

const COUNTRIES = [
  { code: "+57",  flag: "🇨🇴", name: "Colombia" },
  { code: "+52",  flag: "🇲🇽", name: "México" },
  { code: "+1",   flag: "🇺🇸", name: "EE.UU. / Canadá" },
  { code: "+54",  flag: "🇦🇷", name: "Argentina" },
  { code: "+55",  flag: "🇧🇷", name: "Brasil" },
  { code: "+56",  flag: "🇨🇱", name: "Chile" },
  { code: "+51",  flag: "🇵🇪", name: "Perú" },
  { code: "+593", flag: "🇪🇨", name: "Ecuador" },
  { code: "+58",  flag: "🇻🇪", name: "Venezuela" },
  { code: "+591", flag: "🇧🇴", name: "Bolivia" },
  { code: "+595", flag: "🇵🇾", name: "Paraguay" },
  { code: "+598", flag: "🇺🇾", name: "Uruguay" },
  { code: "+507", flag: "🇵🇦", name: "Panamá" },
  { code: "+506", flag: "🇨🇷", name: "Costa Rica" },
  { code: "+502", flag: "🇬🇹", name: "Guatemala" },
  { code: "+504", flag: "🇭🇳", name: "Honduras" },
  { code: "+503", flag: "🇸🇻", name: "El Salvador" },
  { code: "+505", flag: "🇳🇮", name: "Nicaragua" },
  { code: "+34",  flag: "🇪🇸", name: "España" },
  { code: "+44",  flag: "🇬🇧", name: "Reino Unido" },
] as const;

type CountryCode = (typeof COUNTRIES)[number]["code"];

function parsePhone(telefono: string | null): { code: CountryCode; local: string } {
  if (!telefono) return { code: "+57", local: "" };
  // Match longest prefix first to avoid +59 shadowing +593/+595/+598
  const sorted = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);
  const found = sorted.find((c) => telefono.startsWith(c.code));
  return found
    ? { code: found.code, local: telefono.slice(found.code.length) }
    : { code: "+57", local: telefono };
}

interface Props {
  consultorios: ConsultorioAdmin[];
}

// ── Helpers ────────────────────────────────────────────────────────────

function getInitials(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// ── Toggle pill ────────────────────────────────────────────────────────

function TogglePill({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none ${
        checked ? "bg-green-500" : "bg-muted-foreground/30"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ── Secretaria row (expandable, shows doctor assignments) ──────────────

function SecretariaRow({
  sec,
  doctors,
  asignadas,
  consultorios,
  onToggleActivo,
  onAssignConsultorio,
  onToggleDoctor,
  onOpen,
  onEditSave,
}: {
  sec: SecretariaGlobal;
  doctors: DoctorItem[];
  asignadas: Set<string>;
  consultorios: ConsultorioAdmin[];
  onToggleActivo: (id: string, activo: boolean) => void;
  onAssignConsultorio: (id: string, consultorioId: string | null) => void;
  onToggleDoctor: (secId: string, docId: string, asignar: boolean) => void;
  onOpen: (consultorioId: string | null) => void;
  onEditSave: (id: string, nombre: string, telefono: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [savingActivo, setSavingActivo] = useState(false);
  const [savingConsultorio, setSavingConsultorio] = useState(false);

  // Password reset state
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [resetPwSent, setResetPwSent] = useState(false);
  const [resetPwError, setResetPwError] = useState("");

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editNombre, setEditNombre] = useState(sec.nombre);
  const [editPhone, setEditPhone] = useState(() => parsePhone(sec.telefono));
  const [editPassword, setEditPassword] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSaved, setEditSaved] = useState(false);

  async function handleToggleActivo(v: boolean) {
    setSavingActivo(true);
    await onToggleActivo(sec.id, v);
    setSavingActivo(false);
  }

  async function handleResetPassword() {
    setResetPwLoading(true);
    setResetPwError("");
    const r = await resetPasswordForUser(sec.email);
    setResetPwLoading(false);
    if (r.error) {
      setResetPwError(r.error);
    } else {
      setResetPwSent(true);
      setTimeout(() => setResetPwSent(false), 3000);
    }
  }

  async function handleAssignConsultorio(val: string) {
    setSavingConsultorio(true);
    await onAssignConsultorio(sec.id, val === "__none__" ? null : val);
    setSavingConsultorio(false);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditLoading(true);
    setEditError("");
    const fullPhone = editPhone.local.trim()
      ? editPhone.code + editPhone.local.trim()
      : null;
    const r = await updateSecretaria(sec.id, {
      nombre: editNombre,
      telefono: fullPhone,
      password: editPassword || undefined,
    });
    setEditLoading(false);
    if (r.error) { setEditError(r.error); return; }
    setEditSaved(true);
    setEditPassword("");
    onEditSave(sec.id, editNombre.trim(), fullPhone);
    setTimeout(() => setEditSaved(false), 2000);
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${!sec.activo ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Expand toggle */}
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next) onOpen(sec.consultorio_id);
          }}
          title="Ver asignaciones"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{sec.nombre || sec.email}</p>
          {sec.nombre && <p className="text-xs text-muted-foreground truncate">{sec.email}</p>}
          {sec.telefono && (
            <p className="text-xs text-muted-foreground/70 truncate">{sec.telefono}</p>
          )}
        </div>

        {/* Consultorio selector */}
        <div className="shrink-0">
          {savingConsultorio ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Select
              value={sec.consultorio_id ?? "__none__"}
              onValueChange={(v) => v && handleAssignConsultorio(v)}
            >
              <SelectTrigger className="h-7 text-xs w-[130px] border-dashed">
                <span data-slot="select-value" className="truncate">
                  {sec.consultorio_nombre ?? "Sin consultorio"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin consultorio</SelectItem>
                {consultorios.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Edit button */}
        <button
          type="button"
          title="Editar secretaria"
          onClick={() => { setEditOpen((v) => !v); setEditError(""); setEditSaved(false); if (!open) { setOpen(true); onOpen(sec.consultorio_id); } }}
          className={`h-6 w-6 flex items-center justify-center rounded-md border transition-colors shrink-0 ${editOpen ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"}`}
        >
          <Pencil className="h-3 w-3" />
        </button>

        {/* Reset password button */}
        <button
          type="button"
          title={resetPwSent ? "Correo enviado" : "Restablecer contraseña"}
          onClick={handleResetPassword}
          disabled={resetPwLoading || resetPwSent}
          className={`h-6 w-6 flex items-center justify-center rounded-md border transition-colors shrink-0 ${
            resetPwSent
              ? "border-green-500 text-green-600 bg-green-50"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {resetPwLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <KeyRound className="h-3 w-3" />
          )}
        </button>
        {resetPwError && (
          <p className="text-xs text-destructive shrink-0 max-w-[120px] truncate" title={resetPwError}>
            {resetPwError}
          </p>
        )}

        {/* Activo toggle */}
        <TogglePill
          checked={sec.activo}
          onChange={handleToggleActivo}
          disabled={savingActivo}
        />
      </div>

      {/* Doctor assignments + edit */}
      {open && (
        <div className="border-t px-3 py-3 space-y-3 bg-muted/20">
          {/* Doctor checkboxes */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Doctores asignados</p>
            {doctors.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hay doctores en este consultorio.</p>
            ) : (
              doctors.map((doc) => (
                <label key={doc.id} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border accent-primary cursor-pointer"
                    checked={asignadas.has(doc.id)}
                    onChange={(e) => onToggleDoctor(sec.id, doc.id, e.target.checked)}
                  />
                  <span className="text-sm leading-none group-hover:text-foreground transition-colors">
                    {doc.nombre}
                    {doc.especialidad && (
                      <span className="text-muted-foreground ml-1 text-xs">· {doc.especialidad}</span>
                    )}
                  </span>
                  {!doc.activo && <span className="text-xs text-muted-foreground">(inactivo)</span>}
                </label>
              ))
            )}
          </div>

          {/* Edit form */}
          {editOpen && (
            <form
              onSubmit={handleSaveEdit}
              className="border rounded-md p-2.5 space-y-2 bg-background"
            >
              <p className="text-xs font-semibold text-muted-foreground">Editar secretaria</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Nombre</Label>
                  <Input
                    required
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    className="h-7 text-xs"
                    disabled={editLoading}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nueva contraseña (opcional)</Label>
                  <PasswordInput
                    minLength={6}
                    placeholder="Dejar vacío para no cambiar"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="h-7 text-xs"
                    disabled={editLoading}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Teléfono (opcional)</Label>
                <div className="flex">
                  <Select
                    value={editPhone.code}
                    onValueChange={(v) => v && setEditPhone((p) => ({ ...p, code: v as CountryCode }))}
                    disabled={editLoading}
                  >
                    <SelectTrigger className="h-7 text-xs rounded-r-none border-r-0 w-[88px] shrink-0 px-2 gap-1">
                      <span data-slot="select-value" className="flex items-center gap-1">
                        <span className="text-base leading-none">
                          {COUNTRIES.find((c) => c.code === editPhone.code)?.flag}
                        </span>
                        <span>{editPhone.code}</span>
                      </span>
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code} className="text-xs">
                          <span className="flex items-center gap-2">
                            <span className="text-base leading-none">{c.flag}</span>
                            <span className="font-mono">{c.code}</span>
                            <span className="text-muted-foreground">{c.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="tel"
                    placeholder="3001234567"
                    value={editPhone.local}
                    onChange={(e) => setEditPhone((p) => ({ ...p, local: e.target.value }))}
                    className="h-7 text-xs rounded-l-none border-l-0 flex-1"
                    disabled={editLoading}
                  />
                </div>
              </div>
              {editError && <p className="text-xs text-destructive">{editError}</p>}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs flex-1"
                  onClick={() => { setEditOpen(false); setEditError(""); setEditNombre(sec.nombre); setEditPhone(parsePhone(sec.telefono)); setEditPassword(""); }}
                  disabled={editLoading}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className={`h-6 text-xs flex-1 ${editSaved ? "bg-green-600 hover:bg-green-600" : ""}`}
                  disabled={editLoading || !editNombre.trim()}
                >
                  {editLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : editSaved ? "Guardado ✓" : "Guardar"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab "Secretarias" ──────────────────────────────────────────────────

function SecretariasTab({ consultorios }: { consultorios: ConsultorioAdmin[] }) {
  const [secretarias, setSecretarias] = useState<SecretariaGlobal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // New secretaria form
  const [formOpen, setFormOpen] = useState(false);
  const [secNombre, setSecNombre] = useState("");
  const [secEmail, setSecEmail] = useState("");
  const [secPassword, setSecPassword] = useState("");
  const [secConsultorioId, setSecConsultorioId] = useState("__none__");
  const [secLoading, setSecLoading] = useState(false);
  const [secError, setSecError] = useState("");

  // Doctor assignments per secretaria
  const [doctors, setDoctors] = useState<DoctorItem[]>([]);
  const [asignaciones, setAsignaciones] = useState<AsignacionItem[]>([]);
  const [selectedConsultorio, setSelectedConsultorio] = useState<string | null>(null);

  const loadSecretarias = useCallback(async () => {
    setLoading(true);
    const data = await getAllSecretarias();
    setSecretarias(data);
    setLoaded(true);
    setLoading(false);
  }, []);

  const loadDoctorsForConsultorio = useCallback(
    async (cid: string) => {
      const [docs, asigs] = await Promise.all([
        getDoctoresConsultorio(cid),
        getAsignaciones(cid),
      ]);
      setDoctors(docs);
      setAsignaciones(asigs);
      setSelectedConsultorio(cid);
    },
    []
  );

  useEffect(() => {
    loadSecretarias();
  }, [loadSecretarias]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return secretarias;
    return secretarias.filter(
      (s) =>
        s.nombre.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
    );
  }, [secretarias, search]);

  async function handleCreateSecretaria(e: React.FormEvent) {
    e.preventDefault();
    setSecLoading(true);
    setSecError("");
    const cid = secConsultorioId === "__none__" ? null : secConsultorioId;
    const r = await createSecretaria(cid, secEmail.trim(), secPassword, secNombre.trim());
    setSecLoading(false);
    if (r.error) {
      setSecError(r.error);
      return;
    }
    setSecNombre("");
    setSecEmail("");
    setSecPassword("");
    setSecConsultorioId("__none__");
    setFormOpen(false);
    await loadSecretarias();
  }

  async function handleToggleActivo(id: string, activo: boolean) {
    setSecretarias((prev) =>
      prev.map((s) => (s.id === id ? { ...s, activo } : s))
    );
    await toggleSecretariaActivo(id, activo);
  }

  async function handleAssignConsultorio(id: string, consultorioId: string | null) {
    const consultorio_nombre =
      consultorioId
        ? (consultorios.find((c) => c.id === consultorioId)?.nombre ?? null)
        : null;
    setSecretarias((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, consultorio_id: consultorioId, consultorio_nombre } : s
      )
    );
    await assignSecretariaToConsultorio(id, consultorioId);

    // Load doctors for that consultorio if needed
    if (consultorioId && consultorioId !== selectedConsultorio) {
      await loadDoctorsForConsultorio(consultorioId);
    }
  }

  function handleEditSave(id: string, nombre: string, telefono: string | null) {
    setSecretarias((prev) =>
      prev.map((s) => (s.id === id ? { ...s, nombre, telefono } : s))
    );
  }

  async function handleToggleDoctor(secId: string, docId: string, asignar: boolean) {
    // Ensure doctors are loaded for this secretaria's consultorio
    const sec = secretarias.find((s) => s.id === secId);
    if (sec?.consultorio_id && sec.consultorio_id !== selectedConsultorio) {
      await loadDoctorsForConsultorio(sec.consultorio_id);
    }

    setAsignaciones((prev) =>
      asignar
        ? [...prev, { secretaria_id: secId, doctor_id: docId }]
        : prev.filter((a) => !(a.secretaria_id === secId && a.doctor_id === docId))
    );
    const r = await toggleAsignacion(secId, docId, asignar);
    if (r.error) {
      setAsignaciones((prev) =>
        asignar
          ? prev.filter((a) => !(a.secretaria_id === secId && a.doctor_id === docId))
          : [...prev, { secretaria_id: secId, doctor_id: docId }]
      );
    }
  }

  const asignacionesMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of asignaciones) {
      if (!map.has(a.secretaria_id)) map.set(a.secretaria_id, new Set());
      map.get(a.secretaria_id)!.add(a.doctor_id);
    }
    return map;
  }, [asignaciones]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o correo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm pl-8"
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1 text-xs shrink-0"
          onClick={() => { setFormOpen((v) => !v); setSecError(""); }}
        >
          {formOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {formOpen ? "Cancelar" : "Nueva secretaria"}
        </Button>
      </div>

      {/* Create form */}
      {formOpen && (
        <form
          onSubmit={handleCreateSecretaria}
          className="border rounded-lg p-3 space-y-2.5 bg-muted/30"
        >
          <div className="grid sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-xs">Nombre completo</Label>
              <Input
                required
                autoFocus
                placeholder="Ana López"
                value={secNombre}
                onChange={(e) => setSecNombre(e.target.value)}
                className="h-8 text-sm"
                disabled={secLoading}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Correo</Label>
              <Input
                type="email"
                required
                placeholder="ana@ejemplo.com"
                value={secEmail}
                onChange={(e) => setSecEmail(e.target.value)}
                className="h-8 text-sm"
                disabled={secLoading}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contraseña</Label>
              <PasswordInput
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
                value={secPassword}
                onChange={(e) => setSecPassword(e.target.value)}
                className="h-8 text-sm"
                disabled={secLoading}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Consultorio (opcional)</Label>
              <Select
                value={secConsultorioId}
                onValueChange={(v) => v && setSecConsultorioId(v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <span data-slot="select-value" className="truncate">
                    {secConsultorioId === "__none__"
                      ? "Sin consultorio"
                      : (consultorios.find((c) => c.id === secConsultorioId)?.nombre ?? "Sin consultorio")}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin consultorio</SelectItem>
                  {consultorios.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {secError && <p className="text-xs text-destructive">{secError}</p>}

          <Button
            type="submit"
            size="sm"
            className="h-7 text-xs"
            disabled={secLoading}
          >
            {secLoading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Creando usuario...
              </>
            ) : (
              "Crear secretaria"
            )}
          </Button>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Cargando secretarias...</span>
        </div>
      ) : loaded && filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          {search ? "Sin resultados." : "No hay secretarias registradas."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((sec) => {
            const secDoctors =
              sec.consultorio_id === selectedConsultorio ? doctors : [];
            return (
              <SecretariaRow
                key={sec.id}
                sec={sec}
                doctors={secDoctors}
                asignadas={asignacionesMap.get(sec.id) ?? new Set()}
                consultorios={consultorios}
                onToggleActivo={handleToggleActivo}
                onAssignConsultorio={handleAssignConsultorio}
                onToggleDoctor={handleToggleDoctor}
                onEditSave={handleEditSave}
                onOpen={(cid) => {
                  if (cid && cid !== selectedConsultorio) loadDoctorsForConsultorio(cid);
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab "Doctores" ─────────────────────────────────────────────────────

function DoctoresTab({ consultorios }: { consultorios: ConsultorioAdmin[] }) {
  const [consultorioId, setConsultorioId] = useState("");
  const [doctors, setDoctors] = useState<DoctorAdmin[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  // New doctor form
  const [formOpen, setFormOpen] = useState(false);
  const [docNombre, setDocNombre] = useState("");
  const [docTitulo, setDocTitulo] = useState<string | null>(null);
  const [docEsp, setDocEsp] = useState("");
  const [docPhotoPreview, setDocPhotoPreview] = useState<string | null>(null);
  const [docPendingBlob, setDocPendingBlob] = useState<Blob | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cuentas de acceso doctor
  const [doctoresConAcceso, setDoctoresConAcceso] = useState<string[]>([]);
  const [accesoDocId, setAccesoDocId] = useState<string | null>(null);
  const [accesoEmail, setAccesoEmail] = useState("");
  const [accesoPassword, setAccesoPassword] = useState("");
  const [accesoLoading, setAccesoLoading] = useState(false);
  const [accesoError, setAccesoError] = useState("");

  // Password reset for doctor accounts
  const [resetDocLoading, setResetDocLoading] = useState<string | null>(null);
  const [resetDocSent, setResetDocSent] = useState<Set<string>>(new Set());
  const [resetDocError, setResetDocError] = useState<{ id: string; msg: string } | null>(null);

  // Edit doctor
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editDocNombre, setEditDocNombre] = useState("");
  const [editDocTitulo, setEditDocTitulo] = useState<string | null>(null);
  const [editDocEsp, setEditDocEsp] = useState("");
  const [editDocCurrentUrl, setEditDocCurrentUrl] = useState<string | null>(null);
  const [editDocPendingBlob, setEditDocPendingBlob] = useState<Blob | null>(null);
  const [editDocPreviewUrl, setEditDocPreviewUrl] = useState<string | null>(null);
  const [editDocRemovePhoto, setEditDocRemovePhoto] = useState(false);
  const [editDocLoading, setEditDocLoading] = useState(false);
  const [editDocUploading, setEditDocUploading] = useState(false);
  const [editDocError, setEditDocError] = useState("");
  const editFileInputRef = useRef<HTMLInputElement>(null);

  async function loadDoctors(cid: string) {
    setLoadingDoctors(true);
    const [data, cuentas] = await Promise.all([
      getDoctoresAdmin(cid),
      getDoctoresCuentas(cid),
    ]);
    setDoctors(data);
    setDoctoresConAcceso(cuentas);
    setLoadingDoctors(false);
  }

  function handleSelectConsultorio(cid: string) {
    setConsultorioId(cid);
    setDoctors([]);
    setFormOpen(false);
    setAccesoDocId(null);
    if (cid) loadDoctors(cid);
  }

  async function handleCrearAcceso(e: React.FormEvent) {
    e.preventDefault();
    if (!accesoDocId || !consultorioId) return;
    const doc = doctors.find((d) => d.id === accesoDocId);
    if (!doc) return;
    setAccesoLoading(true);
    setAccesoError("");
    const r = await createCuentaDoctor(
      accesoDocId,
      consultorioId,
      doc.nombre,
      accesoEmail.trim(),
      accesoPassword
    );
    setAccesoLoading(false);
    if (r.error) {
      setAccesoError(r.error);
    } else {
      setDoctoresConAcceso((prev) => [...prev, accesoDocId]);
      setAccesoDocId(null);
      setAccesoEmail("");
      setAccesoPassword("");
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setDocError("La imagen no puede pesar más de 10 MB.");
      return;
    }
    setDocError("");
    try {
      const blob = await convertToWebP(file);
      setDocPendingBlob(blob);
      if (docPhotoPreview) URL.revokeObjectURL(docPhotoPreview);
      setDocPhotoPreview(URL.createObjectURL(blob));
    } catch {
      setDocError("No se pudo procesar la imagen.");
    }
    e.target.value = "";
  }

  function handleRemovePhoto() {
    if (docPhotoPreview) URL.revokeObjectURL(docPhotoPreview);
    setDocPhotoPreview(null);
    setDocPendingBlob(null);
  }

  async function handleCreateDoctor(e: React.FormEvent) {
    e.preventDefault();
    if (!consultorioId) return;
    setDocLoading(true);
    setDocError("");

    let foto_url: string | null = null;
    if (docPendingBlob) {
      setDocUploading(true);
      try {
        foto_url = await uploadToCloudinary(docPendingBlob);
      } catch (err) {
        setDocError(err instanceof Error ? err.message : "No se pudo subir la foto.");
        setDocLoading(false);
        setDocUploading(false);
        return;
      }
      setDocUploading(false);
    }

    const r = await createDoctorAdmin(
      consultorioId,
      docNombre.trim(),
      docEsp.trim() || undefined,
      foto_url,
      docTitulo
    );
    setDocLoading(false);
    if (r.error) {
      setDocError(r.error);
      return;
    }

    if (docPhotoPreview) URL.revokeObjectURL(docPhotoPreview);
    setDocNombre("");
    setDocTitulo(null);
    setDocEsp("");
    setDocPhotoPreview(null);
    setDocPendingBlob(null);
    setFormOpen(false);
    await loadDoctors(consultorioId);
  }

  async function handleResetPasswordDoc(docId: string) {
    setResetDocLoading(docId);
    setResetDocError(null);
    const r = await resetPasswordForDoctor(docId);
    setResetDocLoading(null);
    if (r.error) {
      setResetDocError({ id: docId, msg: r.error });
    } else {
      setResetDocSent((prev) => new Set(prev).add(docId));
      setTimeout(
        () => setResetDocSent((prev) => { const s = new Set(prev); s.delete(docId); return s; }),
        3000
      );
    }
  }

  async function handleToggleActivo(id: string, activo: boolean) {
    setDoctors((prev) => prev.map((d) => (d.id === id ? { ...d, activo } : d)));
    const r = await toggleDoctorActivoAdmin(id, activo);
    if (r.error) {
      setDoctors((prev) => prev.map((d) => (d.id === id ? { ...d, activo: !activo } : d)));
    }
  }

  async function handleToggleBloqueado(id: string, bloqueado: boolean) {
    setDoctors((prev) =>
      prev.map((d) => (d.id === id ? { ...d, bloqueado_pago: bloqueado } : d))
    );
    const r = await toggleDoctorBloqueadoPago(id, bloqueado);
    if (r.error) {
      setDoctors((prev) =>
        prev.map((d) => (d.id === id ? { ...d, bloqueado_pago: !bloqueado } : d))
      );
    }
  }

  function handleStartEdit(doc: DoctorAdmin) {
    setEditingDocId(doc.id);
    setEditDocNombre(doc.nombre);
    setEditDocTitulo(doc.titulo ?? null);
    setEditDocEsp(doc.especialidad ?? "");
    setEditDocCurrentUrl(doc.foto_url);
    setEditDocPendingBlob(null);
    if (editDocPreviewUrl) URL.revokeObjectURL(editDocPreviewUrl);
    setEditDocPreviewUrl(null);
    setEditDocRemovePhoto(false);
    setEditDocError("");
    setFormOpen(false);
  }

  function handleCancelEdit() {
    if (editDocPreviewUrl) URL.revokeObjectURL(editDocPreviewUrl);
    setEditingDocId(null);
    setEditDocPreviewUrl(null);
    setEditDocPendingBlob(null);
    setEditDocError("");
  }

  async function handleEditFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setEditDocError("La imagen no puede pesar más de 10 MB."); return; }
    setEditDocError("");
    try {
      const blob = await convertToWebP(file);
      setEditDocPendingBlob(blob);
      if (editDocPreviewUrl) URL.revokeObjectURL(editDocPreviewUrl);
      setEditDocPreviewUrl(URL.createObjectURL(blob));
      setEditDocRemovePhoto(false);
    } catch { setEditDocError("No se pudo procesar la imagen."); }
    e.target.value = "";
  }

  function handleRemoveEditPhoto() {
    if (editDocPreviewUrl) URL.revokeObjectURL(editDocPreviewUrl);
    setEditDocPreviewUrl(null);
    setEditDocPendingBlob(null);
    setEditDocCurrentUrl(null);
    setEditDocRemovePhoto(true);
  }

  async function handleSaveEdit() {
    if (!editingDocId || !editDocNombre.trim()) return;
    setEditDocLoading(true);
    setEditDocError("");

    let foto_url: string | null | undefined = undefined;
    if (editDocPendingBlob) {
      setEditDocUploading(true);
      try {
        foto_url = await uploadToCloudinary(editDocPendingBlob);
      } catch (err) {
        setEditDocError(err instanceof Error ? err.message : "No se pudo subir la foto.");
        setEditDocLoading(false);
        setEditDocUploading(false);
        return;
      }
      setEditDocUploading(false);
    } else if (editDocRemovePhoto) {
      foto_url = null;
    }

    const r = await updateDoctorAdmin(editingDocId, {
      nombre: editDocNombre.trim(),
      titulo: editDocTitulo,
      especialidad: editDocEsp.trim() || null,
      foto_url,
    });
    setEditDocLoading(false);
    if (r.error) { setEditDocError(r.error); return; }

    const finalUrl = foto_url !== undefined ? foto_url : editDocCurrentUrl;
    setDoctors((prev) =>
      prev.map((d) =>
        d.id === editingDocId
          ? { ...d, nombre: editDocNombre.trim(), titulo: editDocTitulo, especialidad: editDocEsp.trim() || null, foto_url: finalUrl }
          : d
      )
    );
    if (editDocPreviewUrl) URL.revokeObjectURL(editDocPreviewUrl);
    setEditingDocId(null);
    setEditDocPreviewUrl(null);
    setEditDocPendingBlob(null);
  }

  return (
    <div className="space-y-3">
      {/* Consultorio select */}
      <Select value={consultorioId} onValueChange={(v) => v && handleSelectConsultorio(v)}>
        <SelectTrigger className="w-full sm:w-72">
          <span data-slot="select-value" className="flex flex-1 text-left truncate">
            {consultorioId
              ? (consultorios.find((c) => c.id === consultorioId)?.nombre ?? "Elige un consultorio...")
              : "Elige un consultorio..."}
          </span>
        </SelectTrigger>
        <SelectContent>
          {consultorios.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {consultorioId && (
        <>
          {/* Nueva doctor button */}
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-xs"
              onClick={() => { setFormOpen((v) => !v); setDocError(""); }}
            >
              {formOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {formOpen ? "Cancelar" : "Nuevo doctor"}
            </Button>
          </div>

          {/* Create form */}
          {formOpen && (
            <form
              onSubmit={handleCreateDoctor}
              className="border rounded-lg p-3 space-y-3 bg-muted/30"
            >
              {/* Avatar picker */}
              <div className="flex items-center gap-3">
                <div className="relative group shrink-0">
                  <div
                    className="w-16 h-16 rounded-full overflow-hidden bg-muted border-2 border-border flex items-center justify-center cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {docPhotoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={docPhotoPreview} alt="Foto" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="h-5 w-5 opacity-30" />
                    )}
                    <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <Camera className="h-4 w-4 text-white" />
                    </div>
                  </div>
                  {docPhotoPreview && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-primary hover:underline"
                >
                  {docPhotoPreview ? "Cambiar foto" : "Subir foto (opcional)"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Título (opcional)</Label>
                <div className="flex gap-1.5">
                  {(["Dr.", "Dra."] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={docLoading}
                      onClick={() => setDocTitulo(docTitulo === t ? null : t)}
                      className={`px-3 py-1 rounded-md border text-xs font-medium transition-colors ${
                        docTitulo === t
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-input hover:bg-muted"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs">Nombre</Label>
                  <Input
                    required
                    autoFocus
                    placeholder="García"
                    value={docNombre}
                    onChange={(e) => setDocNombre(e.target.value)}
                    className="h-8 text-sm"
                    disabled={docLoading}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Especialidad (opcional)</Label>
                  <Input
                    placeholder="Cardiología"
                    value={docEsp}
                    onChange={(e) => setDocEsp(e.target.value)}
                    className="h-8 text-sm"
                    disabled={docLoading}
                  />
                </div>
              </div>

              {docError && <p className="text-xs text-destructive">{docError}</p>}

              <Button
                type="submit"
                size="sm"
                className="h-7 text-xs"
                disabled={docLoading || !docNombre.trim()}
              >
                {docUploading ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    Subiendo foto...
                  </>
                ) : docLoading ? (
                  "Guardando..."
                ) : (
                  "Crear doctor"
                )}
              </Button>
            </form>
          )}

          {/* Hidden file input for edit */}
          <input
            ref={editFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleEditFileChange}
          />

          {/* Doctors list */}
          {loadingDoctors ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Cargando doctores...</span>
            </div>
          ) : doctors.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No hay doctores. Crea el primero.
            </p>
          ) : (
            <div className="space-y-2">
              {doctors.map((doc) => {
                const initials = getInitials(doc.nombre);
                const isEditing = editingDocId === doc.id;

                if (isEditing) {
                  const displayPhoto = editDocPreviewUrl ?? editDocCurrentUrl;
                  return (
                    <div key={doc.id} className="border rounded-lg p-3 space-y-2.5 bg-muted/30">
                      {/* Photo + name/specialty row */}
                      <div className="flex items-center gap-3">
                        <div className="relative group shrink-0">
                          <div
                            className="w-12 h-12 rounded-full overflow-hidden bg-muted border-2 border-border flex items-center justify-center cursor-pointer"
                            onClick={() => editFileInputRef.current?.click()}
                          >
                            {displayPhoto ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={displayPhoto} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-sm font-bold text-muted-foreground">{initials}</span>
                            )}
                            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                              <Camera className="h-3.5 w-3.5 text-white" />
                            </div>
                          </div>
                          {displayPhoto && (
                            <button
                              type="button"
                              onClick={handleRemoveEditPhoto}
                              className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Título (opcional)</Label>
                            <div className="flex gap-1.5">
                              {(["Dr.", "Dra."] as const).map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  disabled={editDocLoading}
                                  onClick={() => setEditDocTitulo(editDocTitulo === t ? null : t)}
                                  className={`px-2.5 py-0.5 rounded-md border text-xs font-medium transition-colors ${
                                    editDocTitulo === t
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "border-input hover:bg-muted"
                                  }`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Nombre</Label>
                              <Input
                                autoFocus
                                required
                                value={editDocNombre}
                                onChange={(e) => setEditDocNombre(e.target.value)}
                                className="h-7 text-xs"
                                disabled={editDocLoading}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Especialidad</Label>
                              <Input
                                placeholder="Opcional"
                                value={editDocEsp}
                                onChange={(e) => setEditDocEsp(e.target.value)}
                                className="h-7 text-xs"
                                disabled={editDocLoading}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      {editDocError && <p className="text-xs text-destructive">{editDocError}</p>}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1 h-7 text-xs"
                          onClick={handleCancelEdit}
                          disabled={editDocLoading}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1 h-7 text-xs"
                          onClick={handleSaveEdit}
                          disabled={editDocLoading || !editDocNombre.trim()}
                        >
                          {editDocUploading ? (
                            <><Loader2 className="h-3 w-3 animate-spin mr-1" />Subiendo...</>
                          ) : editDocLoading ? "Guardando..." : "Guardar"}
                        </Button>
                      </div>
                    </div>
                  );
                }

                const tieneAcceso = doctoresConAcceso.includes(doc.id);
                const mostrandoAcceso = accesoDocId === doc.id;

                return (
                  <div
                    key={doc.id}
                    className={`rounded-lg border text-sm ${
                      !doc.activo ? "opacity-60" : ""
                    } ${doc.bloqueado_pago ? "border-amber-300 bg-amber-50/50" : ""}`}
                  >
                    <div className="flex items-center gap-3 px-3 py-2.5">
                    {/* Avatar */}
                    <div className="h-8 w-8 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0">
                      {doc.foto_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={doc.foto_url} alt={doc.nombre} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-muted-foreground">{initials}</span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {doc.titulo && (
                          <span className="text-muted-foreground font-normal mr-1">{doc.titulo}</span>
                        )}
                        {doc.nombre}
                      </p>
                      {doc.especialidad && (
                        <p className="text-xs text-muted-foreground truncate">{doc.especialidad}</p>
                      )}
                    </div>

                    {/* Bloqueado badge */}
                    {doc.bloqueado_pago && (
                      <Badge
                        variant="outline"
                        className="text-xs border-amber-400 text-amber-700 bg-amber-50 shrink-0"
                      >
                        Sin pago
                      </Badge>
                    )}

                    {/* Acceso badge o botón */}
                    {tieneAcceso ? (
                      <span className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded px-2 py-0.5 shrink-0">
                        ✓ Tiene acceso
                      </span>
                    ) : (
                      <button
                        type="button"
                        title="Dar acceso al doctor"
                        onClick={() => {
                          setAccesoDocId(mostrandoAcceso ? null : doc.id);
                          setAccesoEmail("");
                          setAccesoPassword("");
                          setAccesoError("");
                        }}
                        className="text-xs text-primary hover:underline shrink-0"
                      >
                        {mostrandoAcceso ? "Cancelar" : "Dar acceso"}
                      </button>
                    )}

                    {/* Reset password button (only if has account) */}
                    {tieneAcceso && (
                      <button
                        type="button"
                        title={
                          resetDocSent.has(doc.id)
                            ? "Correo enviado"
                            : resetDocError?.id === doc.id
                            ? resetDocError.msg
                            : "Restablecer contraseña"
                        }
                        onClick={() => handleResetPasswordDoc(doc.id)}
                        disabled={resetDocLoading === doc.id || resetDocSent.has(doc.id)}
                        className={`h-7 w-7 flex items-center justify-center rounded-md border transition-colors shrink-0 ${
                          resetDocSent.has(doc.id)
                            ? "border-green-500 text-green-600 bg-green-50"
                            : resetDocError?.id === doc.id
                            ? "border-destructive text-destructive"
                            : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {resetDocLoading === doc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}

                    {/* Edit button */}
                    <button
                      type="button"
                      title="Editar doctor"
                      onClick={() => handleStartEdit(doc)}
                      className="h-7 w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>

                    {/* Bloquear pago toggle */}
                    <button
                      type="button"
                      title={doc.bloqueado_pago ? "Desbloquear" : "Bloquear por falta de pago"}
                      onClick={() => handleToggleBloqueado(doc.id, !doc.bloqueado_pago)}
                      className={`h-7 w-7 flex items-center justify-center rounded-md border transition-colors ${
                        doc.bloqueado_pago
                          ? "border-amber-400 text-amber-600 hover:bg-amber-50"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {doc.bloqueado_pago ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <LockOpen className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {/* Activo toggle */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {doc.activo ? "Activo" : "Inactivo"}
                      </span>
                      <TogglePill
                        checked={doc.activo}
                        onChange={(v) => handleToggleActivo(doc.id, v)}
                      />
                    </div>
                  </div>

                  {/* Inline access form */}
                  {mostrandoAcceso && (
                    <form
                      onSubmit={handleCrearAcceso}
                      className="border-t px-3 py-3 space-y-2 bg-muted/20"
                    >
                      <p className="text-xs font-medium text-muted-foreground">
                        Crear cuenta de acceso para {doc.nombre}
                      </p>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Correo</Label>
                          <Input
                            type="email"
                            required
                            autoFocus
                            placeholder="doctor@ejemplo.com"
                            value={accesoEmail}
                            onChange={(e) => setAccesoEmail(e.target.value)}
                            className="h-7 text-xs"
                            disabled={accesoLoading}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Contraseña</Label>
                          <PasswordInput
                            required
                            minLength={6}
                            placeholder="Mínimo 6 caracteres"
                            value={accesoPassword}
                            onChange={(e) => setAccesoPassword(e.target.value)}
                            className="h-7 text-xs"
                            disabled={accesoLoading}
                          />
                        </div>
                      </div>
                      {accesoError && (
                        <p className="text-xs text-destructive">{accesoError}</p>
                      )}
                      <Button
                        type="submit"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={accesoLoading || !accesoEmail.trim() || !accesoPassword}
                      >
                        {accesoLoading ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            Creando...
                          </>
                        ) : (
                          "Crear acceso"
                        )}
                      </Button>
                    </form>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main TeamManager ───────────────────────────────────────────────────

export default function TeamManager({ consultorios }: Props) {
  return (
    <div className="space-y-3">
      <CollapsibleSection title="Secretarias">
        <SecretariasTab consultorios={consultorios} />
      </CollapsibleSection>
      <CollapsibleSection title="Doctores">
        <DoctoresTab consultorios={consultorios} />
      </CollapsibleSection>
    </div>
  );
}
