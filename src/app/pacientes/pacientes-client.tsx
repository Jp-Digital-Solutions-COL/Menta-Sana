"use client";

import { useMemo, useState } from "react";
import type { Paciente } from "./types";
import PacienteDialog from "./paciente-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Pencil, X, FileText } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface Props {
  pacientes: Paciente[];
}

export default function PacientesClient({ pacientes }: Props) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Paciente | null>(null);

  // Filtro en vivo por nombre (insensible a mayúsculas/acentos)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pacientes;
    return pacientes.filter((p) => p.nombre.toLowerCase().includes(q));
  }, [pacientes, search]);

  function handleAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function handleEdit(p: Paciente) {
    setEditing(p);
    setDialogOpen(true);
  }

  function handleClose() {
    setDialogOpen(false);
    setEditing(null);
  }

  return (
    <div className="space-y-6">
      {/* Logo nav */}
      <div className="flex items-center justify-between">
        <Link href="/inicio">
          <Image
            src="/Menta-Sana_sin_slogan.png"
            alt="Menta Sana"
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pacientes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {pacientes.length === 0
              ? "Sin pacientes registrados"
              : `${pacientes.length} paciente${pacientes.length !== 1 ? "s" : ""} registrado${pacientes.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={handleAdd} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Agregar paciente
        </Button>
      </div>

      {/* Barra de búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Contador de resultados cuando hay búsqueda activa */}
      {search && (
        <p className="text-sm text-muted-foreground -mt-2">
          {filtered.length === 0
            ? "Sin resultados"
            : `${filtered.length} resultado${filtered.length !== 1 ? "s" : ""} para "${search}"`}
        </p>
      )}

      {/* Tabla o estado vacío */}
      {pacientes.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground text-sm">
            No hay pacientes registrados.
          </p>
          <Button variant="outline" className="mt-4" onClick={handleAdd}>
            Agregar el primer paciente
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground text-sm">
            No se encontraron pacientes con el nombre{" "}
            <span className="font-medium">&ldquo;{search}&rdquo;</span>.
          </p>
          <button
            onClick={() => setSearch("")}
            className="mt-2 text-sm text-primary underline-offset-4 hover:underline"
          >
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Correo electrónico</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.telefono ?? (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.email ?? (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.notas ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                        title={p.notas}
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="max-w-[160px] truncate">
                          {p.notas}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(p)}
                      className="gap-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PacienteDialog
        key={editing?.id ?? "__nuevo__"}
        open={dialogOpen}
        onClose={handleClose}
        paciente={editing}
      />
    </div>
  );
}
