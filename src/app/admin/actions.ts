"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

type EstadoSuscripcion = "prueba" | "activo" | "suspendido";

async function assertSuperadmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (profile?.rol !== "superadmin") redirect("/inicio");
}

export async function updateConsultorio(
  id: string,
  data: {
    estado_suscripcion?: EstadoSuscripcion;
    precio_por_doctor?: number;
    notas_admin?: string;
  }
) {
  await assertSuperadmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("consultorios")
    .update(data)
    .eq("id", id);

  if (error) return { error: "No se pudo actualizar el consultorio." };
  return { ok: true };
}

export async function createConsultorio(
  nombre: string
): Promise<{ error?: string; id?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("consultorios")
    .insert({ nombre: nombre.trim(), estado_suscripcion: "prueba" })
    .select("id")
    .single();

  if (error) return { error: "No se pudo crear el consultorio." };
  return { id: data.id };
}

// ── Tipos ────────────────────────────────────────────────────────────

export type SecretariaItem = { id: string; email: string; nombre: string };
export type DoctorItem = {
  id: string;
  nombre: string;
  especialidad: string | null;
  activo: boolean;
};
export type AsignacionItem = { secretaria_id: string; doctor_id: string };

export type SecretariaGlobal = {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  consultorio_id: string | null;
  consultorio_nombre: string | null;
  activo: boolean;
};

export type DoctorAdmin = {
  id: string;
  nombre: string;
  titulo: string | null;
  especialidad: string | null;
  foto_url: string | null;
  activo: boolean;
  bloqueado_pago: boolean;
  consultorio_id: string;
};

// ── Secretarias globales ──────────────────────────────────────────────

export async function getAllSecretarias(): Promise<SecretariaGlobal[]> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, nombre, consultorio_id, activo, telefono, consultorios(nombre)")
    .eq("rol", "secretaria")
    .order("nombre");

  if (!profiles?.length) return [];

  const { data: usersData } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  const emailMap = new Map(
    (usersData?.users ?? []).map((u) => [u.id, u.email ?? ""])
  );

  return profiles.map((p) => {
    const cons = p.consultorios as unknown as { nombre: string } | null;
    return {
      id: p.id,
      nombre: (p.nombre as string) ?? "",
      email: emailMap.get(p.id) ?? "",
      telefono: (p.telefono as string | null) ?? null,
      consultorio_id: (p.consultorio_id as string | null) ?? null,
      consultorio_nombre: cons?.nombre ?? null,
      activo: (p.activo as boolean) ?? true,
    };
  });
}

export async function assignSecretariaToConsultorio(
  secretariaId: string,
  consultorioId: string | null
): Promise<{ error?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("profiles")
    .update({ consultorio_id: consultorioId })
    .eq("id", secretariaId);

  if (error) return { error: "No se pudo asignar el consultorio." };
  return {};
}

export async function toggleSecretariaActivo(
  id: string,
  activo: boolean
): Promise<{ error?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("profiles")
    .update({ activo })
    .eq("id", id);

  if (error) return { error: "No se pudo actualizar el estado." };
  return {};
}

// ── Secretarias por consultorio ───────────────────────────────────────

export async function getSecretarias(
  consultorioId: string
): Promise<SecretariaItem[]> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, nombre")
    .eq("consultorio_id", consultorioId)
    .eq("rol", "secretaria");

  if (!profiles?.length) return [];

  const profileMap = new Map(profiles.map((p) => [p.id, p.nombre as string]));
  const { data: usersData } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  return (usersData?.users ?? [])
    .filter((u) => profileMap.has(u.id))
    .map((u) => ({ id: u.id, email: u.email ?? "", nombre: profileMap.get(u.id) ?? "" }));
}

