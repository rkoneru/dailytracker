-- Row level security, executed and attacked.
--
-- Every case below is somebody trying to reach data they should not. The
-- policies are the only thing standing in the way — the app is not involved,
-- and could not help if it were: anyone holding the anon key can make these
-- exact requests from a terminal. So this is the file that decides whether the
-- word "secure" is earned.
--
-- Each check runs as a real database role with a real JWT claim, exactly as a
-- PostgREST request does. `ok` means the attack failed, which is the good case.

\set ON_ERROR_STOP on
\pset pager off

create table if not exists results (
  n serial primary key,
  name text not null,
  passed boolean not null,
  detail text
);
truncate results restart identity;

create or replace procedure check_true(p_name text, p_value boolean, p_detail text default '')
language plpgsql as $$
begin
  insert into results (name, passed, detail) values (p_name, coalesce(p_value, false), p_detail);
end $$;

/**
 * Runs a statement as a user and records whether it was refused.
 *
 * "Refused" covers both shapes RLS takes: an outright error on insert or
 * update with a failing WITH CHECK, and a silent zero rows affected when the
 * USING clause hides the row. The second is the one that looks like success
 * from the client, so it has to count as a refusal here.
 */
create or replace procedure check_denied(p_name text, p_user uuid, p_sql text)
language plpgsql as $$
declare
  affected integer;
begin
  begin
    call test_become(p_user);
    execute p_sql;
    get diagnostics affected = row_count;
    reset role;
    if affected = 0 then
      insert into results (name, passed, detail) values (p_name, true, 'no rows affected');
    else
      insert into results (name, passed, detail)
        values (p_name, false, format('ALLOWED — %s rows affected', affected));
    end if;
  exception when others then
    reset role;
    insert into results (name, passed, detail) values (p_name, true, 'refused: ' || sqlerrm);
  end;
end $$;

create or replace procedure check_allowed(p_name text, p_user uuid, p_sql text)
language plpgsql as $$
declare
  affected integer;
begin
  begin
    call test_become(p_user);
    execute p_sql;
    get diagnostics affected = row_count;
    reset role;
    insert into results (name, passed, detail)
      values (p_name, affected > 0, format('%s rows affected', affected));
  exception when others then
    reset role;
    insert into results (name, passed, detail) values (p_name, false, 'REFUSED: ' || sqlerrm);
  end;
end $$;

/**
 * How many rows a given user can see, or -1 when the read was refused outright.
 *
 * Both answers mean "sees nothing", and the -1 case is the stronger of the
 * two: the anon role has no GRANT on these tables at all, so an unauthenticated
 * request is stopped by table privileges before RLS is even consulted.
 */
create or replace function visible_count(p_user uuid, p_sql text)
returns integer language plpgsql as $$
declare n integer;
begin
  call test_become(p_user);
  execute p_sql into n;
  reset role;
  return n;
exception when others then
  reset role;
  return -1;
end $$;

create or replace function anon_count(p_sql text)
returns integer language plpgsql as $$
declare n integer;
begin
  call test_become_anon();
  execute p_sql into n;
  reset role;
  return n;
exception when others then
  reset role;
  return -1;
end $$;

-- ============================================================ the cast

truncate auth.users cascade;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'editor@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'contributor@example.test'),
  ('00000000-0000-4000-8000-000000000004', 'viewer@example.test'),
  ('00000000-0000-4000-8000-000000000005', 'stranger@example.test');

-- Two projects: one the cast shares, one only the stranger can see. The second
-- is what makes "can they read somebody else's project" a real question.
insert into public.projects (id, owner_id, data) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
   '{"projectName":"Shared"}'::jsonb),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005',
   '{"projectName":"Private to the stranger"}'::jsonb);

insert into public.project_members (project_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'editor'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'contributor'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'viewer');

insert into public.project_rows (id, project_id, kind, data, rev, assignee_user_id) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'dashTasks',
   '{"name":"Mine"}'::jsonb, 1, '00000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'dashTasks',
   '{"name":"Somebody else''s"}'::jsonb, 1, '00000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'dashTasks',
   '{"name":"In the stranger''s project"}'::jsonb, 1, null);

-- ============================================================ reading

