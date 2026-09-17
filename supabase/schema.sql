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

  -- Claim anything waiting for this address. Signing up is what turns an
  -- invitation into access; nothing else has to run.
  insert into public.project_members (project_id, user_id, role, invited_by)
  select i.project_id, new.id, i.role, i.invited_by
  from public.project_invites i
  where lower(i.email) = lower(new.email)
  on conflict (project_id, user_id) do nothing;

  delete from public.project_invites where lower(email) = lower(new.email);

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


-- ============================================================ invites
--
-- project_members references auth.users, so someone can only be made a member
-- once they have an account. Inviting a person who has not signed up yet
-- therefore needs somewhere to park the intent: a row here, keyed by email,
-- which handle_new_user() converts into a real membership the moment they
-- accept the sign-in link.
--
-- The alternative — the admin API that creates users directly — needs the
-- service role key, which must never reach a browser. This keeps the whole
-- flow inside what the anon key plus RLS can safely do.

create table if not exists public.project_invites (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email      text not null,
  role       public.member_role not null default 'contributor',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists project_invites_unique
  on public.project_invites (project_id, lower(email));
create index if not exists project_invites_email_idx on public.project_invites (lower(email));

-- ============================================================ project_rows

create table if not exists public.project_rows (
  id                uuid primary key,
  project_id        uuid not null references public.projects (id) on delete cascade,
  -- `kind` was an enumerated list until the PMP and ITIL registers arrived and
  -- turned it into fourteen more names. Enumerating them in SQL means a
  -- database migration every time the app grows a register, for a constraint
  -- that only ever restated what the client already sends, so the check now
  -- just refuses junk. The set of kinds lives in js/syncModel.js.
  kind              text not null check (kind <> '' and length(kind) <= 64),
  position          integer not null default 0,
  data              jsonb not null default '{}'::jsonb,
  assignee_user_id  uuid references auth.users (id) on delete set null,
  rev               bigint not null default 0,
  deleted_at        timestamptz,
  updated_at        timestamptz not null default now()
);

-- A database created before the registers existed still carries the old
-- enumerated check, and `create table if not exists` above will not touch it.
-- Dropping and re-adding is safe to re-run.
alter table public.project_rows drop constraint if exists project_rows_kind_check;
alter table public.project_rows add constraint project_rows_kind_check
  check (kind <> '' and length(kind) <= 64);

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

/**
 * True when the current user and `p_user` can see each other: they share a
 * project, or one owns a project the other belongs to.
 *
 * SECURITY DEFINER because a policy's subquery is itself subject to the
 * referenced table's RLS — reading project_members from inside the profiles
 * policy would be filtered by the project_members policy and quietly return
 * too little. Owners are implicit rather than rows in project_members, which
 * is why each direction has to be spelled out.
 */
create or replace function public.shares_project_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    -- both are members of the same project
    select 1 from public.project_members mine
    join public.project_members theirs on theirs.project_id = mine.project_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user
  ) or exists (
    -- I own a project they belong to
    select 1 from public.projects p
    join public.project_members m on m.project_id = p.id
    where p.owner_id = auth.uid() and m.user_id = p_user
  ) or exists (
    -- they own a project I belong to
    select 1 from public.projects p
    join public.project_members m on m.project_id = p.id
    where p.owner_id = p_user and m.user_id = auth.uid()
  );
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
  id = auth.uid() or public.shares_project_with(id)
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

-- project_invites: only the project's owner sees or manages pending invites.
-- Invitees cannot read the table — they never need to, since signing up
-- converts the invite for them.
alter table public.project_invites enable row level security;

drop policy if exists project_invites_read on public.project_invites;
create policy project_invites_read on public.project_invites for select
  using (public.project_owner(project_id) = auth.uid());

drop policy if exists project_invites_write on public.project_invites;
create policy project_invites_write on public.project_invites for all
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
grant select, insert, update, delete on public.project_invites to authenticated;
grant select, update                 on public.profiles        to authenticated;
grant execute on function public.role_in_project(uuid)   to authenticated;
grant execute on function public.can_read_project(uuid)  to authenticated;
grant execute on function public.can_write_project(uuid) to authenticated;
grant execute on function public.project_owner(uuid)     to authenticated;
grant execute on function public.shares_project_with(uuid) to authenticated;

