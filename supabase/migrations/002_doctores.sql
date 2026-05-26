-- ============================================================
-- Agenda Médica — Doctores y Horarios
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Tabla de doctores
create table if not exists public.doctores (
  id             uuid primary key default gen_random_uuid(),
  consultorio_id uuid not null references public.consultorios(id) on delete cascade,
  nombre         text not null,
  especialidad   text,
  activo         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Tabla de horarios (un registro por doctor por día)
create table if not exists public.horarios (
  id            uuid primary key default gen_random_uuid(),
  doctor_id     uuid not null references public.doctores(id) on delete cascade,
  dia_semana    smallint not null check (dia_semana between 0 and 6), -- 0=Dom … 6=Sáb
  hora_inicio   time not null,
  hora_fin      time not null,
  duracion_cita smallint not null default 30 check (duracion_cita > 0),
  created_at    timestamptz not null default now(),
  constraint horario_valido check (hora_fin > hora_inicio),
  unique (doctor_id, dia_semana)
);

-- ============================================================
-- RLS Doctores
-- ============================================================
alter table public.doctores enable row level security;

drop policy if exists "Acceso completo a doctores propios" on public.doctores;
create policy "Acceso completo a doctores propios"
  on public.doctores for all
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

-- ============================================================
-- RLS Horarios
-- ============================================================
alter table public.horarios enable row level security;

drop policy if exists "Acceso completo a horarios propios" on public.horarios;
create policy "Acceso completo a horarios propios"
  on public.horarios for all
  using (
    doctor_id in (
      select d.id from public.doctores d
      join public.profiles p on p.consultorio_id = d.consultorio_id
      where p.id = auth.uid()
    )
  )
  with check (
    doctor_id in (
      select d.id from public.doctores d
      join public.profiles p on p.consultorio_id = d.consultorio_id
      where p.id = auth.uid()
    )
  );
