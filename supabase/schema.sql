-- Project Planner — sync schema.
--
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
-- It is idempotent, so re-running it after an app upgrade is safe.
--
-- Design notes
-- ------------
-- Every collection in the app (milestones, gantt, tasks, dashTasks, notes,
-- raid) is already a list of `{ id, ...fields }`, so they all live in one
-- `project_rows` table with a `kind` discriminator rather than six
-- near-identical tables. That keeps the schema small, and adding a seventh
-- collection to the app needs no migration here.
--
-- Rows sync individually with last-write-wins on `rev`, so two people editing
-- different tasks in the same project don't clobber each other. Deletes are
-- tombstones (`deleted_at`): a hard delete on one device is indistinguishable
-- from "not pushed yet" on another, and would be resurrected on the next pull.
--
-- `rev` is the client's Date.now() at the time of the edit. Clocks differ
-- between devices, so the merge treats rev as a hint and falls back to the
-- server's updated_at when revs tie — see js/syncMerge.js.

-- ============================================================ profiles

-- Mirrors auth.users so members can be listed and invited by email without
-- exposing the auth schema to the client.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  created_at   timestamptz not null default now()
);

create unique index if not exists profiles_email_key on public.profiles (lower(email));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================ projects

-- Scalar project fields (projectName, dueDate, budget*, dashStatus,
-- baselineSetAt…) stay in one jsonb blob: they're edited on the project header
-- by one person at a time, so normalising them would buy nothing.
create table if not exists public.projects (
  id         uuid primary key,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  rev        bigint not null default 0,
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects (owner_id);
create index if not exists projects_updated_idx on public.projects (updated_at);

-- ============================================================ roles

-- Weakest to strongest:
--   viewer      — read only
--   contributor — reads everything, updates only rows assigned to them
--                 (the "teammates updating their own tasks" case)
--   editor      — read/write every row; cannot delete the project or manage members
--   owner       — everything
do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_role') then
    create type public.member_role as enum ('viewer', 'contributor', 'editor', 'owner');
  end if;
end
$$;

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.member_role not null default 'contributor',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx on public.project_members (user_id);

-- ============================================================ project_rows

create table if not exists public.project_rows (
  id                uuid primary key,
  project_id        uuid not null references public.projects (id) on delete cascade,
  kind              text not null check (kind in ('milestones', 'gantt', 'tasks', 'dashTasks', 'notes', 'raid')),
  position          integer not null default 0,
  data              jsonb not null default '{}'::jsonb,
  assignee_user_id  uuid references auth.users (id) on delete set null,
  rev               bigint not null default 0,
  deleted_at        timestamptz,
  updated_at        timestamptz not null default now()
);

create index if not exists project_rows_project_idx on public.project_rows (project_id, kind);
create index if not exists project_rows_updated_idx on public.project_rows (updated_at);
create index if not exists project_rows_assignee_idx on public.project_rows (assignee_user_id);

-- Server-side updated_at, so a device with a wrong clock can't poison the
-- delta-pull cursor.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

drop trigger if exists project_rows_touch on public.project_rows;
create trigger project_rows_touch before update on public.project_rows
  for each row execute function public.touch_updated_at();

-- ============================================================ access helpers

-- SECURITY DEFINER on purpose: projects' policies read project_members and
-- project_members' policies read projects, which would recurse if either was
-- evaluated under RLS. These bypass it and are the single source of truth.
create or replace function public.project_owner(p_project uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select owner_id from public.projects where id = p_project;
$$;

create or replace function public.role_in_project(p_project uuid)
returns public.member_role language sql stable security definer set search_path = public as $$
  select case
    when (select owner_id from public.projects where id = p_project) = auth.uid() then 'owner'::public.member_role
    else (select role from public.project_members where project_id = p_project and user_id = auth.uid())
  end;
$$;

create or replace function public.can_read_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.role_in_project(p_project) is not null;
$$;

-- Full write access to every row in the project.
create or replace function public.can_write_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.role_in_project(p_project) in ('editor', 'owner');
$$;

-- ============================================================ RLS

alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.project_rows    enable row level security;

-- profiles: you can always read yourself, plus anyone you share a project
-- with (so member lists and assignee pickers can show real names).
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1
    from public.project_members mine
    join public.project_members theirs on theirs.project_id = mine.project_id
    where mine.user_id = auth.uid() and theirs.user_id = public.profiles.id
  )
  or exists (
    select 1 from public.projects p
    where p.owner_id = auth.uid()
      and exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = public.profiles.id)
  )
);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- projects
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select
  using (public.can_read_project(id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert
  with check (owner_id = auth.uid());

-- Editors may update the project header; contributors and viewers may not.
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update
  using (public.can_write_project(id)) with check (public.can_write_project(id));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete
  using (owner_id = auth.uid());

-- project_members: you can see your own memberships and, as owner, everyone's.
drop policy if exists project_members_read on public.project_members;
create policy project_members_read on public.project_members for select
  using (user_id = auth.uid() or public.project_owner(project_id) = auth.uid());

drop policy if exists project_members_write on public.project_members;
create policy project_members_write on public.project_members for all
  using (public.project_owner(project_id) = auth.uid())
  with check (public.project_owner(project_id) = auth.uid());

-- project_rows
drop policy if exists project_rows_read on public.project_rows;
create policy project_rows_read on public.project_rows for select
  using (public.can_read_project(project_id));

drop policy if exists project_rows_insert on public.project_rows;
create policy project_rows_insert on public.project_rows for insert
  with check (public.can_write_project(project_id));

-- The one rule that makes "teammates update their own tasks" real: a
-- contributor may update a row only while it is assigned to them, and may not
-- reassign it away from themselves.
drop policy if exists project_rows_update on public.project_rows;
create policy project_rows_update on public.project_rows for update
  using (
    public.can_write_project(project_id)
    or (public.role_in_project(project_id) = 'contributor' and assignee_user_id = auth.uid())
  )
  with check (
    public.can_write_project(project_id)
    or (public.role_in_project(project_id) = 'contributor' and assignee_user_id = auth.uid())
  );

drop policy if exists project_rows_delete on public.project_rows;
create policy project_rows_delete on public.project_rows for delete
  using (public.can_write_project(project_id));

-- ============================================================ grants

-- Supabase's default privileges usually cover this, but granting explicitly
-- means the schema behaves the same however it was applied. RLS above is what
-- actually restricts access; these grants only make the tables reachable.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.projects        to authenticated;
grant select, insert, update, delete on public.project_rows    to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, update                 on public.profiles        to authenticated;
grant execute on function public.role_in_project(uuid)   to authenticated;
grant execute on function public.can_read_project(uuid)  to authenticated;
grant execute on function public.can_write_project(uuid) to authenticated;
grant execute on function public.project_owner(uuid)     to authenticated;
