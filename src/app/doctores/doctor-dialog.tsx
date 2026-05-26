"use client";

import { useEffect, useRef, useState } from "react";
import { createDoctor, updateDoctor, getUbicaciones, createUbicacion, deleteUbicacion } from "./actions";
import type { Doctor, Ubicacion } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Camera, X, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { convertToWebP, uploadToCloudinary } from "@/lib/cloudinary";

interface Props {
  open: boolean;
  onClose: () => void;
  doctor: Doctor | null;
}

function getInitials(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function DoctorDialog({ open, onClose, doctor }: Props) {
  const [nombre, setNombre] = useState(doctor?.nombre ?? "");
  const [titulo, setTitulo] = useState<string | null>(doctor?.titulo ?? null);
  const [especialidad, setEspecialidad] = useState(doctor?.especialidad ?? "");
  const [photoPreview, setPhotoPreview] = useState<string | null>(doctor?.foto_url ?? null);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sedes
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [loadingUbicaciones, setLoadingUbicaciones] = useState(false);
  const [showAddSede, setShowAddSede] = useState(false);
  const [newNombre, setNewNombre] = useState("");
  const [newDireccion, setNewDireccion] = useState("");
  const [newTelefono, setNewTelefono] = useState("");
  const [newMapsUrl, setNewMapsUrl] = useState("");
  const [savingSede, setSavingSede] = useState(false);
  const [sedeError, setSedeError] = useState("");

  useEffect(() => {
    if (!doctor) {
      setUbicaciones([]);
      return;
    }
    setLoadingUbicaciones(true);
    getUbicaciones(doctor.id)
      .then(setUbicaciones)
      .finally(() => setLoadingUbicaciones(false));
  }, [doctor?.id]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("La imagen no puede pesar más de 10 MB.");
      return;
    }
    setError("");
    try {
      const blob = await convertToWebP(file);
      setPendingBlob(blob);
      if (photoPreview && !photoPreview.startsWith("http")) {
        URL.revokeObjectURL(photoPreview);
      }
      setPhotoPreview(URL.createObjectURL(blob));
    } catch {
      setError("No se pudo procesar la imagen. Intenta con otro archivo.");
    }
    e.target.value = "";
  }

  function handleRemovePhoto() {
    if (photoPreview && !photoPreview.startsWith("http")) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview(null);
    setPendingBlob(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    let fotoUrl: string | null = pendingBlob ? null : photoPreview;

    if (pendingBlob) {
      setUploading(true);
      try {
        fotoUrl = await uploadToCloudinary(pendingBlob);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
        setLoading(false);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const result = doctor
      ? await updateDoctor(doctor.id, nombre, especialidad, fotoUrl, titulo)
      : await createDoctor(nombre, especialidad, fotoUrl, titulo);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      onClose();
    }
  }

  async function handleAddSede() {
    if (!doctor || !newNombre.trim()) return;
    setSavingSede(true);
    setSedeError("");
    const result = await createUbicacion(
      doctor.id,
      newNombre,
      newDireccion || null,
      newTelefono || null,
      newMapsUrl || null
    );
    setSavingSede(false);
    if (result.error) {
      setSedeError(result.error);
    } else if (result.data) {
      setUbicaciones((prev) => [...prev, result.data!]);
      setNewNombre("");
      setNewDireccion("");
      setNewTelefono("");
      setNewMapsUrl("");
      setShowAddSede(false);
    }
  }

  async function handleDeleteSede(id: string) {
    const result = await deleteUbicacion(id);
    if (!result.error) {
      setUbicaciones((prev) => prev.filter((u) => u.id !== id));
    }
  }

  const initials = getInitials(nombre);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>{doctor ? "Editar doctor" : "Agregar doctor"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Avatar picker */}
            <div className="flex items-center gap-4">
              <div className="relative group shrink-0">
                <div
                  className="w-20 h-20 rounded-full overflow-hidden bg-muted border-2 border-border flex items-center justify-center cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoPreview} alt="Foto" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-bold text-muted-foreground select-none">
                      {initials || <Camera className="h-6 w-6 opacity-40" />}
                    </span>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <Camera className="h-5 w-5 text-white" />
                  </div>
                </div>
                {photoPreview && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm"
                    title="Quitar foto"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="space-y-1 min-w-0">
                <p className="text-sm font-medium">Foto del doctor</p>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG o WebP · Máx 10 MB
                  <br />
                  Se convierte a WebP automáticamente
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-primary hover:underline"
                >
                  {photoPreview ? "Cambiar foto" : "Subir foto"}
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Título */}
            <div className="space-y-2">
              <Label>
                Título{" "}
                <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <div className="flex gap-2">
                {(["Dr.", "Dra."] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={loading}
                    onClick={() => setTitulo(titulo === t ? null : t)}
                    className={`px-5 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                      titulo === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input hover:bg-muted"
                    }`}
                  >
                    {t}
                  </button>
                ))}
                {titulo && (
                  <span className="text-xs text-muted-foreground self-center ml-1">
                    (clic para deseleccionar)
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre completo</Label>
              <Input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Juan García"
                required
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="especialidad">
                Especialidad{" "}
                <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="especialidad"
                value={especialidad}
                onChange={(e) => setEspecialidad(e.target.value)}
                placeholder="Medicina general"
                disabled={loading}
              />
            </div>

            {/* Sedes adicionales — solo al editar */}
            {doctor && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">Sedes adicionales</span>
                    <span className="text-xs text-muted-foreground">(opcional)</span>
                  </div>
                  {!showAddSede && (
                    <button
                      type="button"
                      onClick={() => setShowAddSede(true)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Agregar sede
                    </button>
                  )}
                </div>

                {loadingUbicaciones ? (
                  <p className="text-xs text-muted-foreground">Cargando...</p>
                ) : (
                  <>
                    {ubicaciones.length > 0 && (
                      <div className="space-y-2">
                        {ubicaciones.map((u) => (
                          <div
                            key={u.id}
                            className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2.5 bg-muted/20"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{u.nombre}</p>
                              {u.direccion && (
                                <p className="text-xs text-muted-foreground truncate">{u.direccion}</p>
                              )}
                              {u.telefono && (
                                <p className="text-xs text-muted-foreground">{u.telefono}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteSede(u.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors p-0.5 shrink-0 mt-0.5"
                              title="Eliminar sede"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {showAddSede && (
                      <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Nueva sede
                        </p>
                        <div className="space-y-2">
                          <Input
                            value={newNombre}
                            onChange={(e) => setNewNombre(e.target.value)}
                            placeholder="Nombre de la sede *"
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
                            className="h-8 text-sm"
                            type="tel"
                          />
                          <Input
                            value={newMapsUrl}
                            onChange={(e) => setNewMapsUrl(e.target.value)}
                            placeholder="Link Google Maps (opcional)"
                            className="h-8 text-sm"
                            type="url"
                          />
                        </div>
                        {sedeError && <p className="text-xs text-destructive">{sedeError}</p>}
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="flex-1 h-8 text-xs"
                            onClick={() => { setShowAddSede(false); setSedeError(""); setNewNombre(""); setNewDireccion(""); setNewTelefono(""); setNewMapsUrl(""); }}
                            disabled={savingSede}
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="flex-1 h-8 text-xs"
                            onClick={handleAddSede}
                            disabled={!newNombre.trim() || savingSede}
                          >
                            {savingSede ? "Guardando..." : "Agregar"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {ubicaciones.length === 0 && !showAddSede && (
                      <p className="text-xs text-muted-foreground">
                        Agrega sedes si el doctor atiende en múltiples consultorios.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-background shrink-0 gap-2">
            <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !nombre.trim()}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Subiendo foto...
                </>
              ) : loading ? (
                "Guardando..."
              ) : doctor ? (
                "Guardar cambios"
              ) : (
                "Agregar doctor"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
