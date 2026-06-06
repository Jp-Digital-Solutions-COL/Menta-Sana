"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Paciente, PacienteFields, ResumenCitaPago } from "./types";

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

export async function getResumenPagosPaciente(
  pacienteId: string
): Promise<ResumenCitaPago[]> {
  const supabase = await createClient();

  const { data: citas } = await supabase
    .from("citas")
    .select("id, inicio, estado, motivo, tarifa, doctores(nombre, titulo)")
    .eq("paciente_id", pacienteId)
    .neq("estado", "bloqueada")
    .order("inicio", { ascending: false });

  if (!citas || citas.length === 0) return [];

  const citaIds = citas.map((c) => c.id);

  const { data: pagos } = await supabase
    .from("pagos")
    .select("cita_id, monto")
    .in("cita_id", citaIds);

  const pagosMap: Record<string, number> = {};
  for (const p of pagos ?? []) {
    pagosMap[p.cita_id] = (pagosMap[p.cita_id] ?? 0) + Number(p.monto);
  }

  return citas.map((c) => {
    const doc = c.doctores as unknown as { nombre: string; titulo: string | null } | null;
    const totalPagado = pagosMap[c.id] ?? 0;
    const tarifa = c.tarifa != null ? Number(c.tarifa) : null;
    const saldo = tarifa != null ? tarifa - totalPagado : null;
    const estadoPago =
      totalPagado === 0 ? "pendiente"
      : tarifa != null && totalPagado >= tarifa ? "pagado"
      : "parcial";

    return {
      citaId: c.id,
      inicio: c.inicio,
      estado: c.estado,
      motivo: c.motivo,
      tarifa,
      doctorNombre: doc?.nombre ?? "",
      doctorTitulo: doc?.titulo ?? null,
      totalPagado,
      saldo,
      estadoPago,
    } as ResumenCitaPago;
  });
}
