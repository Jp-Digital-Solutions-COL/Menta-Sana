"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Image from "next/image";

type Stage = "loading" | "form" | "success" | "invalid";

export default function RestablecerContrasenaPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Read URL params client-side to avoid Next.js Suspense requirement on useSearchParams
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const errorParam = params.get("error");

    if (errorParam || !code) {
      setStage("invalid");
      return;
    }

    // Exchange the PKCE recovery code for an active session
    const supabase = createClient();
    supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
      if (exchangeError) {
        setStage("invalid");
      } else {
        setStage("form");
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      if (
        updateError.message.toLowerCase().includes("session") ||
        updateError.message.toLowerCase().includes("expired") ||
        updateError.message.toLowerCase().includes("jwt")
      ) {
        setError(
          "La sesión ha expirado. Cierra esta pestaña y solicita un nuevo enlace de restablecimiento."
        );
      } else {
        setError(updateError.message);
      }
      return;
    }
    setStage("success");
    setTimeout(() => router.push("/login"), 2500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-md">
        <Image
          src="/Menta-Sana-completo.png"
          alt="Menta Sana"
          width={840}
          height={330}
          className="h-[200px] w-auto max-w-full"
          priority
        />
        <Card className="w-full">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-lg">Nueva contraseña</CardTitle>
          </CardHeader>
          <CardContent>
            {stage === "loading" && (
              <p className="text-center text-sm text-muted-foreground py-8">
                Verificando enlace...
              </p>
            )}

            {stage === "invalid" && (
              <div className="text-center space-y-3 py-4">
                <p className="text-sm font-medium text-destructive">
                  Este enlace de restablecimiento no es válido o ya expiró.
                </p>
                <p className="text-xs text-muted-foreground">
                  Solicita un nuevo enlace desde el panel de administración.
                </p>
              </div>
            )}

            {stage === "form" && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <CardDescription className="text-center text-sm pb-1">
                  Escribe tu nueva contraseña para acceder a tu cuenta.
                </CardDescription>
                <div className="space-y-2">
                  <Label htmlFor="password">Nueva contraseña</Label>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    disabled={saving}
                    autoComplete="new-password"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirmar contraseña</Label>
                  <PasswordInput
                    id="confirm"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    disabled={saving}
                    autoComplete="new-password"
                    placeholder="Repite la contraseña"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar nueva contraseña"}
                </Button>
              </form>
            )}

            {stage === "success" && (
              <div className="text-center space-y-2 py-4">
                <p className="text-sm font-medium text-green-700">
                  ¡Contraseña actualizada correctamente!
                </p>
                <p className="text-xs text-muted-foreground">
                  Redirigiendo al inicio de sesión...
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
