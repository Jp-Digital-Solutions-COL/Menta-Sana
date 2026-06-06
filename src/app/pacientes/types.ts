export type Paciente = {
  id: string;
  consultorio_id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  cedula: string | null;
  tipo_documento: string | null;
  notas: string | null;
  created_at: string;
};

export type PacienteFields = {
  nombre: string;
  telefono: string;
  email: string;
  cedula: string;
  tipo_documento: string;
  notas: string;
};

export type ResumenCitaPago = {
  citaId: string;
  inicio: string;
  estado: string;
  motivo: string | null;
  tarifa: number | null;
  doctorNombre: string;
  doctorTitulo: string | null;
  totalPagado: number;
  saldo: number | null;
  estadoPago: "pagado" | "parcial" | "pendiente";
};
