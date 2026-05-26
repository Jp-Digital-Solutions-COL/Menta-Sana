"use client";

import { useState } from "react";
import { createConsultorio } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Image from "next/image";

export default function OnboardingForm() {
  const [nombre, setNombre] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await createConsultorio(nombre);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // Si no hay error, el servidor hace redirect("/") y el componente se desmonta
  }

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-md">
      <Image
        src="/Menta-Sana-completo.png"
        alt="Med-Agenda"
        width={280}
        height={110}
        className="h-28 w-auto"
        priority
      />
      <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Configura tu consultorio</CardTitle>
        <CardDescription>
          Ingresa el nombre de tu consultorio para comenzar tu período de prueba
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre del consultorio</Label>
            <Input
              id="nombre"
              placeholder="Consultorio Dr. García"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              disabled={loading}
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !nombre.trim()}
          >
            {loading ? "Creando..." : "Crear consultorio"}
          </Button>
        </form>
      </CardContent>
      </Card>
    </div>
  );
}