do $$
declare n integer;
begin
  n := anon_count('select count(*) from public.projects');
  call check_true('anon sees no projects', n <= 0, format('saw %s', n));

  n := anon_count('select count(*) from public.project_rows');
  call check_true('anon sees no rows', n <= 0, format('saw %s', n));

  n := anon_count('select count(*) from public.profiles');
  call check_true('anon sees no profiles', n <= 0, format('saw %s', n));
end $$;

do $$
declare n integer;
begin
  n := visible_count('00000000-0000-4000-8000-000000000004',
    'select count(*) from public.projects');
  call check_true('a viewer sees only the project they are in', n = 1, format('saw %s', n));

  n := visible_count('00000000-0000-4000-8000-000000000005',
    'select count(*) from public.projects');
  call check_true('a stranger sees only their own', n = 1, format('saw %s', n));

  n := visible_count('00000000-0000-4000-8000-000000000005',
    'select count(*) from public.project_rows where project_id = ''10000000-0000-4000-8000-000000000001''');
  call check_true('a stranger cannot read the shared project''s rows', n = 0, format('saw %s', n));

  n := visible_count('00000000-0000-4000-8000-000000000004',
    'select count(*) from public.project_rows where project_id = ''10000000-0000-4000-8000-000000000002''');
  call check_true('a viewer cannot read a project they are not in', n = 0, format('saw %s', n));
end $$;

-- ============================================================ writing

-- A viewer is read only. This is the single most important rule in the file:
-- if it does not hold, every other guarantee is decoration.
call check_denied('a viewer cannot update a row',
  '00000000-0000-4000-8000-000000000004',
  $q$update public.project_rows set data = '{"name":"hacked"}'::jsonb
     where id = '20000000-0000-4000-8000-000000000001'$q$);

call check_denied('a viewer cannot insert a row',
  '00000000-0000-4000-8000-000000000004',
  $q$insert into public.project_rows (id, project_id, kind, data, rev)
     values (gen_random_uuid(), '10000000-0000-4000-8000-000000000001', 'dashTasks', '{}'::jsonb, 2)$q$);

call check_denied('a viewer cannot delete a row',
  '00000000-0000-4000-8000-000000000004',
  $q$delete from public.project_rows where id = '20000000-0000-4000-8000-000000000001'$q$);

call check_denied('a viewer cannot edit the project itself',
  '00000000-0000-4000-8000-000000000004',
  $q$update public.projects set data = '{"projectName":"hacked"}'::jsonb
     where id = '10000000-0000-4000-8000-000000000001'$q$);

-- A contributor may edit what is assigned to them, and nothing else.
call check_allowed('a contributor can edit their own task',
  '00000000-0000-4000-8000-000000000003',
  $q$update public.project_rows set data = '{"name":"edited by me"}'::jsonb
     where id = '20000000-0000-4000-8000-000000000001'$q$);

call check_denied('a contributor cannot edit somebody else''s task',
  '00000000-0000-4000-8000-000000000003',
  $q$update public.project_rows set data = '{"name":"hacked"}'::jsonb
     where id = '20000000-0000-4000-8000-000000000002'$q$);

-- The reassignment hole: if a contributor could hand a row to themselves they
-- would have write access to everything, one row at a time.
call check_denied('a contributor cannot reassign a row to themselves',
  '00000000-0000-4000-8000-000000000003',
  $q$update public.project_rows
     set assignee_user_id = '00000000-0000-4000-8000-000000000003'
     where id = '20000000-0000-4000-8000-000000000002'$q$);

call check_denied('a contributor cannot reassign their own row away and keep editing it',
  '00000000-0000-4000-8000-000000000003',
  $q$update public.project_rows
     set assignee_user_id = '00000000-0000-4000-8000-000000000004', data = '{"name":"x"}'::jsonb
     where id = '20000000-0000-4000-8000-000000000001'$q$);

call check_denied('a contributor cannot delete even their own task',
  '00000000-0000-4000-8000-000000000003',
  $q$delete from public.project_rows where id = '20000000-0000-4000-8000-000000000001'$q$);

