"use server";

import { createClient } from "@/lib/supabase/server";

export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ error?: string; redirectTo?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Correo o contraseña incorrectos." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "No se pudo verificar la sesión." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, consultorio_id")
    .eq("id", user.id)
    .single();

  if (profile?.rol === "superadmin") return { redirectTo: "/admin" };
  if (!profile?.consultorio_id) return { redirectTo: "/onboarding" };

  const { data: consultorio } = await supabase
    .from("consultorios")
    .select("estado_suscripcion")
    .eq("id", profile.consultorio_id)
    .single();

  if (consultorio?.estado_suscripcion === "suspendido") {
    return { redirectTo: "/suspendido" };
  }

  return { redirectTo: "/inicio" };
}
