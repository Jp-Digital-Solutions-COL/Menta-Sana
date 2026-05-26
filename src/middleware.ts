import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_ROUTES = ["/login", "/auth", "/confirmar", "/restablecer-contrasena"];

export async function middleware(request: NextRequest) {
  try {
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

    if (isPublic || pathname.startsWith("/api/")) {
      return supabaseResponse;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return supabaseResponse;
    }

    const supabaseForCheck = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    });

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

    if (!isSuperadmin && estadoSuscripcion === "suspendido") {
      if (!pathname.startsWith("/suspendido")) {
        return NextResponse.redirect(new URL("/suspendido", request.url));
      }
      return supabaseResponse;
    }

    if (pathname.startsWith("/suspendido")) {
      return NextResponse.redirect(new URL("/inicio", request.url));
    }

    const isDoctorRoute = pathname === "/doctor" || pathname.startsWith("/doctor/");
    if (isDoctor && !isDoctorRoute) {
      return NextResponse.redirect(new URL("/doctor", request.url));
    }

    if (!isDoctor && isDoctorRoute) {
      return NextResponse.redirect(new URL("/inicio", request.url));
    }

    if (pathname.startsWith("/admin") && !isSuperadmin) {
      return NextResponse.redirect(new URL("/inicio", request.url));
    }

    return supabaseResponse;
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
