"use client";

import { useEffect, useMemo, useState } from "react";
import { createPaciente, updatePaciente, getResumenPagosPaciente } from "./actions";
import type { Paciente, PacienteFields, ResumenCitaPago } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ExternalLink, X } from "lucide-react";

const TIPOS_DOCUMENTO = [
  { value: "RC", label: "Registro civil" },
  { value: "TI", label: "TI" },
  { value: "CC", label: "CC" },
  { value: "CE", label: "Cédula extranjería" },
] as const;

const ESTADO_CITA_LABEL: Record<string, string> = {
  programada: "Programada",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  atendida: "Atendida",
  no_asistio: "No asistió",
};

interface Props {
  open: boolean;
  onClose: () => void;
  paciente: Paciente | null;
  onCitaClick?: (citaId: string) => void;
  pagosRefreshKey?: number;
}

const EMPTY: PacienteFields = { nombre: "", telefono: "", email: "", cedula: "", tipo_documento: "CC", notas: "" };

function fromPaciente(p: Paciente): PacienteFields {
  return {
    nombre: p.nombre,
    telefono: p.telefono ?? "",
    email: p.email ?? "",
    cedula: p.cedula ?? "",
    tipo_documento: p.tipo_documento ?? "CC",
    notas: p.notas ?? "",
  };
}

// ── Pagos tab ─────────────────────────────────────────────────────────────────

