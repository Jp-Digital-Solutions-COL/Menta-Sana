import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDoctores } from "./actions";
import DoctoresClient from "./doctores-client";

export default async function DoctoresPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("consultorio_id, rol")
    .eq("id", user.id)
    .single();

  if (!profile?.consultorio_id) redirect("/onboarding");

  const doctores = await getDoctores();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <DoctoresClient doctores={doctores} rol={profile.rol ?? "admin"} />
    </div>
  );
}
