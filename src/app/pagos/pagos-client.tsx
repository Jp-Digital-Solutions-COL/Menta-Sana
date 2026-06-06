"use client";

import { useState, useTransition } from "react";
import type { PagosData, DoctorItem } from "./types";
import { getPagosData } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogOut, MessageCircle, TrendingUp, Clock, AlertCircle, DollarSign } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

// ── Helpers ──────────────────────────────────────────────────────────────

function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function normalizarTelefono(tel: string | null): string | null {
  if (!tel) return null;
  const digits = tel.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return "57" + digits;
  if (digits.startsWith("57") && digits.length >= 12) return digits;
  if (tel.startsWith("+")) return tel.slice(1).replace(/\D/g, "");
  return digits || null;
}

function formatFechaSesion(iso: string): string {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const now = new Date();
  const ayer = new Date(now);
  ayer.setDate(now.getDate() - 1);
  const s = fmt(new Date(iso));
  if (s === fmt(now)) return "hoy";
  if (s === fmt(ayer)) return "ayer";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

function buildWhatsAppUrl(p: CuentaPorCobrar): string | null {
  const tel = normalizarTelefono(p.telefono);
  if (!tel) return null;
  const monto = formatCOP(p.totalAdeudado);

  let sesionText: string;
  const fechas = (p.sesionFechas.length > 0 ? p.sesionFechas : [p.sesionMasAntigua]).map(
    formatFechaSesion
  );

  if (p.sesionesCount === 1) {
    const f = fechas[0];
    sesionText =
      f === "hoy" || f === "ayer"
        ? `de la sesión de ${f}`
        : `de la sesión del día ${f}`;
  } else {
    const lista =
      fechas.length === 2
        ? `${fechas[0]} y ${fechas[1]}`
        : `${fechas.slice(0, -1).join(", ")} y ${fechas[fechas.length - 1]}`;
    sesionText = `de las ${p.sesionesCount} sesiones de los días ${lista}`;
  }

  const msg =
    `Hola ${p.nombre}, le recordamos cordialmente que tiene un saldo pendiente de ${monto} ` +
    `${sesionText}. Por favor contáctenos para coordinar el pago. ¡Muchas gracias!`;
  return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
}

function getMonthRange(): { desde: string; hasta: string } {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const desde = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const hasta = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { desde, hasta };
}

function getWeekRange(): { desde: string; hasta: string } {
  const d = new Date();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    desde: monday.toISOString().slice(0, 10),
    hasta: sunday.toISOString().slice(0, 10),
  };
}

function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

type Periodo = "mes" | "semana" | "custom";

interface Props {
  initialData: PagosData;
  initialDesde: string;
  initialHasta: string;
  doctores: DoctorItem[];
  userRole: string;
  userDoctorId: string | null;
  onSignOut: () => Promise<void>;
}

