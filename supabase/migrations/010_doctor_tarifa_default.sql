-- Tarifa por defecto del especialista (para prellenar al crear citas)
ALTER TABLE public.doctores
  ADD COLUMN IF NOT EXISTS tarifa_default numeric(12,2) CHECK (tarifa_default IS NULL OR tarifa_default >= 0);
