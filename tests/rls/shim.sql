-- The parts of Supabase the schema leans on, so it can run on a plain Postgres.
--
-- This exists so the row level security policies can actually be executed and
-- attacked, rather than read and hoped about. Everything here mirrors what
-- Supabase provides: the two database roles PostgREST connects as, an
-- `auth.users` table, and `auth.uid()` reading the JWT claim that PostgREST
-- sets on every request.
--
-- Nothing in this file ships. It is the test rig.

create schema if not exists auth;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create table if not exists auth.users (
  id                    uuid primary key,
  email                 text unique not null,
  raw_user_meta_data    jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

-- PostgREST sets request.jwt.claims per request; auth.uid() reads the subject
-- out of it. `true` on current_setting means "null if unset" rather than an
-- error, which is what an unauthenticated request looks like.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'anon');
$$;

grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;

-- Becoming a user, the way a PostgREST request does: switch to the
-- `authenticated` database role and carry the user's id in the JWT claims.
-- Everything after this call is subject to RLS exactly as it is in production.
create or replace procedure test_become(p_user uuid)
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
  execute 'set local role authenticated';
end $$;

create or replace procedure test_become_anon()
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'set local role anon';
end $$;
