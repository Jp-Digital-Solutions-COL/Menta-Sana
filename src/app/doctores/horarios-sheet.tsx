"use client";

import { useEffect, useState } from "react";
import { getHorarios, saveHorarios } from "./actions";
import {
  DIAS_SEMANA,
  DEFAULT_HORARIO_DIA,
  type Doctor,
  type HorarioDia,
} from "./types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const TIME_INPUT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

interface Props {
  doctor: Doctor | null;
  onClose: () => void;
}

function buildInitialForm(
  horarios: Awaited<ReturnType<typeof getHorarios>>
): Record<number, HorarioDia> {
  const form: Record<number, HorarioDia> = {};
  for (let day = 0; day <= 6; day++) {
    const h = horarios.find((x) => x.dia_semana === day);
    form[day] = h
      ? {
          enabled: true,
          hora_inicio: h.hora_inicio.slice(0, 5),
          hora_fin: h.hora_fin.slice(0, 5),
          almuerzo_inicio: h.almuerzo_inicio ? h.almuerzo_inicio.slice(0, 5) : "",
          almuerzo_fin: h.almuerzo_fin ? h.almuerzo_fin.slice(0, 5) : "",
        }
      : { ...DEFAULT_HORARIO_DIA };
  }
  return form;
}

export default function HorariosSheet({ doctor, onClose }: Props) {
  const [form, setForm] = useState<Record<number, HorarioDia>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [almuerzoPorDefecto, setAlmuerzoPorDefecto] = useState({ inicio: "", fin: "" });

  useEffect(() => {
    if (!doctor) {
      setForm({});
      setUbicaciones([]);
      return;
    }
    setLoading(true);
    setError("");
    getHorarios(doctor.id)
      .then((horarios) => setForm(buildInitialForm(horarios)))
      .finally(() => setLoading(false));
  }, [doctor?.id]);

  function updateDia(day: number, patch: Partial<HorarioDia>) {
    setForm((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  function aplicarAlmuerzoPorDefecto() {
    if (!almuerzoPorDefecto.inicio && !almuerzoPorDefecto.fin) return;
    setForm((prev) => {
      const next = { ...prev };
      for (const day of Object.keys(next)) {
        if (next[Number(day)].enabled) {
          next[Number(day)] = {
            ...next[Number(day)],
            almuerzo_inicio: almuerzoPorDefecto.inicio,
            almuerzo_fin: almuerzoPorDefecto.fin,
          };
        }
      }
      return next;
    });
  }

  async function handleSave() {
    if (!doctor) return;
    setSaving(true);
    setError("");
    const result = await saveHorarios(doctor.id, form);
    if (result.error) {
      setError(result.error);
      setSaving(false);
    } else {
      onClose();
    }
  }

  return (
    <Sheet open={!!doctor} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0 overflow-hidden">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle>Horarios de atención</SheetTitle>
          <SheetDescription>{doctor?.nombre}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              Cargando horarios...
            </p>
          ) : (
            <>
              {/* Almuerzo por defecto */}
              <div className="rounded-lg border border-dashed px-4 py-3 bg-muted/20">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Almuerzo por defecto</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 shrink-0"
                    onClick={aplicarAlmuerzoPorDefecto}
                    disabled={!almuerzoPorDefecto.inicio && !almuerzoPorDefecto.fin}
                  >
                    Aplicar a todos
                  </Button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="time"
                    value={almuerzoPorDefecto.inicio}
                    onChange={(e) =>
                      setAlmuerzoPorDefecto((p) => ({ ...p, inicio: e.target.value }))
                    }
                    className={TIME_INPUT_CLASS}
                  />
                  <span className="text-xs text-muted-foreground shrink-0">–</span>
                  <input
                    type="time"
                    value={almuerzoPorDefecto.fin}
                    onChange={(e) =>
                      setAlmuerzoPorDefecto((p) => ({ ...p, fin: e.target.value }))
                    }
                    className={TIME_INPUT_CLASS}
                  />
                </div>
              </div>

              {/* Días */}
              {DIAS_SEMANA.map((dia) => {
                const d = form[dia.value] ?? DEFAULT_HORARIO_DIA;
                const tieneAlmuerzo = !!(d.almuerzo_inicio || d.almuerzo_fin);
                return (
                  <div
                    key={dia.value}
                    className="rounded-lg border overflow-hidden"
                  >
                    <div
                      className="px-4 py-3"
                      style={
                        !d.enabled
                          ? {
                              backgroundImage:
                                "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(0,0,0,0.045) 6px, rgba(0,0,0,0.045) 12px)",
                            }
                          : undefined
                      }
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="font-medium text-sm">{dia.label}</span>
                          {!d.enabled && (
                            <span className="text-xs text-muted-foreground/60 font-normal">
                              Día de descanso
                            </span>
                          )}
                        </div>
                        <Switch
                          checked={d.enabled}
                          onCheckedChange={(checked) =>
                            updateDia(dia.value, { enabled: checked })
                          }
                        />
                      </div>
                    </div>

                    {d.enabled && (
                      <div className="px-4 pb-3 pt-3 space-y-3">
                        {/* Jornada */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                              Hora inicio
                            </Label>
                            <input
                              type="time"
                              value={d.hora_inicio}
                              onChange={(e) =>
                                updateDia(dia.value, { hora_inicio: e.target.value })
                              }
                              className={TIME_INPUT_CLASS}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                              Hora fin
                            </Label>
                            <input
                              type="time"
                              value={d.hora_fin}
                              onChange={(e) =>
                                updateDia(dia.value, { hora_fin: e.target.value })
                              }
                              className={TIME_INPUT_CLASS}
                            />
                          </div>
                        </div>

                        {/* Almuerzo */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">
                              Almuerzo (opcional)
                            </Label>
                            {tieneAlmuerzo && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateDia(dia.value, { almuerzo_inicio: "", almuerzo_fin: "" })
                                }
                                className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                              >
                                Quitar
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={d.almuerzo_inicio}
                              onChange={(e) =>
                                updateDia(dia.value, { almuerzo_inicio: e.target.value })
                              }
                              className={TIME_INPUT_CLASS}
                            />
                            <span className="text-xs text-muted-foreground shrink-0">–</span>
                            <input
                              type="time"
                              value={d.almuerzo_fin}
                              onChange={(e) =>
                                updateDia(dia.value, { almuerzo_fin: e.target.value })
                              }
                              className={TIME_INPUT_CLASS}
                            />
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="border-t pt-4 space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saving || loading}
            >
              {saving ? "Guardando..." : "Guardar horarios"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
