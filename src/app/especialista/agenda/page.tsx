import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCitas, getPacientesBasic, getHorariosParaCalendario } from "@/app/agenda/actions";
import AgendaClient from "@/app/agenda/agenda-client";
import { startOfWeek, endOfWeek, toDateStr, todayBogota } from "@/app/agenda/utils";
import type { DoctorBasic } from "@/app/agenda/types";

export default async function DoctorAgendaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("consultorio_id, doctor_id, rol")
    .eq("id", user.id)
    .single();

  if (profile?.rol !== "doctor" || !profile?.doctor_id) redirect("/inicio");
  if (!profile?.consultorio_id) redirect("/onboarding");

  const admin = createAdminClient();
  const { data: doctorData } = await admin
    .from("doctores")
    .select("id, nombre, titulo, especialidad, activo, bloqueado_pago")
    .eq("id", profile.doctor_id as string)
    .single();

  if (!doctorData) redirect("/login");

  const doctor: DoctorBasic = {
    id: doctorData.id,
    nombre: doctorData.nombre,
    titulo: (doctorData.titulo as string | null) ?? null,
    especialidad: (doctorData.especialidad as string | null) ?? null,
    activo: (doctorData.activo as boolean) ?? true,
    bloqueado_pago: (doctorData.bloqueado_pago as boolean) ?? false,
  };

  const today = todayBogota();
  const ws = startOfWeek(today);
  const we = endOfWeek(today);

  const [pacientes, citas, horarios] = await Promise.all([
    getPacientesBasic(),
    getCitas(
      `${toDateStr(ws)}T00:00:00`,
      `${toDateStr(we)}T23:59:59`,
      doctor.id
    ),
    getHorariosParaCalendario([doctor.id]),
  ]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <AgendaClient
        doctors={[doctor]}
        pacientes={pacientes}
        initialCitas={citas}
        todayStr={toDateStr(today)}
        lockedDoctor={doctor}
        horarios={horarios}
      />
    </div>
  );
}