-- An editor changes content but does not control access or the project's life.
call check_allowed('an editor can edit any row',
  '00000000-0000-4000-8000-000000000002',
  $q$update public.project_rows set data = '{"name":"editor was here"}'::jsonb
     where id = '20000000-0000-4000-8000-000000000001'$q$);

call check_denied('an editor cannot delete the project',
  '00000000-0000-4000-8000-000000000002',
  $q$delete from public.projects where id = '10000000-0000-4000-8000-000000000001'$q$);

-- Privilege escalation, the attack that matters most: can a member give
-- themselves a bigger role?
call check_denied('an editor cannot promote themselves to owner',
  '00000000-0000-4000-8000-000000000002',
  $q$update public.project_members set role = 'owner'
     where project_id = '10000000-0000-4000-8000-000000000001'
       and user_id = '00000000-0000-4000-8000-000000000002'$q$);

call check_denied('a viewer cannot promote themselves',
  '00000000-0000-4000-8000-000000000004',
  $q$update public.project_members set role = 'editor'
     where project_id = '10000000-0000-4000-8000-000000000001'
       and user_id = '00000000-0000-4000-8000-000000000004'$q$);

call check_denied('a viewer cannot add themselves to another project',
  '00000000-0000-4000-8000-000000000004',
  $q$insert into public.project_members (project_id, user_id, role)
     values ('10000000-0000-4000-8000-000000000002',
             '00000000-0000-4000-8000-000000000004', 'owner')$q$);

call check_denied('an editor cannot invite anyone',
  '00000000-0000-4000-8000-000000000002',
  $q$insert into public.project_invites (project_id, email, role, invited_by)
     values ('10000000-0000-4000-8000-000000000001', 'new@example.test', 'owner',
             '00000000-0000-4000-8000-000000000002')$q$);

-- Writing into somebody else's project by naming its id directly. The client
-- would never do this; a terminal would.
call check_denied('a member cannot write into a project they do not belong to',
  '00000000-0000-4000-8000-000000000002',
  $q$insert into public.project_rows (id, project_id, kind, data, rev)
     values (gen_random_uuid(), '10000000-0000-4000-8000-000000000002', 'dashTasks', '{}'::jsonb, 2)$q$);

call check_denied('a member cannot move a row into another project',
  '00000000-0000-4000-8000-000000000002',
  $q$update public.project_rows set project_id = '10000000-0000-4000-8000-000000000002'
     where id = '20000000-0000-4000-8000-000000000001'$q$);

-- Owners keep their powers.
call check_allowed('an owner can manage members',
  '00000000-0000-4000-8000-000000000001',
  $q$update public.project_members set role = 'editor'
     where project_id = '10000000-0000-4000-8000-000000000001'
       and user_id = '00000000-0000-4000-8000-000000000004'$q$);

-- ============================================================ delegated admin
--
-- An engagement manager administers without owning. The whole question is
-- whether "administers" can be turned into "owns" by anyone holding it.

-- The owner delegates to the editor.
do $$ begin
  update public.project_members set can_admin = true
  where project_id = '10000000-0000-4000-8000-000000000001'
    and user_id = '00000000-0000-4000-8000-000000000002';
end $$;

call check_allowed('a delegated admin can set somebody''s job role',
  '00000000-0000-4000-8000-000000000002',
  $q$update public.project_members set job_role = 'tester'
     where project_id = '10000000-0000-4000-8000-000000000001'
       and user_id = '00000000-0000-4000-8000-000000000003'$q$);

call check_allowed('and can change their access role',
  '00000000-0000-4000-8000-000000000002',
  $q$update public.project_members set role = 'viewer'
     where project_id = '10000000-0000-4000-8000-000000000001'
       and user_id = '00000000-0000-4000-8000-000000000003'$q$);

-- The three fences. Each one of these succeeding would make delegation
-- equivalent to handing over ownership.
call check_denied('a delegated admin cannot promote anyone to owner',
  '00000000-0000-4000-8000-000000000002',
  $q$update public.project_members set role = 'owner'
     where project_id = '10000000-0000-4000-8000-000000000001'
       and user_id = '00000000-0000-4000-8000-000000000003'$q$);

call check_denied('a delegated admin cannot mint another admin',
  '00000000-0000-4000-8000-000000000002',
  $q$update public.project_members set can_admin = true
     where project_id = '10000000-0000-4000-8000-000000000001'
       and user_id = '00000000-0000-4000-8000-000000000003'$q$);

