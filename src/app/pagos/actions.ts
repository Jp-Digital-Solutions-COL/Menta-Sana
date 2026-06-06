"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toDateStr, startOfWeek, endOfWeek, todayBogota } from "@/app/agenda/utils";
import type { CuentaPorCobrar, DoctorItem, MetodoItem, PagosData } from "./types";

export const DEFAULT_PLANTILLA =
  "Hola {nombre}, le recordamos cordialmente que tiene un saldo pendiente de {monto} {sesiones}. Por favor contáctenos para coordinar el pago. ¡Muchas gracias!";

const METODO_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  nequi: "Nequi",
  daviplata: "Daviplata",
  bold: "Bold",
  wompi: "Wompi",
  otro: "Otro",
};

function groupByMetodo(pagos: { monto: number | string; metodo_pago: string }[]): MetodoItem[] {
  const map: Record<string, { total: number; count: number }> = {};
  for (const p of pagos) {
    if (!map[p.metodo_pago]) map[p.metodo_pago] = { total: 0, count: 0 };
    map[p.metodo_pago].total += Number(p.monto);
    map[p.metodo_pago].count += 1;
  }
  return Object.entries(map)
    .map(([metodo, { total, count }]) => ({
      metodo,
      label: METODO_LABELS[metodo] ?? metodo,
      total,
      count,
    }))
    .sort((a, b) => b.total - a.total);
}

export async function getPagosData(input: {
  periodoDesde: string;
  periodoHasta: string;
  doctorId?: string | null;
}): Promise<PagosData> {
  const supabase = await createClient();
  const now = todayBogota();

  const mesDesde = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
  const mesHasta = toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const semanaDesde = toDateStr(startOfWeek(now));
  const semanaHasta = toDateStr(endOfWeek(now));

  const dr = input.doctorId ?? null;

  function buildPagosQuery(desde: string, hasta: string) {
    let q = supabase
      .from("pagos")
      .select("monto, metodo_pago")
      .gte("fecha_pago", desde)
      .lte("fecha_pago", hasta + "T23:59:59");
    if (dr) q = q.eq("doctor_id", dr);
    return q;
  }

  function buildCCPQuery() {
    let q = supabase
      .from("citas")
      .select("id, tarifa, inicio, paciente_id, pacientes(nombre, telefono)")
      .not("tarifa", "is", null)
      .neq("estado", "cancelada")
      .neq("estado", "bloqueada")
      .lt("inicio", new Date().toISOString());
    if (dr) q = q.eq("doctor_id", dr);
    return q;
  }

  const [
    { data: pagosPeriodo },
    { data: pagosMes },
    { data: pagosSemana },
    { data: rawCitas },
  ] = await Promise.all([
    buildPagosQuery(input.periodoDesde, input.periodoHasta),
    buildPagosQuery(mesDesde, mesHasta),
    buildPagosQuery(semanaDesde, semanaHasta),
    buildCCPQuery(),
  ]);

  const totalPeriodo = (pagosPeriodo ?? []).reduce((s, p) => s + Number(p.monto), 0);
  const porMetodo = groupByMetodo(pagosPeriodo ?? []);
  const totalMes = (pagosMes ?? []).reduce((s, p) => s + Number(p.monto), 0);
  const totalSemana = (pagosSemana ?? []).reduce((s, p) => s + Number(p.monto), 0);

  // Exclude placeholder patients
  const citas = (rawCitas ?? []).filter(
    (c) => (c.pacientes as unknown as { nombre: string } | null)?.nombre !== "__bloqueo__"
  );

  const citaIds = citas.map((c) => c.id);
  const pagosMapCCP: Record<string, number> = {};

  if (citaIds.length > 0) {
    const { data: pagosCCP } = await supabase
      .from("pagos")
      .select("cita_id, monto")
      .in("cita_id", citaIds);
    for (const p of pagosCCP ?? []) {
      pagosMapCCP[p.cita_id] = (pagosMapCCP[p.cita_id] ?? 0) + Number(p.monto);
    }
  }

  const patientMap: Record<string, CuentaPorCobrar> = {};
  for (const c of citas) {
    const totalPagado = pagosMapCCP[c.id] ?? 0;
    const saldo = Number(c.tarifa) - totalPagado;
    if (saldo <= 0) continue;
    const pac = c.pacientes as unknown as { nombre: string; telefono: string | null } | null;
    if (!patientMap[c.paciente_id]) {
      patientMap[c.paciente_id] = {
        pacienteId: c.paciente_id,
        nombre: pac?.nombre ?? "—",
        telefono: pac?.telefono ?? null,
        totalAdeudado: 0,
        sesionesCount: 0,
        sesionMasAntigua: c.inicio,
        sesionFechas: [],
      };
    }
    const entry = patientMap[c.paciente_id];
    entry.totalAdeudado += saldo;
    entry.sesionesCount += 1;
    entry.sesionFechas.push(c.inicio);
    if (c.inicio < entry.sesionMasAntigua) entry.sesionMasAntigua = c.inicio;
  }

  const cuentasPorCobrar = Object.values(patientMap)
    .map((p) => ({ ...p, sesionFechas: p.sesionFechas.sort((a, b) => b.localeCompare(a)) }))
    .sort((a, b) => b.totalAdeudado - a.totalAdeudado);
  const totalCCP = cuentasPorCobrar.reduce((s, p) => s + p.totalAdeudado, 0);

  return { totalPeriodo, totalMes, totalSemana, totalCCP, porMetodo, cuentasPorCobrar };
}

export async function getDoctoresDelConsultorio(): Promise<DoctorItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("doctores")
    .select("id, nombre, titulo")
    .eq("activo", true)
    .order("nombre");
  return (data ?? []) as DoctorItem[];
}

export async function getPlantillaWhatsapp(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return DEFAULT_PLANTILLA;

  const { data: profile } = await supabase
    .from("profiles")
    .select("consultorio_id")
    .eq("id", user.id)
    .single();
  if (!profile?.consultorio_id) return DEFAULT_PLANTILLA;

  const { data } = await supabase
    .from("consultorios")
    .select("plantilla_whatsapp_cobro")
    .eq("id", profile.consultorio_id)
    .single();

  return (data as { plantilla_whatsapp_cobro: string | null } | null)
    ?.plantilla_whatsapp_cobro ?? DEFAULT_PLANTILLA;
}

export async function savePlantillaWhatsapp(
  plantilla: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("consultorio_id")
    .eq("id", user.id)
    .single();
  if (!profile?.consultorio_id) return { error: "Sin consultorio." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("consultorios")
    .update({ plantilla_whatsapp_cobro: plantilla.trim() || DEFAULT_PLANTILLA })
    .eq("id", profile.consultorio_id);

  if (error) return { error: "No se pudo guardar la plantilla." };
  return {};
}
