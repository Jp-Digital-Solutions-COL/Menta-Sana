"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type ConsultorioConfig = {
  id: string;
  nombre: string | null;
  direccion: string | null;
  telefono_contacto: string | null;
  maps_url: string | null;
};

export async function getConsultorioConfig(): Promise<ConsultorioConfig | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("consultorio_id")
    .eq("id", user.id)
    .single();
  if (!profile?.consultorio_id) return null;

  const { data } = await supabase
    .from("consultorios")
    .select("id, nombre, direccion, telefono_contacto, maps_url")
    .eq("id", profile.consultorio_id)
    .single();

  return data ?? null;
}

export async function updateConsultorioConfig(input: {
  nombre: string;
  direccion: string;
  telefono_contacto: string;
  maps_url: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("consultorio_id, rol")
    .eq("id", user.id)
    .single();

  if (!profile?.consultorio_id) return { error: "Sin consultorio asignado." };
  if (!["admin", "secretaria", "doctor"].includes(profile.rol)) return { error: "Sin permisos." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("consultorios")
    .update({
      nombre: input.nombre.trim() || null,
      direccion: input.direccion.trim() || null,
      telefono_contacto: input.telefono_contacto.trim() || null,
      maps_url: input.maps_url.trim() || null,
    })
    .eq("id", profile.consultorio_id);

  if (error) return { error: "No se pudo actualizar la configuración." };
  revalidatePath("/configuracion");
  return {};
}
