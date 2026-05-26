"use server";

import { createClient } from "@/lib/supabase/server";

export type CandidatoAdelantar = {
  id: string;
  inicio: string;
  fin: string;
  pacientes: {
    id: string;
    nombre: string;
    telefono: string | null;
  } | null;
};

export async function getCandidatos(
  doctorId: string,
  espacioISO: string,
  desdeISO: string,
  hastaISO: string,
): Promise<CandidatoAdelantar[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("citas")
    .select("id, inicio, fin, pacientes(id, nombre, telefono)")
    .eq("doctor_id", doctorId)
    .in("estado", ["programada", "confirmada"])
    .gt("inicio", espacioISO)
    .gte("inicio", desdeISO)
    .lte("inicio", hastaISO)
    .order("inicio");

  if (error) {
    console.error("getCandidatos error:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as CandidatoAdelantar[];
  return rows.filter((r) => r.pacientes?.nombre !== "__bloqueo__");
}
