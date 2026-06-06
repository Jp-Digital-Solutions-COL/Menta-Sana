"use client";

import { useState } from "react";
import { updateConsultorioConfig, type ConsultorioConfig } from "@/app/configuracion/actions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Map, Save } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  config: ConsultorioConfig | null;
}

export default function ConsultorioSheet({ open, onClose, config }: Props) {
  const [nombre, setNombre] = useState(config?.nombre ?? "");
  const [direccion, setDireccion] = useState(config?.direccion ?? "");
  const [telefono, setTelefono] = useState(config?.telefono_contacto ?? "");
  const [mapsUrl, setMapsUrl] = useState(config?.maps_url ?? "");
  const [saving, setSaving] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function handleGuardar() {
    setSaving(true);
    setMensaje(null);
    const result = await updateConsultorioConfig({
      nombre,
      direccion,
      telefono_contacto: telefono,
      maps_url: mapsUrl,
    });
    setSaving(false);
    if (result.error) {
      setMensaje({ tipo: "error", texto: result.error });
    } else {
      setMensaje({ tipo: "ok", texto: "Configuración guardada." });
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0 overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-teal-600" />
            Configuración del consultorio
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <p className="text-sm text-muted-foreground">
            Esta información aparece en los correos de confirmación y recordatorio enviados a tus pacientes.
          </p>

          <div className="space-y-2">
            <Label htmlFor="cons-nombre">Nombre del consultorio</Label>
            <Input
              id="cons-nombre"
              placeholder="Ej: Consultorio Psicológico"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cons-direccion">Dirección</Label>
            <Input
              id="cons-direccion"
              placeholder="Ej: Calle 123 #45-67, piso 3"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cons-telefono">Teléfono de contacto</Label>
            <Input
              id="cons-telefono"
              placeholder="Ej: 601 234 5678"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cons-maps" className="flex items-center gap-1.5">
              <Map className="h-3.5 w-3.5 text-muted-foreground" />
              Link de Google Maps
            </Label>
            <Input
              id="cons-maps"
              placeholder="https://maps.app.goo.gl/..."
              value={mapsUrl}
              onChange={(e) => setMapsUrl(e.target.value)}
              type="url"
            />
            <p className="text-xs text-muted-foreground">
              Opcional. Se incluirá en los correos y mensajes de recordatorio.
            </p>
          </div>

          {mensaje && (
            <p className={`text-sm ${mensaje.tipo === "ok" ? "text-teal-700" : "text-destructive"}`}>
              {mensaje.texto}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t shrink-0 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cerrar
          </Button>
          <Button
            className="flex-1 gap-2 bg-teal-600 hover:bg-teal-700 text-white"
            onClick={handleGuardar}
            disabled={saving}
          >
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
