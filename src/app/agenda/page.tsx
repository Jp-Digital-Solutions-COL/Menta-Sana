import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getDoctoresActivos,
  getPacientesBasic,
  getCitas,
  getHorariosParaCalendario,
} from "./actions";
import AgendaClient from "./agenda-client";
import { startOfWeek, endOfWeek, toDateStr, todayBogota, bogotaToISO } from "./utils";

export default async function AgendaPage() {
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
  if (!profile?.consultorio_id) redirect("/onboarding");

  const today = todayBogota();
  const ws = startOfWeek(today);
  const we = endOfWeek(today);

  const [sy, sm, sd] = toDateStr(ws).split("-").map(Number);
  const [ey, em, ed] = toDateStr(we).split("-").map(Number);
  const [doctors, pacientes, citas] = await Promise.all([
    getDoctoresActivos(),
    getPacientesBasic(),
    getCitas(bogotaToISO(sy, sm, sd, 0, 0), bogotaToISO(ey, em, ed, 23, 59)),
  ]);

  const horarios = await getHorariosParaCalendario(doctors.map((d) => d.id));

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <AgendaClient
        doctors={doctors}
        pacientes={pacientes}
        initialCitas={citas}
        todayStr={toDateStr(today)}
        horarios={horarios}
      />
    </div>
  );
}
