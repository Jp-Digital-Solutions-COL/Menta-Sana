"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import {
  getPlantillaRecordatorio,
  savePlantillaRecordatorio,
} from "@/app/configuracion/actions";
import { DEFAULT_PLANTILLA_RECORDATORIO } from "@/app/configuracion/constants";
import { getPlantillaWhatsapp, savePlantillaWhatsapp } from "@/app/pagos/actions";
import { DEFAULT_PLANTILLA } from "@/app/pagos/types";

// ── Variables por tipo ────────────────────────────────────────────────────

const VARS_REC_BASE = [
  { key: "{paciente}", label: "Nombre del paciente" },
  { key: "{doctor}",   label: "Título + nombre del especialista" },
  { key: "{fecha}",    label: "Fecha de la cita" },
  { key: "{hora}",     label: "Hora de la cita" },
] as const;

const VARS_REC_COND = [
  { key: "{lugar}",    label: "Nombre del lugar (presencial)" },
  { key: "{direccion}", label: "Dirección del lugar (presencial)" },
  { key: "{maps}",     label: "Link de Google Maps (presencial)" },
  { key: "{meet}",     label: "Link de Google Meet (virtual)" },
] as const;

const VARS_COBRO = [
  { key: "{nombre}",   label: "Nombre del paciente" },
  { key: "{monto}",    label: "Monto adeudado" },
  { key: "{sesiones}", label: "Detalle de sesiones" },
] as const;

// ── Preview helpers ───────────────────────────────────────────────────────

export type RecordatorioPreviewData = {
  paciente: string;
  titulo: string | null;
  doctor: string;
  fecha: string;
  hora: string;
  ubicacion: { nombre: string | null; direccion: string | null; mapsUrl: string | null } | null;
  meetLink: string | null;
};

function previewRecordatorio(
  plantilla: string,
  data: RecordatorioPreviewData
): string {
  const prefijo = data.titulo ?? "Dr.";
  const hasConditional = /\{lugar\}|\{direccion\}|\{maps\}|\{meet\}/.test(plantilla);

  let msg = plantilla
    .replace(/\{paciente\}/g, data.paciente)
    .replace(/\{doctor\}/g, `${prefijo} ${data.doctor}`)
    .replace(/\{fecha\}/g, data.fecha)
    .replace(/\{hora\}/g, data.hora)
    .replace(/\{lugar\}/g, data.ubicacion?.nombre ?? "")
    .replace(/\{direccion\}/g, data.ubicacion?.direccion ?? "")
    .replace(/\{maps\}/g, data.ubicacion?.mapsUrl ?? "")
    .replace(/\{meet\}/g, data.meetLink ?? "");

  if (!hasConditional) {
    if (data.meetLink) {
      msg += `\n\nCita virtual\nLink de la videollamada: ${data.meetLink}`;
    } else {
      if (data.ubicacion?.nombre) msg += `\n\nLugar: ${data.ubicacion.nombre}`;
      if (data.ubicacion?.direccion) msg += `\nDirección: ${data.ubicacion.direccion}`;
    }
  }
  return msg;
}

const PREVIEW_REC_DUMMY: RecordatorioPreviewData = {
  paciente: "Juan Pérez",
  titulo: "Dra.",
  doctor: "Ana Prueba",
  fecha: "lunes, 9 de junio de 2026",
  hora: "10:00",
  ubicacion: { nombre: "Consultorio calle 100", direccion: "Calle 100 # 19-54", mapsUrl: null },
  meetLink: null,
};

// ── Shared sub-component: tab textarea editor ─────────────────────────────

type VarGroup = { label: string; vars: readonly { key: string; label: string }[] };

