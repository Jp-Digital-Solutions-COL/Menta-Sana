"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export async function createConsultorio(nombre: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: consultorio, error: consultorioError } = await admin
    .from("consultorios")
    .insert({ nombre: nombre.trim(), estado_suscripcion: "prueba" })
    .select("id")
    .single();

  if (consultorioError) {
    return { error: "No se pudo crear el consultorio. Intenta de nuevo." };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ consultorio_id: consultorio.id })
    .eq("id", user.id);

  if (profileError) {
    return { error: "No se pudo actualizar el perfil. Intenta de nuevo." };
  }

  redirect("/");
}
