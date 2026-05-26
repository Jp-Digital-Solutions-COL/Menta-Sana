"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CitaConRel, DoctorBasic, EstadoCita, HorarioCalendario, PacienteBasic } from "./types";
import { sendConfirmacionCita } from "@/lib/email";

export async function getDoctoresActivos(): Promise<DoctorBasic[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  let query = supabase
    .from("doctores")
    .select("id, nombre, titulo, especialidad, activo, bloqueado_pago")
    .eq("activo", true)
    .order("nombre");

  if (profile?.rol === "secretaria") {
    const admin = createAdminClient();
    const { data: asignaciones } = await admin
      .from("secretaria_doctores")
      .select("doctor_id")
      .eq("secretaria_id", user.id);

    const ids = (asignaciones ?? []).map((a) => a.doctor_id);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }

  const { data } = await query;
  return (data ?? []) as DoctorBasic[];
}

export async function getPacientesBasic(): Promise<PacienteBasic[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pacientes")
    .select("id, nombre, telefono, email, cedula, tipo_documento")
    .neq("nombre", "__bloqueo__")
    .order("nombre");
  return (data ?? []) as unknown as PacienteBasic[];
}

/** Citas en el rango [start, end] con joins. RLS filtra por consultorio. */
export async function getCitas(
  start: string,
  end: string,
  doctorId?: string
): Promise<CitaConRel[]> {
  const supabase = await createClient();
  let q = supabase
    .from("citas")
    .select("*, doctores(id, nombre, titulo), pacientes(id, nombre, telefono, cedula, email, tipo_documento)")
    .gte("inicio", start)
    .lte("inicio", end)
    .order("inicio");
  if (doctorId) q = q.eq("doctor_id", doctorId);
  const { data, error } = await q;
  if (error) { console.error("getCitas error:", error.message); return []; }
  const rows = (data ?? []) as CitaConRel[];
  return rows.map((c) =>
    c.pacientes?.nombre === "__bloqueo__" ? { ...c, estado: "bloqueada" as const } : c
  );
}

type UbicacionBasic = {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  maps_url: string | null;
  es_virtual: boolean;
};

/**
 * Horas disponibles para un doctor en una fecha.
 * dayStartISO = UTC ISO de la medianoche local del día (new Date(y,m-1,d).toISOString() en el cliente).
 * Excluye citaIdExcluir al reagendar.
 */
