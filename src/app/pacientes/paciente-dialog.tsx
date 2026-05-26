"use client";

import { useState } from "react";
import { createPaciente, updatePaciente } from "./actions";
import type { Paciente, PacienteFields } from "./types";
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

const TIPOS_DOCUMENTO = [
  { value: "RC", label: "Registro civil" },
  { value: "TI", label: "TI" },
  { value: "CC", label: "CC" },
  { value: "CE", label: "Cédula extranjería" },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  paciente: Paciente | null; // null = nuevo
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

// key en el padre fuerza re-mount → form limpio al cambiar paciente
export default function PacienteDialog({ open, onClose, paciente }: Props) {
  const [fields, setFields] = useState<PacienteFields>(
    paciente ? fromPaciente(paciente) : EMPTY
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {paciente ? "Editar paciente" : "Agregar paciente"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Nombre */}
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

          {/* Teléfono + Email en fila */}
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

          {/* Documento */}
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

          {/* Notas */}
          <div className="space-y-2">
            <Label htmlFor="notas">
              Notas{" "}
              <span className="text-muted-foreground font-normal">
                (opcional)
              </span>
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
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !fields.nombre.trim()}
            >
              {loading
                ? "Guardando..."
                : paciente
                  ? "Guardar cambios"
                  : "Agregar paciente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
