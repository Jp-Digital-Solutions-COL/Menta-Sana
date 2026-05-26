"use client";

import { useOptimistic, useTransition, useState } from "react";
import type { Doctor } from "./types";
import { toggleDoctorActivo } from "./actions";
import DoctorDialog from "./doctor-dialog";
import HorariosSheet from "./horarios-sheet";
import SedesSheet from "./sedes-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, CalendarDays, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface Props {
  doctores: Doctor[];
  rol: string;
}

export default function DoctoresClient({ doctores: initial, rol }: Props) {
  const esSecretaria = rol === "secretaria";

  const [, startTransition] = useTransition();
  const [optimisticDoctores, updateOptimistic] = useOptimistic(
    initial,
    (state, { id, activo }: { id: string; activo: boolean }) =>
      state.map((d) => (d.id === id ? { ...d, activo } : d))
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [schedulesDoctor, setSchedulesDoctor] = useState<Doctor | null>(null);
  const [sedesDoctor, setSedesDoctor] = useState<Doctor | null>(null);

  function handleToggle(doctor: Doctor) {
    startTransition(async () => {
      updateOptimistic({ id: doctor.id, activo: !doctor.activo });
      await toggleDoctorActivo(doctor.id, !doctor.activo);
    });
  }

  function handleAdd() {
    setEditingDoctor(null);
    setDialogOpen(true);
  }

  function handleEdit(doctor: Doctor) {
    setEditingDoctor(doctor);
    setDialogOpen(true);
  }

  function handleCloseDialog() {
    setDialogOpen(false);
    setEditingDoctor(null);
  }

  return (
    <div className="space-y-6">
      {/* Logo nav */}
      <div className="flex items-center justify-between">
        <Link href="/inicio">
          <Image
            src="/Menta-Sana_sin_slogan.png"
            alt="Med-Agenda"
            width={140}
            height={32}
            className="h-10 w-auto"
            unoptimized
            priority
          />
        </Link>
        <Link href="/inicio" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          ← Inicio
        </Link>
      </div>

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Doctores</h1>
          {!esSecretaria && (
            <p className="text-sm text-muted-foreground mt-1">
              Los doctores{" "}
              <span className="font-semibold text-foreground">activos</span> se
              incluyen en la facturación mensual.
            </p>
          )}
        </div>
        {!esSecretaria && (
          <Button onClick={handleAdd} className="shrink-0">
            <Plus className="h-4 w-4 mr-2" />
            Agregar doctor
          </Button>
        )}
      </div>

      {/* Tabla o estado vacío */}
      {optimisticDoctores.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground text-sm">
            No hay doctores registrados.
          </p>
          {!esSecretaria && (
            <Button variant="outline" className="mt-4" onClick={handleAdd}>
              Agregar el primer doctor
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Especialidad</TableHead>
                {!esSecretaria && (
                  <TableHead>
                    <div className="flex items-center gap-1.5">
                      Activo
                      <span className="text-xs font-normal text-muted-foreground">
                        (facturado)
                      </span>
                    </div>
                  </TableHead>
                )}
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {optimisticDoctores.map((doctor) => (
                <TableRow
                  key={doctor.id}
                  className={!doctor.activo ? "opacity-60 bg-muted/30" : ""}
                >
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0">
                        {doctor.foto_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={doctor.foto_url} alt={doctor.nombre} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[11px] font-semibold text-muted-foreground select-none">
                            {doctor.nombre.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className="font-medium">
                        {doctor.titulo && (
                          <span className="text-muted-foreground font-normal mr-1">{doctor.titulo}</span>
                        )}
                        {doctor.nombre}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {doctor.especialidad ?? (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  {!esSecretaria && (
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className={
                            doctor.activo
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-gray-200 bg-gray-50 text-gray-500"
                          }
                        >
                          {doctor.activo ? "● Activo" : "○ Inactivo"}
                        </Badge>
                        <Switch
                          checked={doctor.activo}
                          onCheckedChange={() => handleToggle(doctor)}
                          aria-label={`${doctor.activo ? "Desactivar" : "Activar"} a ${doctor.nombre}`}
                        />
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {esSecretaria ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSedesDoctor(doctor)}
                            className="gap-1.5"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            Consultorios
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSchedulesDoctor(doctor)}
                            className="gap-1.5"
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                            Horarios
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(doctor)}
                            className="gap-1.5"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSchedulesDoctor(doctor)}
                            className="gap-1.5"
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                            Horarios
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog: agregar / editar doctor (solo admin) */}
      {!esSecretaria && (
        <DoctorDialog
          key={editingDoctor?.id ?? "__nuevo__"}
          open={dialogOpen}
          onClose={handleCloseDialog}
          doctor={editingDoctor}
        />
      )}

      {/* Sheet: gestionar horarios */}
      <HorariosSheet
        doctor={schedulesDoctor}
        onClose={() => setSchedulesDoctor(null)}
      />

      {/* Sheet: gestionar consultorios adicionales (secretaria) */}
      <SedesSheet
        doctor={sedesDoctor}
        onClose={() => setSedesDoctor(null)}
      />
    </div>
  );
}