export async function getHorasDisponibles(
  doctorId: string,
  fecha: string,       // "YYYY-MM-DD" — para calcular dia_semana
  dayStartISO: string, // UTC ISO de medianoche local del día
  citaIdExcluir?: string
): Promise<{ slots: { hora: string; ocupado: boolean }[]; duracionCita: number }> {
  const supabase = await createClient();

  const [y, mo, d] = fecha.split("-").map(Number);
  const diaSemana = new Date(y, mo - 1, d).getDay();

  const { data: horarioData } = await supabase
    .from("horarios")
    .select("hora_inicio, hora_fin, almuerzo_inicio, almuerzo_fin")
    .eq("doctor_id", doctorId)
    .eq("dia_semana", diaSemana)
    .single();

  const horario = horarioData ?? { hora_inicio: "07:00", hora_fin: "20:00", almuerzo_inicio: null, almuerzo_fin: null };

  const dayEndISO = new Date(
    new Date(dayStartISO).getTime() + 24 * 3600 * 1000
  ).toISOString();

  let q = supabase
    .from("citas")
    .select("inicio, fin")
    .eq("doctor_id", doctorId)
    .gte("inicio", dayStartISO)
    .lt("inicio", dayEndISO)
    .neq("estado", "cancelada");

  if (citaIdExcluir) q = q.neq("id", citaIdExcluir);

  const { data: ocupadas } = await q;

  const [sh, sm] = horario.hora_inicio.split(":").map(Number);
  const [eh, em] = horario.hora_fin.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const dur = 30;

  const dayStartMs = new Date(dayStartISO).getTime();
  const slots: { hora: string; ocupado: boolean }[] = [];

  function hmToMin(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
  const alMin = (horario.almuerzo_inicio && horario.almuerzo_fin)
    ? { start: hmToMin(horario.almuerzo_inicio), end: hmToMin(horario.almuerzo_fin) }
    : null;

  for (let min = startMin; min + dur <= endMin; min += dur) {
    if (alMin && min < alMin.end && min + dur > alMin.start) continue;

    const slotStartMs = dayStartMs + min * 60000;
    const slotEndMs = dayStartMs + (min + dur) * 60000;

    const ocupado = (ocupadas ?? []).some((c) => {
      const cStartMs = new Date(c.inicio).getTime();
      const cEndMs = new Date(c.fin).getTime();
      return slotStartMs < cEndMs && slotEndMs > cStartMs;
    });

    slots.push({
      hora: `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`,
      ocupado,
    });
  }

  return { slots, duracionCita: dur };
}

/** Devuelve las ubicaciones de un doctor: el consultorio principal primero, luego las extras. */
export async function getUbicacionesParaCita(doctorId: string): Promise<UbicacionBasic[]> {
  const supabase = await createClient();

  const [{ data: { user } }, { data: extras }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("ubicaciones_doctor")
      .select("id, nombre, direccion, telefono, maps_url, es_virtual")
      .eq("doctor_id", doctorId)
      .order("created_at"),
  ]);

  let principal: UbicacionBasic | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("consultorio_id")
      .eq("id", user.id)
      .single();
    if (profile?.consultorio_id) {
      const { data: consult } = await supabase
        .from("consultorios")
        .select("nombre, direccion, telefono_contacto, maps_url")
        .eq("id", profile.consultorio_id)
        .single();
      if (consult) {
        principal = {
          id: "__principal__",
          nombre: (consult.nombre as string | null) ?? "Consultorio principal",
          direccion: consult.direccion as string | null,
          telefono: consult.telefono_contacto as string | null,
          maps_url: consult.maps_url as string | null,
          es_virtual: false,
        };
      }
    }
  }

  const result = (extras ?? []) as UbicacionBasic[];
  return principal ? [principal, ...result] : result;
}

const MEET_PREFIX = "https://meet.google.com/";

