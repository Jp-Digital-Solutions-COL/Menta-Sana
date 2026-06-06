export const DEFAULT_PLANTILLA =
  "Hola {nombre}, le recordamos cordialmente que tiene un saldo pendiente de {monto} {sesiones}. Por favor contáctenos para coordinar el pago. ¡Muchas gracias!";

export type MetodoItem = {
  metodo: string;
  label: string;
  total: number;
  count: number;
};

export type CuentaPorCobrar = {
  pacienteId: string;
  nombre: string;
  telefono: string | null;
  totalAdeudado: number;
  sesionesCount: number;
  sesionMasAntigua: string;
  sesionFechas: string[];
};

export type PagosData = {
  totalPeriodo: number;
  totalMes: number;
  totalSemana: number;
  totalCCP: number;
  porMetodo: MetodoItem[];
  cuentasPorCobrar: CuentaPorCobrar[];
};

export type DoctorItem = {
  id: string;
  nombre: string;
  titulo: string | null;
};
