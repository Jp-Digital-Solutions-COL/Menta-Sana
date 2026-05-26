-- ============================================================
-- Agenda Médica — Pacientes
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists public.pacientes (
  id             uuid primary key default gen_random_uuid(),
  consultorio_id uuid not null references public.consultorios(id) on delete cascade,
  nombre         text not null,
  telefono       text,
  email          text,
  notas          text,
  created_at     timestamptz not null default now()
);

-- Índice para búsqueda por nombre
create index if not exists pacientes_nombre_idx
  on public.pacientes (consultorio_id, lower(nombre));

-- ============================================================
-- RLS
-- ============================================================
alter table public.pacientes enable row level security;

drop policy if exists "Acceso completo a pacientes propios" on public.pacientes;
create policy "Acceso completo a pacientes propios"
  on public.pacientes for all
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