export default function PagosClient({
  initialData,
  initialDesde,
  initialHasta,
  doctores,
  userRole,
  userDoctorId,
  onSignOut,
}: Props) {
  const isDoctor = userRole === "doctor";

  const [data, setData] = useState<PagosData>(initialData);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [customDesde, setCustomDesde] = useState(initialDesde);
  const [customHasta, setCustomHasta] = useState(initialHasta);
  const [selectedDoctor, setSelectedDoctor] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  function fetchData(desde: string, hasta: string, doctorSel: string) {
    startTransition(async () => {
      const dr = isDoctor ? userDoctorId : doctorSel === "all" ? null : doctorSel;
      const result = await getPagosData({
        periodoDesde: desde,
        periodoHasta: hasta,
        doctorId: dr,
      });
      setData(result);
    });
  }

  function handlePeriodoChange(value: string | null) {
    if (!value) return;
    const p = value as Periodo;
    setPeriodo(p);
    if (p !== "custom") {
      const range = p === "mes" ? getMonthRange() : getWeekRange();
      fetchData(range.desde, range.hasta, selectedDoctor);
    }
  }

  function handleDoctorChange(value: string | null) {
    const v = value ?? "all";
    setSelectedDoctor(v);
    const range = periodo === "mes" ? getMonthRange() : periodo === "semana" ? getWeekRange() : null;
    if (range) {
      fetchData(range.desde, range.hasta, v);
    } else {
      fetchData(customDesde, customHasta, v);
    }
  }

  const periodoLabel =
    periodo === "mes" ? "Ingresos del mes" : periodo === "semana" ? "Ingresos semana" : "Ingresos período";
  const totalPagos = data.porMetodo.reduce((s, m) => s + m.count, 0);
  const maxMetodo = Math.max(...data.porMetodo.map((m) => m.total), 1);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* ── Nav ──────────────────────────────────────────────────── */}
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 h-12 max-w-5xl mx-auto">
          <Link href={isDoctor ? "/especialista" : "/inicio"}>
            <Image
              src="/Menta-Sana_sin_slogan.png"
              alt="Menta Sana"
              width={140}
              height={32}
              className="h-10 w-auto"
              unoptimized
              priority
            />
          </Link>
          <div className="h-4 w-px bg-border" />
          <nav className="flex gap-1 overflow-x-auto">
            {isDoctor ? (
              <>
                <Link href="/especialista" className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors whitespace-nowrap">
                  Inicio
                </Link>
                <Link href="/especialista/agenda" className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors whitespace-nowrap">
                  Agenda
                </Link>
                <Link href="/especialista/adelantar" className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors whitespace-nowrap">
                  Adelantar
                </Link>
                <span className="text-sm font-medium bg-primary text-primary-foreground px-3 py-1 rounded-md whitespace-nowrap">
                  Pagos
                </span>
              </>
            ) : (
              <>
                <Link href="/inicio" className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors whitespace-nowrap">
                  Inicio
                </Link>
                <Link href="/agenda" className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors whitespace-nowrap">
                  Agenda
                </Link>
                <Link href="/doctores" className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors whitespace-nowrap">
                  Especialistas
                </Link>
                <Link href="/adelantar" className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors whitespace-nowrap">
                  Adelantar
                </Link>
                <span className="text-sm font-medium bg-primary text-primary-foreground px-3 py-1 rounded-md whitespace-nowrap">
                  Pagos
                </span>
                <Link href="/configuracion" className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md hover:bg-muted transition-colors whitespace-nowrap">
                  Configuración
                </Link>
              </>
            )}
          </nav>
          <form action={onSignOut} className="ml-auto shrink-0">
            <Button variant="ghost" size="sm" type="submit" className="gap-1.5 text-muted-foreground">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </form>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* ── Encabezado ──────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pagos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ingresos y cuentas por cobrar del consultorio
          </p>
        </div>

        {/* ── Filtros ───────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Período
            </span>
            <Select
              value={periodo}
              onValueChange={(v) => handlePeriodoChange(v as Periodo)}
              disabled={isPending}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mes">Mes actual</SelectItem>
                <SelectItem value="semana">Semana actual</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {periodo === "custom" && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Desde
                </span>
                <Input
                  type="date"
                  value={customDesde}
                  onChange={(e) => setCustomDesde(e.target.value)}
                  className="w-36"
                  disabled={isPending}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Hasta
                </span>
                <Input
                  type="date"
                  value={customHasta}
                  onChange={(e) => setCustomHasta(e.target.value)}
                  className="w-36"
                  disabled={isPending}
                />
              </div>
              <Button
                onClick={() => fetchData(customDesde, customHasta, selectedDoctor)}
                disabled={isPending}
                className="self-end bg-teal-600 hover:bg-teal-700 text-white"
              >
                Aplicar
              </Button>
            </>
          )}

          {!isDoctor && doctores.length > 0 && (
            <div className="flex flex-col gap-1 sm:ml-auto">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Especialista
              </span>
              <Select
                value={selectedDoctor}
                onValueChange={handleDoctorChange}
                disabled={isPending}
              >
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {doctores.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.titulo ? `${d.titulo} ${d.nombre}` : d.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* ── Tarjetas de métricas ──────────────────────────────── */}
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 transition-opacity ${isPending ? "opacity-60" : ""}`}>
          {/* Ingresos del período */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {periodoLabel}
                </p>
                <div className="p-1.5 bg-teal-50 rounded-md">
                  <TrendingUp className="h-4 w-4 text-teal-600" />
                </div>
              </div>
              <p className="text-xl font-bold mt-2 text-teal-700 tabular-nums">
                {formatCOP(data.totalPeriodo)}
              </p>
            </CardContent>
          </Card>

          {/* Esta semana */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Esta semana
                </p>
                <div className="p-1.5 bg-blue-50 rounded-md">
                  <Clock className="h-4 w-4 text-blue-600" />
                </div>
              </div>
              <p className="text-xl font-bold mt-2 tabular-nums">
                {formatCOP(data.totalSemana)}
              </p>
            </CardContent>
          </Card>

          {/* Cuentas por cobrar */}
          <Card className={data.totalCCP > 0 ? "border-amber-200" : ""}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Por cobrar
                </p>
                <div className={`p-1.5 rounded-md ${data.totalCCP > 0 ? "bg-amber-50" : "bg-muted"}`}>
                  <AlertCircle className={`h-4 w-4 ${data.totalCCP > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
                </div>
              </div>
              <p className={`text-xl font-bold mt-2 tabular-nums ${data.totalCCP > 0 ? "text-amber-600" : ""}`}>
                {formatCOP(data.totalCCP)}
              </p>
              {data.cuentasPorCobrar.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {data.cuentasPorCobrar.length} paciente
                  {data.cuentasPorCobrar.length !== 1 ? "s" : ""}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Pagos recibidos (conteo en el período) */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pagos recibidos
                </p>
                <div className="p-1.5 bg-emerald-50 rounded-md">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </div>
              </div>
              <p className="text-xl font-bold mt-2 tabular-nums">{totalPagos}</p>
              <p className="text-xs text-muted-foreground mt-1">en el período</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Por método de pago ───────────────────────────────── */}
        {data.porMetodo.length > 0 && (
          <Card className={isPending ? "opacity-60 transition-opacity" : ""}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Por método de pago</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.porMetodo.map((m) => (
                <div key={m.metodo}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="font-medium tabular-nums">{formatCOP(m.total)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((m.total / maxMetodo) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {m.count} pago{m.count !== 1 ? "s" : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Cuentas por cobrar ───────────────────────────────── */}
        <div>
          <h2 className="text-lg font-semibold mb-3">
            Cuentas por cobrar
            {data.cuentasPorCobrar.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — {data.cuentasPorCobrar.length} paciente
                {data.cuentasPorCobrar.length !== 1 ? "s" : ""} con saldo pendiente
              </span>
            )}
          </h2>

          {data.cuentasPorCobrar.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground text-sm">
                  ¡Todo al día! No hay cuentas pendientes de cobro.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className={`rounded-md border overflow-hidden ${isPending ? "opacity-60 transition-opacity" : ""}`}>
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      Paciente
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                      Adeudado
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                      Sesiones
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                      Más antigua
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                      Cobrar
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.cuentasPorCobrar.map((p) => {
                    const waUrl = buildWhatsAppUrl(p);
                    return (
                      <tr key={p.pacienteId} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{p.nombre}</td>
                        <td className="px-4 py-3 text-right font-medium text-amber-600 tabular-nums">
                          {formatCOP(p.totalAdeudado)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                          {p.sesionesCount}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                          {fechaCorta(p.sesionMasAntigua)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {waUrl ? (
                            <a href={waUrl} target="_blank" rel="noopener noreferrer">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50 hover:border-green-400"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">WhatsApp</span>
                              </Button>
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">Sin tel.</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
