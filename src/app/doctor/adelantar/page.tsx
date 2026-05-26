import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AdelatarClient from "@/app/adelantar/adelantar-client";
import type { DoctorBasic } from "@/app/agenda/types";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function DoctorAdelatarPage() {
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

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 h-12 max-w-5xl mx-auto">
          <Image
            src="/Menta-Sana_sin_slogan.png"
            alt="Med-Agenda"
            width={140}
            height={32}
            className="h-10 w-auto"
            unoptimized
            priority
          />
          <div className="h-4 w-px bg-border" />
          <nav className="flex gap-1">
            <Link
              href="/doctor"
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors"
            >
              Inicio
            </Link>
            <Link
              href="/doctor/agenda"
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors"
            >
              Agenda
            </Link>
            <span className="text-sm font-medium bg-primary text-primary-foreground px-3 py-1 rounded-md">
              Adelantar
            </span>
          </nav>
          <form action={signOut} className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              type="submit"
              className="gap-1.5 text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              Salir
            </Button>
          </form>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <AdelatarClient doctors={[doctor]} />
      </main>
    </div>
  );
}