function PlantillaEditor({
  value,
  onChange,
  varGroups,
  preview,
  onSave,
  saving,
  saved,
}: {
  value: string;
  onChange: (v: string) => void;
  varGroups: VarGroup[];
  preview: string;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function insert(variable: string) {
    const el = ref.current;
    if (!el) { onChange(value + variable); return; }
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const next = value.slice(0, s) + variable + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.selectionStart = s + variable.length;
      el.selectionEnd = s + variable.length;
      el.focus();
    });
  }

  return (
    <div className="space-y-3">
      {/* Variable groups */}
      {varGroups.map((group) => (
        <div key={group.label}>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">{group.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {group.vars.map((v) => (
              <button
                key={v.key}
                onClick={() => insert(v.key)}
                title={v.label}
                className="px-2.5 py-0.5 rounded-full border border-teal-300 bg-teal-50 text-teal-700 text-xs font-mono hover:bg-teal-100 transition-colors"
              >
                + {v.key}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Textarea */}
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
      />

      {/* Preview */}
      <div className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
        <span className="font-medium text-foreground block mb-1">Vista previa:</span>
        {preview}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-1">
        <Button
          onClick={onSave}
          disabled={saving}
          className="bg-teal-600 hover:bg-teal-700 text-white"
          size="sm"
        >
          {saving ? "Guardando…" : "Guardar mensaje"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="h-4 w-4" />
            Guardado
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────

export type MensajesTab = "recordatorio" | "cobro";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultTab?: MensajesTab;
  /** Real cita data for a live recordatorio preview */
  previewRecData?: RecordatorioPreviewData;
  /** Called when recordatorio plantilla is saved, so parent can update its state */
  onSaveRecordatorio?: (plantilla: string) => void;
  /** Called when cobro plantilla is saved */
  onSaveCobro?: (plantilla: string) => void;
}

export default function MensajesWhatsAppDialog({
  open,
  onClose,
  defaultTab = "recordatorio",
  previewRecData,
  onSaveRecordatorio,
  onSaveCobro,
}: Props) {
  const [tab, setTab] = useState<MensajesTab>(defaultTab);

  // Recordatorio state
  const [plantillaRec, setPlantillaRec] = useState(DEFAULT_PLANTILLA_RECORDATORIO);
  const [savingRec, setSavingRec] = useState(false);
  const [savedRec, setSavedRec] = useState(false);

  // Cobro state
  const [plantillaCobro, setPlantillaCobro] = useState(DEFAULT_PLANTILLA);
  const [savingCobro, setSavingCobro] = useState(false);
  const [savedCobro, setSavedCobro] = useState(false);

  // Load both plantillas when dialog opens
  useEffect(() => {
    if (!open) return;
    setTab(defaultTab);
    getPlantillaRecordatorio().then(setPlantillaRec);
    getPlantillaWhatsapp().then(setPlantillaCobro);
  }, [open, defaultTab]);

  async function handleSaveRec() {
    setSavingRec(true);
    await savePlantillaRecordatorio(plantillaRec);
    setSavingRec(false);
    setSavedRec(true);
    setTimeout(() => setSavedRec(false), 2500);
    onSaveRecordatorio?.(plantillaRec);
  }

  async function handleSaveCobro() {
    setSavingCobro(true);
    await savePlantillaWhatsapp(plantillaCobro);
    setSavingCobro(false);
    setSavedCobro(true);
    setTimeout(() => setSavedCobro(false), 2500);
    onSaveCobro?.(plantillaCobro);
  }

  const recPreviewData = previewRecData ?? PREVIEW_REC_DUMMY;

  const cobroPreview = plantillaCobro
    .replace(/\{nombre\}/g, "Juan Pérez")
    .replace(/\{monto\}/g, "$80.000")
    .replace(/\{sesiones\}/g, "de la sesión de ayer");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Personalizar mensajes de WhatsApp</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b shrink-0">
          {(["recordatorio", "cobro"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "recordatorio" ? "Recordatorio de cita" : "Cobro de saldo"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 pt-4">
          {tab === "recordatorio" && (
            <PlantillaEditor
              value={plantillaRec}
              onChange={setPlantillaRec}
              varGroups={[
                { label: "Siempre disponibles", vars: VARS_REC_BASE },
                { label: "Condicionales (vacíos si no aplican)", vars: VARS_REC_COND },
              ]}
              preview={previewRecordatorio(plantillaRec, recPreviewData)}
              onSave={handleSaveRec}
              saving={savingRec}
              saved={savedRec}
            />
          )}
          {tab === "cobro" && (
            <PlantillaEditor
              value={plantillaCobro}
              onChange={setPlantillaCobro}
              varGroups={[{ label: "Variables disponibles", vars: VARS_COBRO }]}
              preview={cobroPreview}
              onSave={handleSaveCobro}
              saving={savingCobro}
              saved={savedCobro}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
