import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminClient, { type ConsultorioAdmin } from "./admin-client";

export default async function AdminPage() {
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

  const admin = createAdminClient();
  const { data: consultorios } = await admin
    .from("vista_consultorios_admin")
    .select("*")
    .order("nombre");

  return (
    <main className="min-h-screen bg-muted/30">
      <AdminClient
        consultorios={(consultorios ?? []) as unknown as ConsultorioAdmin[]}
      />
    </main>
  );
}