export async function createSecretaria(
  consultorioId: string | null,
  email: string,
  password: string,
  nombre: string
): Promise<{ error?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    if (authError.message.includes("already registered"))
      return { error: "Ya existe un usuario con ese correo." };
    return { error: authError.message };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id: authData.user.id,
        consultorio_id: consultorioId,
        rol: "secretaria",
        nombre: nombre.trim(),
        activo: true,
      },
      { onConflict: "id", ignoreDuplicates: false }
    );

  if (profileError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: `No se pudo crear el perfil: ${profileError.message}` };
  }

  return {};
}

// ── Doctores por consultorio (admin) ──────────────────────────────────

export async function getDoctoresConsultorio(
  consultorioId: string
): Promise<DoctorItem[]> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const { data } = await admin
    .from("doctores")
    .select("id, nombre, especialidad, activo")
    .eq("consultorio_id", consultorioId)
    .order("nombre");

  return (data ?? []) as DoctorItem[];
}

export async function getDoctoresAdmin(
  consultorioId: string
): Promise<DoctorAdmin[]> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const { data } = await admin
    .from("doctores")
    .select("id, nombre, titulo, especialidad, foto_url, activo, bloqueado_pago, consultorio_id")
    .eq("consultorio_id", consultorioId)
    .order("nombre");

  return (data ?? []).map((d) => ({
    id: d.id,
    nombre: d.nombre,
    titulo: d.titulo ?? null,
    especialidad: d.especialidad ?? null,
    foto_url: d.foto_url ?? null,
    activo: d.activo ?? true,
    bloqueado_pago: d.bloqueado_pago ?? false,
    consultorio_id: d.consultorio_id,
  })) as DoctorAdmin[];
}

export async function createDoctor(
  consultorioId: string,
  nombre: string,
  especialidad?: string
): Promise<{ error?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const { data: newDoctor, error } = await admin
    .from("doctores")
    .insert({
      consultorio_id: consultorioId,
      nombre: nombre.trim(),
      especialidad: especialidad?.trim() || null,
      activo: true,
    })
    .select("id")
    .single();

  if (error) return { error: `No se pudo crear el doctor: ${error.message}` };

  // Auto-assign to every secretaria in this consultorio
  const { data: secretarias } = await admin
    .from("profiles")
    .select("id")
    .eq("consultorio_id", consultorioId)
    .eq("rol", "secretaria");

  if (secretarias?.length) {
    await admin.from("secretaria_doctores").upsert(
      secretarias.map((s) => ({ secretaria_id: s.id, doctor_id: newDoctor.id }))
    );
  }

  return {};
}

export async function createDoctorAdmin(
  consultorioId: string,
  nombre: string,
  especialidad: string | undefined,
  foto_url: string | null,
  titulo: string | null
): Promise<{ error?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const { data: newDoctor, error } = await admin
    .from("doctores")
    .insert({
      consultorio_id: consultorioId,
      nombre: nombre.trim(),
      titulo: titulo || null,
      especialidad: especialidad?.trim() || null,
      foto_url,
      activo: true,
      bloqueado_pago: false,
    })
    .select("id")
    .single();

  if (error) return { error: `No se pudo crear el doctor: ${error.message}` };

  // Auto-assign to every secretaria in this consultorio
  const { data: secretarias } = await admin
    .from("profiles")
    .select("id")
    .eq("consultorio_id", consultorioId)
    .eq("rol", "secretaria");

  if (secretarias?.length) {
    await admin.from("secretaria_doctores").upsert(
      secretarias.map((s) => ({ secretaria_id: s.id, doctor_id: newDoctor.id }))
    );
  }

  return {};
}

export async function toggleDoctorActivoAdmin(
  id: string,
  activo: boolean
): Promise<{ error?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("doctores")
    .update({ activo })
    .eq("id", id);

  if (error) return { error: "No se pudo actualizar el estado." };
  return {};
}

export async function toggleDoctorBloqueadoPago(
  id: string,
  bloqueado: boolean
): Promise<{ error?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("doctores")
    .update({ bloqueado_pago: bloqueado })
    .eq("id", id);

  if (error) return { error: "No se pudo actualizar el bloqueo." };
  return {};
}

