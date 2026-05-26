"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Doctor, Horario, HorarioDia, Ubicacion } from "./types";

export async function getDoctores(): Promise<Doctor[]> {
  const supabase = await createClient();
  // RLS filtra por consultorio automáticamente
  const { data, error } = await supabase
    .from("doctores")
    .select("*")
    .order("nombre");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createDoctor(
  nombre: string,
  especialidad: string,
  foto_url: string | null,
  titulo: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Necesitamos consultorio_id para el INSERT (no es filtro, es valor de columna)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("consultorio_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.consultorio_id) {
    return { error: "No se encontró el consultorio." };
  }

  const { error } = await supabase.from("doctores").insert({
    nombre: nombre.trim(),
    titulo: titulo || null,
    especialidad: especialidad.trim() || null,
    foto_url,
    consultorio_id: profile.consultorio_id,
    activo: true,
  });

  if (error) return { error: "No se pudo crear el doctor." };
  revalidatePath("/doctores");
  return {};
}

export async function updateDoctor(
  id: string,
  nombre: string,
  especialidad: string,
  foto_url: string | null,
  titulo: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("doctores")
    .update({ nombre: nombre.trim(), titulo: titulo || null, especialidad: especialidad.trim() || null, foto_url })
    .eq("id", id);

  if (error) return { error: "No se pudo actualizar el doctor." };
  revalidatePath("/doctores");
  return {};
}

export async function toggleDoctorActivo(
  id: string,
  activo: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("doctores")
    .update({ activo })
    .eq("id", id);

  if (error) return { error: "No se pudo cambiar el estado." };
  revalidatePath("/doctores");
  return {};
}

export async function getHorarios(doctorId: string): Promise<Horario[]> {
  const supabase = await createClient();
  // RLS garantiza que solo vemos horarios de doctores propios
  const { data, error } = await supabase
    .from("horarios")
    .select("*")
    .eq("doctor_id", doctorId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveHorarios(
  doctorId: string,
  dias: Record<number, HorarioDia>
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const toInsert = Object.entries(dias)
    .filter(([, d]) => d.enabled)
    .map(([dia, d]) => ({
      doctor_id: doctorId,
      dia_semana: Number(dia),
      hora_inicio: d.hora_inicio,
      hora_fin: d.hora_fin,
      almuerzo_inicio: d.almuerzo_inicio || null,
      almuerzo_fin: d.almuerzo_fin || null,
      ubicacion_id: d.ubicacion_id || null,
    }));

  // Eliminar todos y reinsertar (estrategia simple y atómica)
  const { error: delError } = await supabase
    .from("horarios")
    .delete()
    .eq("doctor_id", doctorId);

  if (delError) return { error: delError.message };

  if (toInsert.length > 0) {
    const { error } = await supabase.from("horarios").insert(toInsert);
    if (error) return { error: error.message };
  }

  revalidatePath("/doctores");
  return {};
}

// ── Ubicaciones / Sedes ────────────────────────────────────────────────────

export async function getUbicaciones(doctorId: string): Promise<Ubicacion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ubicaciones_doctor")
    .select("id, doctor_id, nombre, direccion, telefono, maps_url")
    .eq("doctor_id", doctorId)
    .order("created_at");
  if (error) return [];
  return (data ?? []) as Ubicacion[];
}

export async function createUbicacion(
  doctorId: string,
  nombre: string,
  direccion: string | null,
  telefono: string | null,
  mapsUrl: string | null = null
): Promise<{ data?: Ubicacion; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ubicaciones_doctor")
    .insert({
      doctor_id: doctorId,
      nombre: nombre.trim(),
      direccion: direccion?.trim() || null,
      telefono: telefono?.trim() || null,
      maps_url: mapsUrl?.trim() || null,
    })
    .select("id, doctor_id, nombre, direccion, telefono, maps_url")
    .single();

  if (error) return { error: error.message };
  return { data: data as Ubicacion };
}

export async function deleteUbicacion(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ubicaciones_doctor")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/doctores");
  return {};
}
