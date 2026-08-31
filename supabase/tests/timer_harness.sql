-- Squelette minimal reproduisant ce dont v8.sql a besoin.
drop schema if exists public cascade; create schema public;
drop schema if exists auth cascade; create schema auth;

create table public.profiles (id uuid primary key, role text not null, display_name text);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  child_id uuid references public.profiles(id),
  title text, status text not null default 'todo',
  duration_min integer not null default 45,
  started_at timestamptz,
  active_seconds integer not null default 0,
  timer_running boolean not null default false,
  timer_segment_at timestamptz,
  timer_device text, timer_device_kind text,
  work_on_phone boolean not null default false
);

-- utilisateur courant, simulé
create table auth._who (id uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select id from auth._who limit 1 $$;
create or replace function public.is_parent() returns boolean language sql stable as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'parent') $$;

insert into public.profiles values ('11111111-1111-1111-1111-111111111111','child','Jeanne'),
                                   ('22222222-2222-2222-2222-222222222222','parent','Maman');
insert into auth._who values ('11111111-1111-1111-1111-111111111111');
