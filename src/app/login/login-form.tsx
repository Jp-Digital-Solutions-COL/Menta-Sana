"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithPassword } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import Image from "next/image";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const result = await signInWithPassword(email, password);

    if (result.error) {
      setErrorMsg(result.error);
      setLoading(false);
      return;
    }

    // Las cookies de sesión ya están confirmadas — navegamos desde el cliente
    router.push(result.redirectTo ?? "/agenda");
  }

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-md">
      <Image
        src="/Menta-Sana-completo.png"
        alt="Med-Agenda"
        width={840}
        height={330}
        className="h-[330px] w-auto max-w-full"
        priority
      />
      <Card className="w-full">
      <CardHeader className="text-center pb-2">
        <CardDescription>Ingresa con tu correo y contraseña</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              placeholder="usuario@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          {(errorMsg || urlError) && (
            <p className="text-sm text-destructive">
              {errorMsg || "Ocurrió un error inesperado."}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
      </CardContent>
      </Card>
    </div>
  );
}
