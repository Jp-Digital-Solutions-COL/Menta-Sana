"use client";

import { useEffect, useState } from "react";
import { getUbicaciones, createUbicacion, deleteUbicacion } from "./actions";
import type { Doctor, Ubicacion } from "./types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Plus, Trash2 } from "lucide-react";

interface Props {
  doctor: Doctor | null;
  onClose: () => void;
}

export default function SedesSheet({ doctor, onClose }: Props) {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newNombre, setNewNombre] = useState("");
  const [newDireccion, setNewDireccion] = useState("");
  const [newTelefono, setNewTelefono] = useState("");
  const [newMapsUrl, setNewMapsUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!doctor) {
      setUbicaciones([]);
      return;
    }
    setLoading(true);
    getUbicaciones(doctor.id)
      .then(setUbicaciones)
      .finally(() => setLoading(false));
  }, [doctor?.id]);

  async function handleAdd() {
    if (!doctor || !newNombre.trim()) return;
    setSaving(true);
    setError("");
    const result = await createUbicacion(doctor.id, newNombre, newDireccion || null, newTelefono || null, newMapsUrl || null);
    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else if (result.data) {
      setUbicaciones((prev) => [...prev, result.data!]);
      setNewNombre("");
      setNewDireccion("");
      setNewTelefono("");
      setNewMapsUrl("");
      setShowAdd(false);
    }
  }

  async function handleDelete(id: string) {
    const result = await deleteUbicacion(id);
    if (!result.error) {
      setUbicaciones((prev) => prev.filter((u) => u.id !== id));
    }
  }

  return (
    <Sheet open={!!doctor} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 overflow-hidden">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle>Consultorios adicionales</SheetTitle>
          <SheetDescription>{doctor?.nombre}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-12">Cargando...</p>
          ) : (
            <>
              {ubicaciones.length > 0 ? (
                <div className="space-y-2">
                  {ubicaciones.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <p className="text-sm font-medium">{u.nombre}</p>
                        </div>
                        {u.direccion && (
                          <p className="text-xs text-muted-foreground mt-0.5 ml-5">{u.direccion}</p>
                        )}
                        {u.telefono && (
                          <p className="text-xs text-muted-foreground ml-5">{u.telefono}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(u.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-0.5 shrink-0 mt-0.5"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                !showAdd && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No hay consultorios adicionales registrados.
                  </p>
                )
              )}

              {showAdd ? (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Nuevo consultorio
                  </p>
                  <Input
                    value={newNombre}
                    onChange={(e) => setNewNombre(e.target.value)}
                    placeholder="Nombre *"
                    className="h-8 text-sm"
                    autoFocus
                  />
                  <Input
                    value={newDireccion}
                    onChange={(e) => setNewDireccion(e.target.value)}
                    placeholder="Dirección (opcional)"
                    className="h-8 text-sm"
                  />
                  <Input
                    value={newTelefono}
                    onChange={(e) => setNewTelefono(e.target.value)}
                    placeholder="Teléfono (opcional)"
                    type="tel"
                    className="h-8 text-sm"
                  />
                  <Input
                    value={newMapsUrl}
                    onChange={(e) => setNewMapsUrl(e.target.value)}
                    placeholder="Link Google Maps (opcional)"
                    type="url"
                    className="h-8 text-sm"
                  />
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => { setShowAdd(false); setError(""); setNewNombre(""); setNewDireccion(""); setNewTelefono(""); setNewMapsUrl(""); }}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={handleAdd}
                      disabled={!newNombre.trim() || saving}
                    >
                      {saving ? "Guardando..." : "Agregar"}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar consultorio
                </button>
              )}
            </>
          )}
        </div>

        <div className="border-t pt-4">
          <Button variant="outline" className="w-full" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
