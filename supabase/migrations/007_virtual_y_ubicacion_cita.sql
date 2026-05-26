-- Consultorio virtual: sin dirección requerida
ALTER TABLE ubicaciones_doctor
  ADD COLUMN IF NOT EXISTS es_virtual boolean NOT NULL DEFAULT false;

-- Ubicación específica de la cita (seleccionada al agendar, no desde el horario)
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS ubicacion_id uuid REFERENCES ubicaciones_doctor(id) ON DELETE SET NULL;