-- ============================================================ administration
--
-- Two things move server-side here, because a preference every user could set
-- for themselves is not a policy:
--
--   * `job_role` — what somebody does (project manager, tester, service
--     manager). It decides which pages the app offers them. It was a personal
--     setting; it is now assigned.
--   * `can_admin` — the grant that lets someone administer the workspace
--     without owning it, which is what an engagement manager needs: manage
--     people and page access, but not delete the project.
--
-- Being blunt about what this is and is not. `job_role` and the page policy
-- below are workspace policy, not access control: the app hides a page, and
-- hiding is a client-side act that a determined person can undo in a browser
-- console. What stops them reaching the *data* is the row level security
-- above, which is enforced by Postgres and cannot be undone from a client.
-- Those are two different guarantees and conflating them would be the most
-- dangerous sentence in this file.

alter table public.project_members
  add column if not exists job_role  text,
  add column if not exists can_admin boolean not null default false;

-- Free text rather than an enum: job roles are the app's vocabulary and it
-- gains one every few releases. An unrecognised value falls back to the most
-- restrictive set of pages on the client, so a typo cannot open anything up.
alter table public.project_members drop constraint if exists project_members_job_role_check;
alter table public.project_members add constraint project_members_job_role_check
  check (job_role is null or (job_role <> '' and length(job_role) <= 64));

/**
 * Who may administer a project: its owner, anyone holding the owner role, and
 * anyone the owner has granted can_admin.
 *
 * SECURITY DEFINER for the same reason as the functions above — a policy on
 * project_members that reads project_members would recurse.
 */
create or replace function public.is_project_admin(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select owner_id from public.projects where id = p_project) = auth.uid()
    or exists (
      select 1 from public.project_members
      where project_id = p_project and user_id = auth.uid()
        and (role = 'owner' or can_admin)
    ), false);
$$;

-- Members: owners keep full control. A delegated admin may manage everyone
-- else, and is deliberately fenced away from three things — promoting anyone
-- to owner, minting another admin, and touching their own row. Without that
-- last clause an admin could simply grant themselves ownership, and the
-- delegation would be indistinguishable from handing over the keys.
drop policy if exists project_members_write on public.project_members;
create policy project_members_write on public.project_members for all
  using (
    public.project_owner(project_id) = auth.uid()
    or (public.is_project_admin(project_id)
        and role <> 'owner'
        and user_id <> auth.uid())
  )
  with check (
    public.project_owner(project_id) = auth.uid()
    or (public.is_project_admin(project_id)
        and role <> 'owner'
        and can_admin = false
        and user_id <> auth.uid())
  );

-- An admin needs to see everyone to manage them; a plain member still sees
-- only their own membership.
drop policy if exists project_members_read on public.project_members;
create policy project_members_read on public.project_members for select
  using (user_id = auth.uid() or public.is_project_admin(project_id));

-- Invites follow the same delegation, minus the ability to invite an owner.
drop policy if exists project_invites_read on public.project_invites;
create policy project_invites_read on public.project_invites for select
  using (public.is_project_admin(project_id));

drop policy if exists project_invites_write on public.project_invites;
create policy project_invites_write on public.project_invites for all
  using (public.is_project_admin(project_id))
  with check (
    public.is_project_admin(project_id)
    and (role <> 'owner' or public.project_owner(project_id) = auth.uid())
  );

-- ============================================================ page policy

-- Which pages each job role is offered, for one project. One row per project,
-- a JSON object of { jobRole: [navId, ...] }, because the app's nav is the
-- only thing that knows what a page is and this table should not have to be
-- migrated every time one is added.
create table if not exists public.workspace_policy (
  project_id  uuid primary key references public.projects (id) on delete cascade,
  pages       jsonb not null default '{}'::jsonb,
  -- Whether this workspace expects people to sign in. A client honours it by
  -- showing the sign-in screen; it is a statement of intent, not a lock, and
  -- the UI says so. What actually protects the data is that without an account
  -- there is nothing to sync down.
  require_sign_in boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

alter table public.workspace_policy enable row level security;

drop policy if exists workspace_policy_read on public.workspace_policy;
create policy workspace_policy_read on public.workspace_policy for select
  using (public.can_read_project(project_id));

drop policy if exists workspace_policy_write on public.workspace_policy;
create policy workspace_policy_write on public.workspace_policy for all
  using (public.is_project_admin(project_id))
  with check (public.is_project_admin(project_id));

grant select, insert, update, delete on public.workspace_policy to authenticated;
grant execute on function public.is_project_admin(uuid) to authenticated;
