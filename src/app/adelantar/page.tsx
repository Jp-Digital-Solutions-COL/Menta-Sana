import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDoctoresActivos } from "@/app/agenda/actions";
import AdelatarClient from "./adelantar-client";
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

export default async function AdelatarPage() {
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

  if (!profile || profile.rol === "doctor" || profile.rol === "superadmin") {
    redirect("/inicio");
  }

  const doctors = await getDoctoresActivos();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 h-12 max-w-5xl mx-auto">
          <Image
            src="/Med-Agenda_sin_slogan.png"
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
              href="/inicio"
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors"
            >
              Inicio
            </Link>
            <Link
              href="/agenda"
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors"
            >
              Agenda
            </Link>
            <Link
              href="/doctores"
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors"
            >
              Doctores
            </Link>
            <span className="text-sm font-medium bg-primary text-primary-foreground px-3 py-1 rounded-md">
              Adelantar
            </span>
            <Link
              href="/configuracion"
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors"
            >
              Configuración
            </Link>
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
        <AdelatarClient doctors={doctors} />
      </main>
    </div>
  );
}
