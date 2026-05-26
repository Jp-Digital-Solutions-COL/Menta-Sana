-- ============================================================
-- Agenda Médica — Schema inicial
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Tabla de consultorios
create table if not exists public.consultorios (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null,
  estado_suscripcion   text not null default 'prueba',
  created_at           timestamptz not null default now()
);

-- Tabla de perfiles (extiende auth.users)
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  role           text not null default 'doctor',
  consultorio_id uuid references public.consultorios(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- Crear perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'doctor');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.consultorios enable row level security;
alter table public.profiles enable row level security;

-- Usuarios leen su propio perfil
create policy "Usuarios leen su perfil"
  on public.profiles for select
  using (auth.uid() = id);

-- Usuarios leen su propio consultorio
create policy "Usuarios leen su consultorio"
  on public.consultorios for select
  using (
    id in (
      select consultorio_id from public.profiles where id = auth.uid()
    )
  );

-- Superadmin tiene acceso total (service_role lo maneja via admin client)
