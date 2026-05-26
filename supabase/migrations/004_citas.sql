-- ============================================================
-- Agenda Médica — Citas
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists public.citas (
  id             uuid primary key default gen_random_uuid(),
  consultorio_id uuid not null references public.consultorios(id) on delete cascade,
  doctor_id      uuid not null references public.doctores(id) on delete cascade,
  paciente_id    uuid not null references public.pacientes(id) on delete cascade,
  fecha_hora     timestamp not null, -- sin zona horaria; se almacena hora local
  duracion       smallint not null check (duracion > 0),
  estado         text not null default 'programada'
                   check (estado in ('programada','confirmada','cancelada','atendida','no_asistio')),
  notas          text,
  created_at     timestamptz not null default now()
);

create index if not exists citas_doctor_fecha_idx
  on public.citas (doctor_id, fecha_hora);

create index if not exists citas_consultorio_fecha_idx
  on public.citas (consultorio_id, fecha_hora);

-- ============================================================
-- RLS
-- ============================================================
alter table public.citas enable row level security;

drop policy if exists "Acceso completo a citas propias" on public.citas;
create policy "Acceso completo a citas propias"
  on public.citas for all
  using (
    consultorio_id in (
      select consultorio_id from public.profiles where id = auth.uid()
    )
  )
  with check (
    consultorio_id in (
      select consultorio_id from public.profiles where id = auth.uid()
    )
  );
