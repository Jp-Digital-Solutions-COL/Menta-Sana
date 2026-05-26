import { createAdminClient } from "@/lib/supabase/admin";
import Image from "next/image";
import Link from "next/link";

interface PageProps {
  params: Promise<{ token: string }>;
}

type ResultadoConfirmacion =
  | { tipo: "confirmada_ahora"; doctor: string; especialidad: string | null; inicio: string }
  | { tipo: "ya_confirmada"; doctor: string; inicio: string }
  | { tipo: "cancelada" }
  | { tipo: "token_invalido" };

async function procesarToken(token: string): Promise<ResultadoConfirmacion> {
  const admin = createAdminClient();

  const { data: cita } = await admin
    .from("citas")
    .select("id, estado, inicio, doctores(nombre, especialidad)")
    .eq("token_confirmacion", token)
    .single();

  if (!cita) return { tipo: "token_invalido" };

  const doctores = cita.doctores as unknown as { nombre: string; especialidad: string | null } | null;
  const doctor = doctores?.nombre ?? "";
  const especialidad = doctores?.especialidad ?? null;

  if (cita.estado === "cancelada") return { tipo: "cancelada" };

  if (cita.estado === "confirmada") {
    return { tipo: "ya_confirmada", doctor, inicio: cita.inicio };
  }

  // programada, atendida, no_asistio → confirmar
  await admin.from("citas").update({ estado: "confirmada" }).eq("id", cita.id);

  return { tipo: "confirmada_ahora", doctor, especialidad, inicio: cita.inicio };
}

function formatFechaHora(inicio: string) {
  const dt = new Date(inicio);
  const fecha = new Intl.DateTimeFormat("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "America/Bogota",
  }).format(dt);
  const hora = new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "America/Bogota",
  }).format(dt);
  return { fecha, hora };
}

export default async function ConfirmarCitaPage({ params }: PageProps) {
  const { token } = await params;
  const resultado = await procesarToken(token);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header teal */}
        <div className="bg-[#0D9488] px-8 py-6 flex justify-center">
          <Image
            src="/Menta-Sana_sin_slogan.png"
            alt="Med-Agenda"
            width={160}
            height={40}
            className="h-9 w-auto"
            priority
          />
        </div>

        <div className="px-8 py-8 text-center space-y-4">
          {resultado.tipo === "confirmada_ahora" && (() => {
            const { fecha, hora } = formatFechaHora(resultado.inicio);
            return (
              <>
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center">
                    <svg className="w-8 h-8 text-[#0D9488]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                </div>
                <h1 className="text-xl font-bold text-gray-900">¡Cita confirmada!</h1>
                <p className="text-gray-500 text-sm">
                  Su cita con el <strong className="text-gray-700">Dr. {resultado.doctor}</strong>
                  {resultado.especialidad && <span> ({resultado.especialidad})</span>} ha sido confirmada.
                </p>
                <div className="bg-slate-50 rounded-xl border border-slate-200 text-left divide-y divide-slate-200">
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide">Fecha</p>
                    <p className="text-sm font-semibold text-gray-800 capitalize">{fecha}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide">Hora</p>
                    <p className="text-sm font-semibold text-gray-800">{hora}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400">¡Gracias! Le esperamos.</p>
              </>
            );
          })()}

          {resultado.tipo === "ya_confirmada" && (() => {
            const { fecha, hora } = formatFechaHora(resultado.inicio);
            return (
              <>
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                </div>
                <h1 className="text-xl font-bold text-gray-900">Cita ya confirmada</h1>
                <p className="text-gray-500 text-sm">
                  Su cita con el <strong className="text-gray-700">Dr. {resultado.doctor}</strong> ya estaba confirmada.
                </p>
                <div className="bg-slate-50 rounded-xl border border-slate-200 text-left divide-y divide-slate-200">
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide">Fecha</p>
                    <p className="text-sm font-semibold text-gray-800 capitalize">{fecha}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide">Hora</p>
                    <p className="text-sm font-semibold text-gray-800">{hora}</p>
                  </div>
                </div>
              </>
            );
          })()}

          {resultado.tipo === "cancelada" && (
            <>
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Cita cancelada</h1>
              <p className="text-gray-500 text-sm">Esta cita fue cancelada. Comuníquese con el consultorio para más información.</p>
            </>
          )}

          {resultado.tipo === "token_invalido" && (
            <>
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Enlace no válido</h1>
              <p className="text-gray-500 text-sm">Este enlace de confirmación no es válido o ya no está disponible.</p>
            </>
          )}
        </div>

        <div className="px-8 pb-6 text-center">
          <p className="text-xs text-slate-400">
            Gestionado por <strong className="text-slate-500">Med-Agenda</strong> · Sistema de gestión médica
          </p>
        </div>
      </div>
    </div>
  );
}