call check_denied('a delegated admin cannot touch their own membership',
  '00000000-0000-4000-8000-000000000002',
  $q$update public.project_members set role = 'owner'
     where project_id = '10000000-0000-4000-8000-000000000001'
       and user_id = '00000000-0000-4000-8000-000000000002'$q$);

call check_denied('a delegated admin cannot delete themselves out of the fence',
  '00000000-0000-4000-8000-000000000002',
  $q$delete from public.project_members
     where project_id = '10000000-0000-4000-8000-000000000001'
       and user_id = '00000000-0000-4000-8000-000000000002'$q$);

call check_denied('a delegated admin cannot invite an owner',
  '00000000-0000-4000-8000-000000000002',
  $q$insert into public.project_invites (project_id, email, role, invited_by)
     values ('10000000-0000-4000-8000-000000000001', 'newowner@example.test', 'owner',
             '00000000-0000-4000-8000-000000000002')$q$);

call check_allowed('but can invite an editor',
  '00000000-0000-4000-8000-000000000002',
  $q$insert into public.project_invites (project_id, email, role, invited_by)
     values ('10000000-0000-4000-8000-000000000001', 'neweditor@example.test', 'editor',
             '00000000-0000-4000-8000-000000000002')$q$);

-- A plain member must not gain any of this simply because the column exists.
call check_denied('a contributor cannot make themselves an admin',
  '00000000-0000-4000-8000-000000000003',
  $q$update public.project_members set can_admin = true
     where project_id = '10000000-0000-4000-8000-000000000001'
       and user_id = '00000000-0000-4000-8000-000000000003'$q$);

call check_denied('a contributor cannot set their own job role',
  '00000000-0000-4000-8000-000000000003',
  $q$update public.project_members set job_role = 'engagement-lead'
     where project_id = '10000000-0000-4000-8000-000000000001'
       and user_id = '00000000-0000-4000-8000-000000000003'$q$);

-- ============================================================ page policy

call check_allowed('an admin can write the page policy',
  '00000000-0000-4000-8000-000000000002',
  $q$insert into public.workspace_policy (project_id, pages, updated_by)
     values ('10000000-0000-4000-8000-000000000001',
             '{"tester":["tab-mywork"]}'::jsonb,
             '00000000-0000-4000-8000-000000000002')
     on conflict (project_id) do update set pages = excluded.pages$q$);

do $$
declare n integer;
begin
  n := visible_count('00000000-0000-4000-8000-000000000003',
    'select count(*) from public.workspace_policy where project_id = ''10000000-0000-4000-8000-000000000001''');
  call check_true('a member can read the policy that governs them', n = 1, format('saw %s', n));

  n := visible_count('00000000-0000-4000-8000-000000000005',
    'select count(*) from public.workspace_policy');
  call check_true('a stranger cannot read another workspace''s policy', n = 0, format('saw %s', n));
end $$;

call check_denied('a contributor cannot rewrite the page policy',
  '00000000-0000-4000-8000-000000000003',
  $q$update public.workspace_policy
     set pages = '{"tester":["tab-mywork","tab-sync","tab-settings"]}'::jsonb
     where project_id = '10000000-0000-4000-8000-000000000001'$q$);

call check_denied('nor insert one for a workspace they are not in',
  '00000000-0000-4000-8000-000000000003',
  $q$insert into public.workspace_policy (project_id, pages)
     values ('10000000-0000-4000-8000-000000000002', '{}'::jsonb)$q$);

call check_denied('nor delete it to remove the restriction',
  '00000000-0000-4000-8000-000000000003',
  $q$delete from public.workspace_policy
     where project_id = '10000000-0000-4000-8000-000000000001'$q$);

call check_denied('a viewer cannot flip require_sign_in off',
  '00000000-0000-4000-8000-000000000004',
  $q$update public.workspace_policy set require_sign_in = false
     where project_id = '10000000-0000-4000-8000-000000000001'$q$);

-- ============================================================ report

select name, case when passed then 'ok  ' else 'FAIL' end as result, detail
from results order by n;

select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed
from results;