export async function updateDoctorAdmin(
  id: string,
  data: { nombre: string; titulo?: string | null; especialidad: string | null; foto_url?: string | null }
): Promise<{ error?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    nombre: data.nombre.trim(),
    especialidad: data.especialidad,
    titulo: data.titulo ?? null,
  };
  if (data.foto_url !== undefined) update.foto_url = data.foto_url;
  const { error } = await admin.from("doctores").update(update).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function updateSecretaria(
  id: string,
  data: { nombre: string; telefono?: string | null; password?: string }
): Promise<{ error?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const profileUpdate: Record<string, unknown> = { nombre: data.nombre.trim() };
  if (data.telefono !== undefined) profileUpdate.telefono = data.telefono || null;

  const { error: profileError } = await admin
    .from("profiles")
    .update(profileUpdate)
    .eq("id", id);
  if (profileError) return { error: profileError.message };

  if (data.password) {
    const { error: authError } = await admin.auth.admin.updateUserById(id, {
      password: data.password,
    });
    if (authError) return { error: authError.message };
  }

  return {};
}

// ── Asignaciones secretaria↔doctor ───────────────────────────────────

export async function getAsignaciones(
  consultorioId: string
): Promise<AsignacionItem[]> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .eq("consultorio_id", consultorioId)
    .eq("rol", "secretaria");

  if (!profiles?.length) return [];

  const ids = profiles.map((p) => p.id);
  const { data } = await admin
    .from("secretaria_doctores")
    .select("secretaria_id, doctor_id")
    .in("secretaria_id", ids);

  return (data ?? []) as AsignacionItem[];
}

// ── Cuentas de doctor ──────────────────────────────────────────────────

export async function getDoctoresCuentas(
  consultorioId: string
): Promise<string[]> {
  await assertSuperadmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("doctor_id")
    .eq("consultorio_id", consultorioId)
    .eq("rol", "doctor")
    .not("doctor_id", "is", null);
  return (data ?? []).map((p) => p.doctor_id as string);
}

export async function createCuentaDoctor(
  doctorId: string,
  consultorioId: string,
  nombre: string,
  email: string,
  password: string
): Promise<{ error?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    if (authError.message.includes("already registered"))
      return { error: "Ya existe un usuario con ese correo." };
    return { error: authError.message };
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: authData.user.id,
      consultorio_id: consultorioId,
      rol: "doctor",
      nombre: nombre.trim(),
      doctor_id: doctorId,
      activo: true,
    },
    { onConflict: "id", ignoreDuplicates: false }
  );

  if (profileError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: `No se pudo crear el perfil: ${profileError.message}` };
  }

  return {};
}

// ── Restablecimiento de contraseña ───────────────────────────────────

function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export async function resetPasswordForUser(
  email: string
): Promise<{ error?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();
  const redirectTo = `${getAppUrl()}/restablecer-contrasena`;
  const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { error: error.message };
  return {};
}

export async function resetPasswordForDoctor(
  doctorId: string
): Promise<{ error?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("doctor_id", doctorId)
    .eq("rol", "doctor")
    .single();

  if (!profile) return { error: "Este doctor no tiene cuenta de acceso." };

  const { data: userData } = await admin.auth.admin.getUserById(profile.id);
  const email = userData?.user?.email;
  if (!email) return { error: "No se encontró el correo del doctor." };

  const redirectTo = `${getAppUrl()}/restablecer-contrasena`;
  const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { error: error.message };
  return {};
}

export async function toggleAsignacion(
  secretariaId: string,
  doctorId: string,
  asignar: boolean
): Promise<{ error?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();

  if (asignar) {
    const { error } = await admin
      .from("secretaria_doctores")
      .upsert({ secretaria_id: secretariaId, doctor_id: doctorId });
    if (error) return { error: `No se pudo asignar: ${error.message}` };
  } else {
    const { error } = await admin
      .from("secretaria_doctores")
      .delete()
      .eq("secretaria_id", secretariaId)
      .eq("doctor_id", doctorId);
    if (error) return { error: "No se pudo desasignar." };
  }

  return {};
}
