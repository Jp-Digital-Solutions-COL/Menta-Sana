"use client";

import { useState } from "react";
import { bloquearHoras } from "./actions";
import type { DoctorBasic } from "./types";
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
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Ban } from "lucide-react";

// 30-min slots from 07:00 to 20:00
const TIME_OPTIONS: string[] = [];
for (let h = 7; h < 20; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:00`);
  TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:30`);
}
TIME_OPTIONS.push("20:00");

interface Props {
  open: boolean;
  onClose: () => void;
  doctors: DoctorBasic[];
  defaultDoctorId?: string;
  defaultFecha?: string;
  defaultHoraInicio?: string;
  onCreated: () => Promise<void>;
}

export default function BloquearHorasDialog({
  open,
  onClose,
  doctors,
  defaultDoctorId,
  defaultFecha,
  defaultHoraInicio,
  onCreated,
}: Props) {
  const [doctorId, setDoctorId] = useState(defaultDoctorId ?? "");
  const [fecha, setFecha] = useState(defaultFecha ?? toDateStr(new Date()));
  const [horaInicio, setHoraInicio] = useState(defaultHoraInicio ?? "08:00");
  const [horaFin, setHoraFin] = useState(() => {
    const start = defaultHoraInicio ?? "08:00";
    const [h, m] = start.split(":").map(Number);
    const totalMin = h * 60 + m + 60;
    const fh = Math.min(Math.floor(totalMin / 60), 20);
    const fm = totalMin % 60;
    return `${String(fh).padStart(2, "0")}:${String(fm).padStart(2, "0")}`;
  });
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const endOptions = TIME_OPTIONS.filter((t) => t > horaInicio);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!doctorId || !fecha || !horaInicio || !horaFin) return;
    if (horaFin <= horaInicio) {
      setError("La hora de fin debe ser posterior a la de inicio.");
      return;
    }
    setSaving(true);
    setError("");
    const [fy, fm, fd] = fecha.split("-").map(Number);
    const [ih, im] = horaInicio.split(":").map(Number);
    const [fh, ffm] = horaFin.split(":").map(Number);
    const result = await bloquearHoras({
      doctorId,
      inicioISO: bogotaToISO(fy, fm, fd, ih, im),
      finISO: bogotaToISO(fy, fm, fd, fh, ffm),
      motivo,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else {
      await onCreated();
      onClose();
    }
  }

  const canSubmit = !!doctorId && !!fecha && !!horaInicio && !!horaFin && !saving;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-muted-foreground" />
            Bloquear horario
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Doctor */}
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
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fecha */}
          <div className="space-y-1.5">
            <Label className="text-sm">
              Día <span className="text-destructive">*</span>
            </Label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Rango horario */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">
                Desde <span className="text-destructive">*</span>
              </Label>
              <Select
                value={horaInicio}
                onValueChange={(v) => {
                  if (!v) return;
                  setHoraInicio(v);
                  if (horaFin <= v) {
                    const idx = TIME_OPTIONS.indexOf(v);
                    setHoraFin(TIME_OPTIONS[idx + 1] ?? "20:00");
                  }
                }}
              >
                <SelectTrigger>
                  <span data-slot="select-value" className="flex flex-1 text-left">
                    {horaInicio}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.filter((t) => t < "20:00").map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">
                Hasta <span className="text-destructive">*</span>
              </Label>
              <Select value={horaFin} onValueChange={(v) => v && setHoraFin(v)}>
                <SelectTrigger>
                  <span data-slot="select-value" className="flex flex-1 text-left">
                    {horaFin}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {endOptions.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Motivo opcional */}
          <div className="space-y-1.5">
            <Label className="text-sm">
              Motivo{" "}
              <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
            </Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: almuerzo, reunión, vacaciones..."
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter className="pt-2 gap-2">
            <Button variant="outline" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit} variant="secondary">
              {saving ? "Bloqueando..." : "Bloquear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
