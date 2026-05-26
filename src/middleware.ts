import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_ROUTES = ["/login", "/auth", "/confirmar", "/restablecer-contrasena"];

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

  if (!user) {
    if (isPublic) return supabaseResponse;
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/inicio", request.url));
  }

  // Las rutas API internas no necesitan verificación de rol/estado
  if (isPublic || pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  // Consulta única: rol + estado del consultorio
  const supabaseForCheck = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  );
  const { data: profileData } = await supabaseForCheck
    .from("profiles")
    .select("rol, consultorios(estado_suscripcion)")
    .eq("id", user.id)
    .single();

  const isSuperadmin = profileData?.rol === "superadmin";
  const isDoctor = profileData?.rol === "doctor";
  const consultorio = profileData?.consultorios as
    | { estado_suscripcion: string }
    | null
    | undefined;
  const estadoSuscripcion = consultorio?.estado_suscripcion;

  // Consultorio suspendido → solo puede ver /suspendido
  if (!isSuperadmin && estadoSuscripcion === "suspendido") {
    if (!pathname.startsWith("/suspendido")) {
      return NextResponse.redirect(new URL("/suspendido", request.url));
    }
    return supabaseResponse;
  }

  // Usuarios activos no deben ver /suspendido
  if (pathname.startsWith("/suspendido")) {
    return NextResponse.redirect(new URL("/inicio", request.url));
  }

  // Doctores: solo pueden acceder a /doctor (o /doctor/*)
  const isDoctorRoute = pathname === "/doctor" || pathname.startsWith("/doctor/");
  if (isDoctor && !isDoctorRoute) {
    return NextResponse.redirect(new URL("/doctor", request.url));
  }

  // No-doctores no pueden acceder a /doctor (o /doctor/*)
  if (!isDoctor && isDoctorRoute) {
    return NextResponse.redirect(new URL("/inicio", request.url));
  }

  // /admin solo para superadmin
  if (pathname.startsWith("/admin") && !isSuperadmin) {
    return NextResponse.redirect(new URL("/inicio", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
