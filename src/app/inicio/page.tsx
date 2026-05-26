import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { startOfWeek, endOfWeek, addDays, toDateStr } from "@/app/agenda/utils";
import { ESTADO_CONFIG } from "@/app/agenda/types";
import { CalendarDays, UserX, XCircle, AlertCircle, Clock, LogOut, Zap, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import Image from "next/image";

// ── Timezone ──────────────────────────────────────────────────────────
const TZ = "America/Mexico_City";

function horaLocal(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(new Date(iso));
}

function saludo(): string {
  const h = parseInt(
    new Intl.DateTimeFormat("es-MX", {
      hour: "numeric",
      hour12: false,
      timeZone: TZ,
    }).format(new Date())
  );
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function fechaLabel(): string {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(new Date());
}

// ── Tipos locales ──────────────────────────────────────────────────────
type ResumenCita = {
  id: string;
  inicio: string;
  estado: string;
  doctores: { nombre: string } | null;
  pacientes: { nombre: string } | null;
};

// ── Helpers de color por conteo ────────────────────────────────────────
function colorAlerta(n: number): string {
  if (n === 0) return "text-emerald-600";
  if (n <= 3) return "text-amber-600";
  return "text-red-600";
}
function bgAlerta(n: number): string {
  if (n === 0) return "bg-emerald-50";
  if (n <= 3) return "bg-amber-50";
  return "bg-red-50";
}

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ── Page ──────────────────────────────────────────────────────────────
export default async function InicioPage() {
  // Autenticación
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
  if (!profile?.consultorio_id) redirect("/onboarding");

  // ── Rangos de fecha ──────────────────────────────────────────────────
  const hoy = new Date();
  const hoyStr = toDateStr(hoy);
  const manana = addDays(hoy, 1);
  const mananaStr = toDateStr(manana);
  const pasadoManana = addDays(hoy, 2);
  const pasadoMananaStr = toDateStr(pasadoManana);
  const semanaInicioStr = toDateStr(startOfWeek(hoy));
  const semanaFinStr = toDateStr(endOfWeek(hoy));
  const mesInicioStr = toDateStr(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const mesFinStr = toDateStr(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));

  const SEL = "id, inicio, estado, doctores(nombre), pacientes(nombre)";

  // ── Consultas en paralelo ────────────────────────────────────────────
  const [
    { data: rawHoy },
    { data: rawManana },
    { data: rawNoShowsSemana },
    { count: noShowsMes },
    { count: canceladasSemana },
    { count: totalMes },
  ] = await Promise.all([
    supabase
      .from("citas")
      .select(SEL)
      .gte("inicio", `${hoyStr}T00:00:00`)
      .lte("inicio", `${hoyStr}T23:59:59`)
      .order("inicio"),

    supabase
      .from("citas")
      .select(SEL)
      .gte("inicio", `${mananaStr}T00:00:00`)
      .lte("inicio", `${mananaStr}T23:59:59`)
      .eq("estado", "programada")
      .order("inicio"),

    supabase
      .from("citas")
      .select(SEL)
      .gte("inicio", `${semanaInicioStr}T00:00:00`)
      .lte("inicio", `${semanaFinStr}T23:59:59`)
      .eq("estado", "no_asistio")
      .order("inicio"),

    supabase
      .from("citas")
      .select("id", { count: "exact", head: true })
      .gte("inicio", `${mesInicioStr}T00:00:00`)
      .lte("inicio", `${mesFinStr}T23:59:59`)
      .eq("estado", "no_asistio"),

    supabase
      .from("citas")
      .select("id", { count: "exact", head: true })
      .gte("inicio", `${semanaInicioStr}T00:00:00`)
      .lte("inicio", `${semanaFinStr}T23:59:59`)
      .eq("estado", "cancelada"),

    supabase
      .from("citas")
      .select("id", { count: "exact", head: true })
      .gte("inicio", `${mesInicioStr}T00:00:00`)
      .lte("inicio", `${mesFinStr}T23:59:59`)
      .neq("estado", "cancelada"),
  ]);

  const citasHoy = (rawHoy ?? []) as unknown as ResumenCita[];
  const citasManana = (rawManana ?? []) as unknown as ResumenCita[];
  const noShowsSemana = (rawNoShowsSemana ?? []) as unknown as ResumenCita[];
  const nsS = noShowsSemana.length;
  const nsM = noShowsMes ?? 0;
  const canS = canceladasSemana ?? 0;
  const totM = totalMes ?? 0;
  const tasaNs = totM > 0 ? Math.round((nsM / totM) * 100) : 0;

  // Desglose de estados para hoy
  const estadosHoy = citasHoy.reduce<Record<string, number>>((acc, c) => {
    acc[c.estado] = (acc[c.estado] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-muted/30">
      {/* ── Barra de navegación ─────────────────────────────── */}
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
            <span className="text-sm font-medium bg-primary text-primary-foreground px-3 py-1 rounded-md">
              Inicio
            </span>
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
            <Link
              href="/adelantar"
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors"
            >
              Adelantar
            </Link>
            <Link
              href="/configuracion"
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors"
            >
              Configuración
            </Link>
          </nav>
          <form action={signOut} className="ml-auto">
            <Button variant="ghost" size="sm" type="submit" className="gap-1.5 text-muted-foreground">
              <LogOut className="h-4 w-4" />
              Salir
            </Button>
          </form>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* ── Encabezado ──────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold">{saludo()}</h1>
          <p className="text-muted-foreground text-sm capitalize mt-0.5">
            {fechaLabel()}
          </p>
        </div>

        {/* ── Acciones rápidas ─────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          <Link href="/agenda">
            <Button className="gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              Agendar cita
            </Button>
          </Link>
          <Link href="/pacientes">
            <Button variant="outline" className="gap-2">
              <UserPlus className="h-4 w-4" />
              Crear paciente
            </Button>
          </Link>
          <Link href="/adelantar">
            <Button className="gap-2 bg-teal-600 hover:bg-teal-700 text-white shadow-sm">
              <Zap className="h-4 w-4" />
              Adelantar citas
            </Button>
          </Link>
        </div>

        {/* ── Tarjetas de resumen ──────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Citas de hoy */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Citas hoy
                </p>
                <div className="p-1.5 bg-blue-50 rounded-md">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
                </div>
              </div>
              <p className="text-4xl font-bold mt-2">{citasHoy.length}</p>
              <div className="mt-3 space-y-0.5">
                {(["confirmada", "programada", "atendida", "cancelada", "no_asistio"] as const)
                  .filter((e) => estadosHoy[e])
                  .map((e) => (
                    <p key={e} className="text-xs text-muted-foreground">
                      {estadosHoy[e]} {ESTADO_CONFIG[e].label.toLowerCase()}
                      {estadosHoy[e] !== 1 ? "s" : ""}
                    </p>
                  ))}
                {citasHoy.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sin citas</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Mañana sin confirmar */}
          <Card className={citasManana.length > 0 ? "border-amber-200" : ""}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Mañana sin confirmar
                </p>
                <div className={`p-1.5 rounded-md ${citasManana.length > 0 ? "bg-amber-50" : "bg-muted"}`}>
                  <Clock className={`h-4 w-4 ${citasManana.length > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
                </div>
              </div>
              <p className={`text-4xl font-bold mt-2 ${citasManana.length > 0 ? "text-amber-600" : ""}`}>
                {citasManana.length}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                {citasManana.length > 0
                  ? "Pendientes de confirmar"
                  : "Todo confirmado"}
              </p>
            </CardContent>
          </Card>

          {/* No-shows */}
          <Card className={nsS > 0 ? `border-red-200` : ""}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  No-shows
                </p>
                <div className={`p-1.5 rounded-md ${bgAlerta(nsS)}`}>
                  <UserX className={`h-4 w-4 ${colorAlerta(nsS)}`} />
                </div>
              </div>
              <p className={`text-4xl font-bold mt-2 ${colorAlerta(nsS)}`}>{nsS}</p>
              <div className="mt-3 space-y-0.5">
                <p className="text-xs text-muted-foreground">
                  Esta semana
                </p>
                <p className="text-xs text-muted-foreground">
                  {nsM} este mes
                  {totM > 0 && (
                    <span className={`ml-1 font-medium ${colorAlerta(tasaNs)}`}>
                      ({tasaNs}%)
                    </span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Canceladas */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Canceladas
                </p>
                <div className="p-1.5 bg-gray-100 rounded-md">
                  <XCircle className="h-4 w-4 text-gray-500" />
                </div>
              </div>
              <p className="text-4xl font-bold mt-2 text-gray-600">{canS}</p>
              <p className="mt-3 text-xs text-muted-foreground">Esta semana</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Listas de detalle ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Citas de hoy */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Citas de hoy</span>
                {citasHoy.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {citasHoy.length} total
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {citasHoy.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No hay citas programadas para hoy.
                </p>
              ) : (
                <div className="space-y-0">
                  {citasHoy.map((cita) => {
                    const ec = ESTADO_CONFIG[cita.estado as keyof typeof ESTADO_CONFIG];
                    return (
                      <div
                        key={cita.id}
                        className="flex items-center gap-3 py-2.5 border-b last:border-b-0"
                      >
                        <span className="text-xs font-mono text-muted-foreground w-11 shrink-0">
                          {horaLocal(cita.inicio)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight truncate">
                            {cita.pacientes?.nombre ?? "—"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {cita.doctores?.nombre ?? "—"}
                          </p>
                        </div>
                        {ec && (
                          <Badge
                            variant="outline"
                            className={`shrink-0 text-[10px] px-1.5 py-0 ${ec.bg} ${ec.text} ${ec.border}`}
                          >
                            {ec.label}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mañana sin confirmar */}
          <Card className={citasManana.length > 0 ? "border-amber-200" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Mañana sin confirmar</span>
                {citasManana.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-normal text-amber-600">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Llamar hoy
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {citasManana.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No hay citas sin confirmar para mañana.
                </p>
              ) : (
                <div className="space-y-0">
                  {citasManana.map((cita) => (
                    <div
                      key={cita.id}
                      className="flex items-center gap-3 py-2.5 border-b last:border-b-0"
                    >
                      <span className="text-xs font-mono text-muted-foreground w-11 shrink-0">
                        {horaLocal(cita.inicio)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight truncate">
                          {cita.pacientes?.nombre ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {cita.doctores?.nombre ?? "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── No-shows esta semana ─────────────────────────────── */}
        {noShowsSemana.length > 0 && (
          <Card className="border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <UserX className="h-4 w-4 text-red-600" />
                No-shows esta semana
                <span className="ml-auto text-sm font-normal text-muted-foreground">
                  {noShowsSemana.length} {noShowsSemana.length === 1 ? "paciente no se presentó" : "pacientes no se presentaron"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {noShowsSemana.map((cita) => (
                  <div
                    key={cita.id}
                    className="flex items-center gap-3 py-2.5 border-b last:border-b-0"
                  >
                    <span className="text-xs font-mono text-muted-foreground w-11 shrink-0">
                      {horaLocal(cita.inicio)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight truncate">
                        {cita.pacientes?.nombre ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {cita.doctores?.nombre ?? "—"}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Intl.DateTimeFormat("es-MX", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: TZ,
                      }).format(new Date(cita.inicio))}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
