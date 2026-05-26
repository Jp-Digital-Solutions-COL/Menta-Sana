-- Franja de almuerzo por día de horario (ambas columnas opcionales)
ALTER TABLE public.horarios
  ADD COLUMN IF NOT EXISTS almuerzo_inicio time,
  ADD COLUMN IF NOT EXISTS almuerzo_fin   time;
