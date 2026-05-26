"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Paciente, PacienteFields } from "./types";

export async function getPacientes(): Promise<Paciente[]> {
  const supabase = await createClient();
  // RLS filtra por consultorio automáticamente
  const { data, error } = await supabase
    .from("pacientes")
    .select("*")
    .order("nombre");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPaciente(
  fields: PacienteFields
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("consultorio_id")
    .eq("id", user.id)
    .single();

  if (!profile?.consultorio_id) {
    return { error: "No se encontró el consultorio." };
  }

  const { error } = await supabase.from("pacientes").insert({
    consultorio_id: profile.consultorio_id,
    nombre: fields.nombre.trim(),
    telefono: fields.telefono.trim() || null,
    email: fields.email.trim() || null,
    cedula: fields.cedula.trim() || null,
    tipo_documento: fields.cedula.trim() ? fields.tipo_documento || null : null,
    notas: fields.notas.trim() || null,
  });

  if (error) return { error: "No se pudo crear el paciente." };
  revalidatePath("/pacientes");
  return {};
}

export async function updatePaciente(
  id: string,
  fields: PacienteFields
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pacientes")
    .update({
      nombre: fields.nombre.trim(),
      telefono: fields.telefono.trim() || null,
      email: fields.email.trim() || null,
      cedula: fields.cedula.trim() || null,
      tipo_documento: fields.cedula.trim() ? fields.tipo_documento || null : null,
      notas: fields.notas.trim() || null,
    })
    .eq("id", id);

  if (error) return { error: "No se pudo actualizar el paciente." };
  revalidatePath("/pacientes");
  return {};
}
