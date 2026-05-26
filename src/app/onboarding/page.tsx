import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
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

  if (profile?.rol === "superadmin") redirect("/admin");
  if (profile?.consultorio_id) redirect("/agenda");

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <OnboardingForm />
    </main>
  );
}
