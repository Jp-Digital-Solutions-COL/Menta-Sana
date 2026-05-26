import { createAdminClient } from "@/lib/supabase/admin";
import { sendConfirmacionCita } from "@/lib/email";

function formatFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

function formatHora(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

export async function GET(request: Request) {
  // ── Autenticación ─────────────────────────────────────────
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // ── Ventana de tiempo: mañana en UTC ──────────────────────
  const ahora = new Date();
  const manana = new Date(
    Date.UTC(
      ahora.getUTCFullYear(),
      ahora.getUTCMonth(),
      ahora.getUTCDate() + 1
    )
  );
  const pasadoManana = new Date(manana.getTime() + 24 * 3600 * 1000);

  // ── Citas programadas para mañana ─────────────────────────
  const { data: citas, error: citasError } = await supabase
    .from("citas")
    .select(
      `id, inicio, motivo, token_confirmacion,
       doctores  ( nombre, especialidad, foto_url ),
       pacientes ( nombre, email ),
       consultorios ( nombre, direccion, telefono_contacto )`
    )
    .eq("estado", "programada")
    .gte("inicio", manana.toISOString())
    .lt("inicio", pasadoManana.toISOString());

  if (citasError) {
    console.error("[recordatorios] Error al consultar citas:", citasError);
    return Response.json({ error: "Error al consultar citas" }, { status: 500 });
  }

  const resultados: { citaId: string; estado: "enviado" | "sin_email" | "error"; detalle?: string }[] = [];

  for (const cita of citas ?? []) {
    const paciente    = (cita.pacientes    as unknown) as { nombre: string; email: string | null } | null;
    const doctor      = (cita.doctores     as unknown) as { nombre: string; especialidad: string | null; foto_url: string | null } | null;
    const consultorio = (cita.consultorios as unknown) as { nombre: string | null; direccion: string | null; telefono_contacto: string | null } | null;

    if (!paciente?.email) {
      resultados.push({ citaId: cita.id, estado: "sin_email" });
      continue;
    }

    // ── Evitar duplicados ────────────────────────────────────
    const { data: yaEnviado } = await supabase
      .from("recordatorios")
      .select("id")
      .eq("cita_id", cita.id)
      .eq("tipo", "email")
      .maybeSingle();

    if (yaEnviado) {
      resultados.push({ citaId: cita.id, estado: "enviado", detalle: "ya enviado" });
      continue;
    }

    // ── Enviar email ─────────────────────────────────────────
    const { error: emailError } = await sendConfirmacionCita({
      to: paciente.email,
      paciente: paciente.nombre,
      doctor: doctor?.nombre ?? "tu doctor",
      especialidad: doctor?.especialidad ?? null,
      fotoUrl: doctor?.foto_url ?? null,
      fecha: formatFecha(cita.inicio),
      hora: formatHora(cita.inicio),
      motivo: (cita.motivo as string | null) ?? null,
      secretariaWA: null,
      secretariaEmail: null,
      tokenConfirmacion: (cita.token_confirmacion as string | null) ?? null,
      consultorioNombre: consultorio?.nombre ?? null,
      consultorioDireccion: consultorio?.direccion ?? null,
      consultorioTelefono: consultorio?.telefono_contacto ?? null,
    });

    const estadoEnvio = emailError ? "error" : "enviado";

    if (emailError) {
      console.error("[recordatorios] Email error para cita", cita.id, emailError);
    }

    // ── Registrar en recordatorios ───────────────────────────
    const { error: insertError } = await supabase.from("recordatorios").insert({
      cita_id:    cita.id,
      tipo:       "email",
      estado:     estadoEnvio,
      enviado_en: new Date().toISOString(),
    });

    if (insertError) {
      console.error("[recordatorios] Error al insertar registro:", insertError);
    }

    resultados.push({
      citaId: cita.id,
      estado: estadoEnvio,
      ...(emailError ? { detalle: emailError } : {}),
    });
  }

  const enviados = resultados.filter((r) => r.estado === "enviado").length;
  const sinEmail = resultados.filter((r) => r.estado === "sin_email").length;
  const errores  = resultados.filter((r) => r.estado === "error").length;

  console.log(`[recordatorios] Procesadas ${citas?.length ?? 0} citas — enviados: ${enviados}, sin email: ${sinEmail}, errores: ${errores}`);

  return Response.json({ ok: true, enviados, sinEmail, errores, total: citas?.length ?? 0 });
}