export async function createCita(input: {
  doctorId: string;
  pacienteId: string;
  inicioISO: string;
  finISO: string;
  motivo: string;
  ubicacionId?: string | null;
  meetLink?: string | null;
}): Promise<{ error?: string }> {
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
  if (!profile?.consultorio_id) return { error: "Sin consultorio." };

  // Validar sobreposición — bloqueo estricto
  const { data: overlap } = await supabase
    .from("citas")
    .select("id")
    .eq("doctor_id", input.doctorId)
    .neq("estado", "cancelada")
    .lt("inicio", input.finISO)
    .gt("fin", input.inicioISO)
    .maybeSingle();

  if (overlap) return { error: "Ya existe una cita en ese horario para este doctor." };

  // Validar meet_link si la ubicación es virtual
  let meetLinkFinal: string | null = null;
  if (input.ubicacionId) {
    const { data: ub } = await supabase
      .from("ubicaciones_doctor")
      .select("es_virtual")
      .eq("id", input.ubicacionId)
      .single();
    if (ub?.es_virtual) {
      const ml = input.meetLink?.trim() ?? "";
      if (!ml.startsWith(MEET_PREFIX)) {
        return { error: "Para citas virtuales se requiere un link válido de Google Meet (https://meet.google.com/...)." };
      }
      meetLinkFinal = ml;
    }
  }

  const token = crypto.randomUUID();

  const admin = createAdminClient();
  const { data: newCita, error } = await admin
    .from("citas")
    .insert({
      consultorio_id: profile.consultorio_id,
      doctor_id: input.doctorId,
      paciente_id: input.pacienteId,
      inicio: input.inicioISO,
      fin: input.finISO,
      motivo: input.motivo.trim() || null,
      estado: "programada",
      creado_por: user.id,
      token_confirmacion: token,
      ubicacion_id: input.ubicacionId ?? null,
      meet_link: meetLinkFinal,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createCita] insert error:", error.message, error.code);
    return { error: "No se pudo crear la cita." };
  }
  revalidatePath("/agenda");

  // Enviar correo de confirmación (no bloquea la creación si falla)
  try {
    const [pacienteResult, doctorResult, perfilResult, consultorioResult, ubicacionResult] = await Promise.all([
      supabase.from("pacientes").select("nombre, email").eq("id", input.pacienteId).single(),
      supabase.from("doctores").select("nombre, titulo, foto_url, especialidad").eq("id", input.doctorId).single(),
      supabase.from("profiles").select("telefono").eq("id", user.id).single(),
      supabase.from("consultorios").select("nombre, direccion, telefono_contacto, maps_url").eq("id", profile.consultorio_id).single(),
      input.ubicacionId
        ? supabase.from("ubicaciones_doctor").select("nombre, direccion, telefono, maps_url, es_virtual").eq("id", input.ubicacionId).single()
        : Promise.resolve({ data: null }),
    ]);

    const pacienteEmail = pacienteResult.data?.email;
    if (pacienteEmail) {
      const inicio = new Date(input.inicioISO);
      const tz = "America/Bogota";
      const fechaLabel = inicio.toLocaleDateString("es-CO", {
        weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz,
      });
      const horaLabel = inicio.toLocaleTimeString("es-CO", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz,
      });

      const ub = ubicacionResult.data as { nombre?: string | null; direccion?: string | null; telefono?: string | null; maps_url?: string | null; es_virtual?: boolean } | null;
      const consult = consultorioResult.data as { nombre?: string | null; direccion?: string | null; telefono_contacto?: string | null; maps_url?: string | null } | null;
      const lugarNombre = ub?.nombre ?? consult?.nombre ?? null;
      const lugarDireccion = ub?.es_virtual ? null : (ub?.direccion ?? consult?.direccion ?? null);
      const lugarTelefono = ub?.telefono ?? consult?.telefono_contacto ?? null;
      const lugarMapsUrl = ub?.es_virtual ? null : (ub?.maps_url ?? consult?.maps_url ?? null);

      const emailResult = await sendConfirmacionCita({
        to: pacienteEmail,
        paciente: pacienteResult.data?.nombre ?? "",
        doctor: doctorResult.data?.nombre ?? "",
        doctorTitulo: (doctorResult.data as { titulo?: string | null } | null)?.titulo ?? null,
        especialidad: doctorResult.data?.especialidad ?? null,
        fotoUrl: doctorResult.data?.foto_url ?? null,
        fecha: fechaLabel,
        hora: horaLabel,
        motivo: input.motivo.trim() || null,
        secretariaWA: (perfilResult.data as { telefono?: string | null } | null)?.telefono ?? null,
        secretariaEmail: user.email ?? null,
        titulo: "Cita agendada",
        intro: "le informamos que se ha agendado su cita con los siguientes detalles",
        consultorioNombre: lugarNombre,
        consultorioDireccion: lugarDireccion,
        consultorioTelefono: lugarTelefono,
        consultorioMapsUrl: lugarMapsUrl,
        meetLink: meetLinkFinal,
      });

      if (emailResult.error) {
        console.error("[createCita] Email error:", emailResult.error);
      }

      await supabase.from("recordatorios").insert({
        cita_id: newCita.id,
        tipo: "email",
        estado: emailResult.error ? "error" : "enviado",
        enviado_en: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error("[createCita] Error al enviar correo de confirmación:", e);
  }

  return {};
}

export async function updateEstado(
  id: string,
  estado: EstadoCita
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("citas")
    .update({ estado })
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar el estado." };
  revalidatePath("/agenda");
  return {};
}

export async function reagendar(
  id: string,
  inicioISO: string,
  finISO: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // Obtener doctor_id de la cita a reagendar
  const { data: citaData } = await supabase
    .from("citas")
    .select("doctor_id")
    .eq("id", id)
    .single();

  if (citaData?.doctor_id) {
    const { data: overlap } = await supabase
      .from("citas")
      .select("id")
      .eq("doctor_id", citaData.doctor_id)
      .neq("id", id)
      .neq("estado", "cancelada")
      .lt("inicio", finISO)
      .gt("fin", inicioISO)
      .maybeSingle();

    if (overlap) return { error: "Ya existe una cita en ese horario para este doctor." };
  }

  const { error } = await supabase
    .from("citas")
    .update({ inicio: inicioISO, fin: finISO })
    .eq("id", id);
  if (error) return { error: "No se pudo reagendar la cita." };
  revalidatePath("/agenda");
  return {};
}

export async function deleteCita(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("citas").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar la cita." };
  revalidatePath("/agenda");
  return {};
}

export async function bloquearHoras(input: {
  doctorId: string;
  inicioISO: string;
  finISO: string;
  motivo?: string;
}): Promise<{ error?: string }> {
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
  if (!profile?.consultorio_id) return { error: "Sin consultorio." };

  const admin = createAdminClient();

  // paciente_id is NOT NULL — use a per-consultorio placeholder patient
  let placeholderId: string;
  const { data: existing } = await admin
    .from("pacientes")
    .select("id")
    .eq("consultorio_id", profile.consultorio_id)
    .eq("nombre", "__bloqueo__")
    .maybeSingle();

  if (existing) {
    placeholderId = existing.id;
  } else {
    const { data: created, error: createErr } = await admin
      .from("pacientes")
      .insert({ nombre: "__bloqueo__", consultorio_id: profile.consultorio_id })
      .select("id")
      .single();
    if (createErr || !created) return { error: "No se pudo preparar el bloqueo." };
    placeholderId = created.id;
  }

  const { error } = await admin.from("citas").insert({
    consultorio_id: profile.consultorio_id,
    doctor_id: input.doctorId,
    paciente_id: placeholderId,
    inicio: input.inicioISO,
    fin: input.finISO,
    motivo: input.motivo?.trim() || null,
    estado: "programada",
    creado_por: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/agenda");
  return {};
}

export async function sendConfirmacionEmail(params: {
  citaId: string;
  doctorId: string;
  to: string;
  paciente: string;
  doctor: string;
  fecha: string;
  hora: string;
  motivo: string | null;
  token?: string | null;
}): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Si la cita no tiene token (citas previas al deploy), generar y persistir uno ahora
  let token = params.token ?? null;
  if (!token) {
    token = crypto.randomUUID();
    const admin = createAdminClient();
    await admin
      .from("citas")
      .update({ token_confirmacion: token })
      .eq("id", params.citaId);
  }

  const [doctorResult, profileResult, citaResult] = await Promise.all([
    supabase.from("doctores").select("titulo, foto_url, especialidad").eq("id", params.doctorId).single(),
    user
      ? supabase.from("profiles").select("telefono, consultorio_id").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
    supabase.from("citas").select("inicio, ubicacion_id, meet_link").eq("id", params.citaId).single(),
  ]);

  const consultorioId = (profileResult.data as { consultorio_id?: string | null } | null)?.consultorio_id;
  const citaUbicacionId = (citaResult.data as { ubicacion_id?: string | null; meet_link?: string | null } | null)?.ubicacion_id;
  const citaMeetLink = (citaResult.data as { meet_link?: string | null } | null)?.meet_link ?? null;

  const [consultorioResult, ubicacionResult] = await Promise.all([
    consultorioId
      ? supabase.from("consultorios").select("nombre, direccion, telefono_contacto, maps_url").eq("id", consultorioId).single()
      : Promise.resolve(null),
    citaUbicacionId
      ? supabase.from("ubicaciones_doctor").select("nombre, direccion, telefono, maps_url, es_virtual").eq("id", citaUbicacionId).single()
      : Promise.resolve(null),
  ]);

  const ub2 = ubicacionResult?.data as { nombre?: string | null; direccion?: string | null; telefono?: string | null; maps_url?: string | null; es_virtual?: boolean } | null;
  const consult2 = consultorioResult?.data as { nombre?: string | null; direccion?: string | null; telefono_contacto?: string | null; maps_url?: string | null } | null;
  const lugarNombre = ub2?.nombre ?? consult2?.nombre ?? null;
  const lugarDireccion = ub2?.es_virtual ? null : (ub2?.direccion ?? consult2?.direccion ?? null);
  const lugarTelefono = ub2?.telefono ?? consult2?.telefono_contacto ?? null;
  const lugarMapsUrl = ub2?.es_virtual ? null : (ub2?.maps_url ?? consult2?.maps_url ?? null);

  return sendConfirmacionCita({
    to: params.to,
    paciente: params.paciente,
    doctor: params.doctor,
    doctorTitulo: (doctorResult.data as { titulo?: string | null } | null)?.titulo ?? null,
    especialidad: doctorResult.data?.especialidad ?? null,
    fotoUrl: doctorResult.data?.foto_url ?? null,
    fecha: params.fecha,
    hora: params.hora,
    motivo: params.motivo,
    secretariaWA: (profileResult.data as { telefono?: string | null } | null)?.telefono ?? null,
    secretariaEmail: user?.email ?? null,
    tokenConfirmacion: token,
    consultorioNombre: lugarNombre,
    consultorioDireccion: lugarDireccion,
    consultorioTelefono: lugarTelefono,
    consultorioMapsUrl: lugarMapsUrl,
    meetLink: citaMeetLink,
  });
}

export async function createPaciente(input: {
  nombre: string;
  telefono?: string;
  email?: string;
  cedula?: string;
  tipo_documento?: string;
}): Promise<{ data?: PacienteBasic; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("consultorio_id")
    .eq("id", user.id)
    .single();
  if (!profile?.consultorio_id) return { error: "Sin consultorio asignado." };

  const { data, error } = await supabase
    .from("pacientes")
    .insert({
      nombre: input.nombre.trim(),
      telefono: input.telefono?.trim() || null,
      email: input.email?.trim() || null,
      cedula: input.cedula?.trim() || null,
      tipo_documento: input.tipo_documento || null,
      consultorio_id: profile.consultorio_id,
    })
    .select("id, nombre, telefono, email, cedula, tipo_documento")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/agenda");
  return { data: data as unknown as PacienteBasic };
}

/** Devuelve nombre, dirección y maps_url del lugar de una cita (ubicacion_id de la cita o consultorio principal). */
export async function getUbicacionParaCita(
  _doctorId: string,
  citaId: string
): Promise<{ nombre: string | null; direccion: string | null; mapsUrl: string | null }> {
  const empty = { nombre: null, direccion: null, mapsUrl: null };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return empty;

  const [citaResult, profileResult] = await Promise.all([
    supabase.from("citas").select("ubicacion_id").eq("id", citaId).single(),
    supabase.from("profiles").select("consultorio_id").eq("id", user.id).single(),
  ]);

  const ubicacionId = (citaResult.data as { ubicacion_id?: string | null } | null)?.ubicacion_id;
  if (ubicacionId) {
    const { data: ub } = await supabase
      .from("ubicaciones_doctor")
      .select("nombre, direccion, maps_url, es_virtual")
      .eq("id", ubicacionId)
      .single();
    const u = ub as { nombre?: string | null; direccion?: string | null; maps_url?: string | null; es_virtual?: boolean } | null;
    return {
      nombre: u?.nombre ?? null,
      direccion: u?.es_virtual ? null : (u?.direccion ?? null),
      mapsUrl: u?.es_virtual ? null : (u?.maps_url ?? null),
    };
  }

  const consultorioId = (profileResult.data as { consultorio_id?: string | null } | null)?.consultorio_id;
  if (!consultorioId) return empty;

  const { data: consult } = await supabase
    .from("consultorios")
    .select("nombre, direccion, maps_url")
    .eq("id", consultorioId)
    .single();
  const c = consult as { nombre?: string | null; direccion?: string | null; maps_url?: string | null } | null;
  return { nombre: c?.nombre ?? null, direccion: c?.direccion ?? null, mapsUrl: c?.maps_url ?? null };
}

export async function getHorariosParaCalendario(
  doctorIds: string[]
): Promise<HorarioCalendario[]> {
  if (doctorIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("horarios")
    .select("doctor_id, dia_semana, hora_inicio, hora_fin, almuerzo_inicio, almuerzo_fin")
    .in("doctor_id", doctorIds);
  return (data ?? []) as HorarioCalendario[];
}
