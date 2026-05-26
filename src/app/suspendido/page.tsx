import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ShieldOff } from "lucide-react";
import Image from "next/image";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function SuspendidoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="flex justify-center">
          <Image
            src="/Menta-Sana_solo_logo.png"
            alt="Menta Sana"
            width={72}
            height={72}
            className="h-16 w-auto opacity-80"
            priority
          />
        </div>
        <div className="flex justify-center">
          <div className="rounded-full bg-red-50 border border-red-100 p-5">
            <ShieldOff className="h-10 w-10 text-red-500" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Cuenta suspendida</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Tu consultorio no tiene acceso activo al sistema. Para reactivar el
            acceso, contacta al administrador.
          </p>
        </div>

        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Cerrar sesión
          </Button>
        </form>
      </div>
    </main>
  );
}
