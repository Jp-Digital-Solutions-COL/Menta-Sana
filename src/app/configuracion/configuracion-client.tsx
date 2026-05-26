"use client";

import { useState } from "react";
import { updateConsultorioConfig, type ConsultorioConfig } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Save, Map } from "lucide-react";

interface Props {
  config: ConsultorioConfig | null;
}

export default function ConfiguracionClient({ config }: Props) {
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
      setMensaje({ tipo: "ok", texto: "Configuración guardada correctamente." });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Información del consultorio que aparece en los correos a pacientes.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-teal-600" />
            Datos del consultorio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre del consultorio</Label>
            <Input
              id="nombre"
              placeholder="Ej: Consultorio Médico San Juan"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="direccion">Dirección</Label>
            <Input
              id="direccion"
              placeholder="Ej: Calle 123 #45-67, piso 3"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se mostrará en los correos de confirmación y recordatorio.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="telefono">Teléfono de contacto</Label>
            <Input
              id="telefono"
              placeholder="Ej: 601 234 5678"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mapsUrl" className="flex items-center gap-1.5">
              <Map className="h-3.5 w-3.5 text-muted-foreground" />
              Link de Google Maps
            </Label>
            <Input
              id="mapsUrl"
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
            <p
              className={`text-sm ${
                mensaje.tipo === "ok" ? "text-teal-700" : "text-destructive"
              }`}
            >
              {mensaje.texto}
            </p>
          )}

          <Button
            className="w-full gap-2 bg-teal-600 hover:bg-teal-700 text-white"
            onClick={handleGuardar}
            disabled={saving}
          >
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
