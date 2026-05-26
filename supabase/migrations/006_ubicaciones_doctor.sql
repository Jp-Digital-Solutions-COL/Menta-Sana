-- Sedes / consultorios adicionales por doctor
CREATE TABLE public.ubicaciones_doctor (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id   uuid NOT NULL REFERENCES public.doctores(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  direccion   text,
  telefono    text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.ubicaciones_doctor ENABLE ROW LEVEL SECURITY;

-- Acceso al consultorio del usuario autenticado
CREATE POLICY "consultorio_access" ON public.ubicaciones_doctor
  FOR ALL
  USING (
    doctor_id IN (
      SELECT d.id FROM public.doctores d
      JOIN public.profiles p ON p.consultorio_id = d.consultorio_id
      WHERE p.id = auth.uid()
    )
  )
  WITH CHECK (
    doctor_id IN (
      SELECT d.id FROM public.doctores d
      JOIN public.profiles p ON p.consultorio_id = d.consultorio_id
      WHERE p.id = auth.uid()
    )
  );

-- Sede del doctor para cada día de horario (null = consultorio principal)
ALTER TABLE public.horarios
  ADD COLUMN IF NOT EXISTS ubicacion_id uuid REFERENCES public.ubicaciones_doctor(id) ON DELETE SET NULL;
