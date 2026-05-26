export type EstadoCita =
  | "programada"
  | "confirmada"
  | "cancelada"
  | "atendida"
  | "no_asistio"
  | "bloqueada";

export type Cita = {
  id: string;
  consultorio_id: string;
  doctor_id: string;
  paciente_id: string;
  ubicacion_id: string | null;
  inicio: string;    // timestamptz — ISO 8601 con offset
  fin: string;       // timestamptz — ISO 8601 con offset
  estado: EstadoCita;
  motivo: string | null;
  creado_por: string;
  creado_en: string;
  token_confirmacion: string | null;
};

export type CitaConRel = Cita & {
  doctores: { id: string; nombre: string };
  pacientes: {
    id: string;
    nombre: string;
    telefono: string | null;
    cedula: string | null;
    email: string | null;
    tipo_documento: TipoDocumento | null;
  } | null;
};

export type DoctorBasic = {
  id: string;
  nombre: string;
  titulo: string | null;
  especialidad: string | null;
  activo: boolean;
  bloqueado_pago: boolean;
};

export type TipoDocumento = "RC" | "TI" | "CC" | "CE";

export const TIPOS_DOCUMENTO: { value: TipoDocumento; label: string }[] = [
  { value: "RC", label: "Registro civil" },
  { value: "TI", label: "TI" },
  { value: "CC", label: "CC" },
  { value: "CE", label: "Cédula extranjería" },
];

export type PacienteBasic = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  cedula: string | null;
  tipo_documento: TipoDocumento | null;
};

export const ESTADO_CONFIG: Record<
  EstadoCita,
  { label: string; bg: string; text: string; border: string }
> = {
  programada: {
    label: "Programada",
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-500",
  },
  confirmada: {
    label: "Confirmada",
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-500",
  },
  cancelada: {
    label: "Cancelada",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-500",
  },
  atendida: {
    label: "Atendida",
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-500",
  },
  no_asistio: {
    label: "No asistió",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-400",
  },
  bloqueada: {
    label: "Bloqueado",
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-400",
  },
};

export type HorarioCalendario = {
  doctor_id: string;
  dia_semana: number;
  hora_inicio: string | null;
  hora_fin: string | null;
  almuerzo_inicio: string | null;
  almuerzo_fin: string | null;
};

export const TODOS_LOS_ESTADOS: EstadoCita[] = [
  "programada",
  "confirmada",
  "cancelada",
  "atendida",
  "no_asistio",
  "bloqueada",
];
