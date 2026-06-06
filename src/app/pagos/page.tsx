import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayBogota, toDateStr } from "@/app/agenda/utils";
import { getPagosData, getDoctoresDelConsultorio } from "./actions";
import PagosClient from "./pagos-client";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function PagosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, doctor_id, consultorio_id")
    .eq("id", user.id)
    .single();

  if (!profile?.consultorio_id) redirect("/onboarding");
  if (profile.rol === "superadmin") redirect("/admin");

  const isDoctor = profile.rol === "doctor";
  const userDoctorId = isDoctor ? (profile.doctor_id as string | null) : null;

  const now = todayBogota();
  const mesDesde = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
  const mesHasta = toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const [initialData, doctores] = await Promise.all([
    getPagosData({ periodoDesde: mesDesde, periodoHasta: mesHasta, doctorId: userDoctorId }),
    isDoctor ? Promise.resolve([]) : getDoctoresDelConsultorio(),
  ]);

  return (
    <PagosClient
      initialData={initialData}
      initialDesde={mesDesde}
      initialHasta={mesHasta}
      doctores={doctores}
      userRole={profile.rol}
      userDoctorId={userDoctorId}
      onSignOut={signOut}
    />
  );
}