function PagosTab({
  pacienteId,
  onCitaClick,
  refreshKey,
}: {
  pacienteId: string;
  onCitaClick?: (citaId: string) => void;
  refreshKey?: number;
}) {
  const [resumen, setResumen] = useState<ResumenCitaPago[]>([]);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    setLoading(true);
    getResumenPagosPaciente(pacienteId).then((r) => {
      setResumen(r);
      setLoading(false);
    });
  }, [pacienteId, refreshKey]);

  const filtered = useMemo(() => {
    return resumen.filter((r) => {
      const fecha = new Date(r.inicio).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      return true;
    });
  }, [resumen, desde, hasta]);

  const saldoTotal = useMemo(
    () =>
      filtered
        .filter((r) => r.saldo != null && r.estadoPago !== "pagado")
        .reduce((sum, r) => sum + (r.saldo ?? 0), 0),
    [filtered]
  );

  const hayTarifas = filtered.some((r) => r.tarifa != null);

  return (
    <div className="space-y-4 py-4">
      {/* Saldo total */}
      <div
        className={`rounded-lg px-4 py-3 border ${
          !hayTarifas
            ? "bg-muted/30 border-border"
            : saldoTotal <= 0
            ? "bg-emerald-50 border-emerald-200"
            : "bg-amber-50 border-amber-200"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
          Saldo pendiente{desde || hasta ? " (período)" : ""}
        </p>
        {!hayTarifas ? (
          <p className="text-sm text-muted-foreground">Sin tarifas registradas</p>
        ) : saldoTotal <= 0 ? (
          <p className="text-xl font-bold text-emerald-700">Al día ✓</p>
        ) : (
          <p className="text-xl font-bold text-amber-700">
            ${saldoTotal.toLocaleString("es-CO")}
          </p>
        )}
      </div>

      {/* Filtro de fechas */}
      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-xs text-muted-foreground shrink-0">Desde</label>
        <input
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="flex h-8 rounded-lg border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <label className="text-xs text-muted-foreground shrink-0">Hasta</label>
        <input
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className="flex h-8 rounded-lg border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {(desde || hasta) && (
          <button
            type="button"
            onClick={() => { setDesde(""); setHasta(""); }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            <X className="h-3 w-3" />
            Limpiar
          </button>
        )}
      </div>

      {/* Tabla de sesiones */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Sin citas{desde || hasta ? " en este período" : ""}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Fecha
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Especialista
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Tarifa
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Pagado
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Saldo
                </th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Estado pago
                </th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const fecha = new Date(r.inicio).toLocaleDateString("es-CO", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "America/Bogota",
                });
                return (
                  <tr
                    key={r.citaId}
                    className="border-b last:border-b-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="text-sm font-medium">{fecha}</div>
                      <div className="text-xs text-muted-foreground">
                        {ESTADO_CITA_LABEL[r.estado] ?? r.estado}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      {r.doctorTitulo && (
                        <span className="text-muted-foreground">{r.doctorTitulo} </span>
                      )}
                      {r.doctorNombre}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-sm">
                      {r.tarifa != null ? (
                        `$${r.tarifa.toLocaleString("es-CO")}`
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-sm">
                      {r.totalPagado > 0 ? (
                        <span className="text-emerald-700">
                          ${r.totalPagado.toLocaleString("es-CO")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-sm font-medium">
                      {r.saldo != null ? (
                        r.saldo <= 0 ? (
                          <span className="text-emerald-700">—</span>
                        ) : (
                          <span className="text-amber-700">
                            ${r.saldo.toLocaleString("es-CO")}
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          r.estadoPago === "pagado"
                            ? "bg-emerald-100 text-emerald-700"
                            : r.estadoPago === "parcial"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {r.estadoPago === "pagado"
                          ? "Pagado"
                          : r.estadoPago === "parcial"
                          ? "Parcial"
                          : "Pendiente"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      {onCitaClick && (
                        <button
                          type="button"
                          onClick={() => onCitaClick(r.citaId)}
                          className="text-muted-foreground hover:text-teal-700 p-1 rounded transition-colors"
                          title="Ver detalle de la cita"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export default function PacienteDialog({
  open,
  onClose,
  paciente,
  onCitaClick,
  pagosRefreshKey,
}: Props) {
  const [fields, setFields] = useState<PacienteFields>(
    paciente ? fromPaciente(paciente) : EMPTY
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"datos" | "pagos">("datos");

  function set(key: keyof PacienteFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = paciente
      ? await updatePaciente(paciente.id, fields)
      : await createPaciente(fields);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      onClose();
    }
  }

  const isEditing = paciente !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={
          isEditing
            ? "sm:max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden"
            : "sm:max-w-lg"
        }
      >
        {/* Header */}
        <DialogHeader className={isEditing ? "px-6 pt-6 pb-0 shrink-0" : ""}>
          <DialogTitle>
            {isEditing ? paciente.nombre : "Agregar paciente"}
          </DialogTitle>
          {isEditing && paciente.cedula && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {paciente.tipo_documento ?? "CC"} {paciente.cedula}
            </p>
          )}
        </DialogHeader>

        {isEditing ? (
          /* ── Tabbed layout (edit mode) ── */
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b px-6 mt-4 shrink-0">
              {(["datos", "pagos"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    tab === t
                      ? "border-teal-600 text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "datos" ? "Datos" : "Pagos"}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-6">
              {tab === "datos" ? (
                <form onSubmit={handleSubmit} className="space-y-4 py-5">
                  <div className="space-y-2">
                    <Label htmlFor="nombre">
                      Nombre completo <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="nombre"
                      value={fields.nombre}
                      onChange={(e) => set("nombre", e.target.value)}
                      placeholder="María González"
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="telefono">Teléfono</Label>
                      <Input
                        id="telefono"
                        type="tel"
                        value={fields.telefono}
                        onChange={(e) => set("telefono", e.target.value)}
                        placeholder="555-123-4567"
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Correo electrónico</Label>
                      <Input
                        id="email"
                        type="email"
                        value={fields.email}
                        onChange={(e) => set("email", e.target.value)}
                        placeholder="paciente@ejemplo.com"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Documento{" "}
                      <span className="text-muted-foreground font-normal">(opcional)</span>
                    </Label>
                    <div className="flex gap-2">
                      <Select
                        value={fields.tipo_documento}
                        onValueChange={(v) => v && set("tipo_documento", v)}
                        disabled={loading}
                      >
                        <SelectTrigger className="w-[160px] shrink-0">
                          <span data-slot="select-value">
                            {TIPOS_DOCUMENTO.find((t) => t.value === fields.tipo_documento)?.label ?? fields.tipo_documento}
                          </span>
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
                        value={fields.cedula}
                        onChange={(e) => set("cedula", e.target.value)}
                        placeholder="Número de documento"
                        disabled={loading}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notas">
                      Notas{" "}
                      <span className="text-muted-foreground font-normal">(opcional)</span>
                    </Label>
                    <Textarea
                      id="notas"
                      value={fields.notas}
                      onChange={(e) => set("notas", e.target.value)}
                      placeholder="Alergias, antecedentes, observaciones..."
                      rows={3}
                      disabled={loading}
                      className="resize-none"
                    />
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <div className="flex justify-end gap-2 pt-2 pb-4">
                    <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={loading || !fields.nombre.trim()}>
                      {loading ? "Guardando..." : "Guardar cambios"}
                    </Button>
                  </div>
                </form>
              ) : (
                <PagosTab
                  pacienteId={paciente.id}
                  onCitaClick={onCitaClick}
                  refreshKey={pagosRefreshKey}
                />
              )}
            </div>

            {/* Footer for pagos tab */}
            {tab === "pagos" && (
              <div className="shrink-0 px-6 py-4 border-t bg-background">
                <Button variant="outline" className="w-full" onClick={onClose}>
                  Cerrar
                </Button>
              </div>
            )}
          </div>
        ) : (
          /* ── Create mode (no tabs) ── */
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nombre">
                Nombre completo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nombre"
                value={fields.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                placeholder="María González"
                required
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  type="tel"
                  value={fields.telefono}
                  onChange={(e) => set("telefono", e.target.value)}
                  placeholder="555-123-4567"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  value={fields.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="paciente@ejemplo.com"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                Documento{" "}
                <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <div className="flex gap-2">
                <Select
                  value={fields.tipo_documento}
                  onValueChange={(v) => v && set("tipo_documento", v)}
                  disabled={loading}
                >
                  <SelectTrigger className="w-[160px] shrink-0">
                    <span data-slot="select-value">
                      {TIPOS_DOCUMENTO.find((t) => t.value === fields.tipo_documento)?.label ?? fields.tipo_documento}
                    </span>
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
                  value={fields.cedula}
                  onChange={(e) => set("cedula", e.target.value)}
                  placeholder="Número de documento"
                  disabled={loading}
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas">
                Notas{" "}
                <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Textarea
                id="notas"
                value={fields.notas}
                onChange={(e) => set("notas", e.target.value)}
                placeholder="Alergias, antecedentes, observaciones..."
                rows={3}
                disabled={loading}
                className="resize-none"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter className="pt-2">
              <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading || !fields.nombre.trim()}>
                {loading ? "Guardando..." : "Agregar paciente"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
