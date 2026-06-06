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
