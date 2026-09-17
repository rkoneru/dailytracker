# Security

What this app actually enforces, what it only tidies, and how to check both
yourself. The short version is that there are two different guarantees here and
they are not equally strong — so they are described separately rather than
folded into one reassuring sentence.

## The two modes

**On this device.** No account. Every project lives in this browser's
`localStorage`, unencrypted, like every offline web app. Nothing is sent
anywhere. Nobody else can read it *over a network*, and anyone with the
unlocked device can read all of it. The role picker in the sidebar is a
personal view filter, because there is nobody here to protect you from.

**In a workspace.** Signed in against your own Supabase project. Projects sync
to a server you control. Your access role is enforced by Postgres, your job
role and page access are assigned by an administrator, and neither is settable
from the app.

## What is enforced, and by what

| Guarantee | Enforced by | Strength |
|---|---|---|
| Who may read a project | Postgres row level security | **Real.** Checked on every request, cannot be bypassed from a client. |
| Who may write, and which rows | Postgres row level security | **Real.** A contributor may edit only rows assigned to them, and may not reassign them. |
| Who may manage people and page access | Postgres row level security | **Real.** Owner, or someone the owner delegated to. |
| Which pages you are shown | The app | **Not a boundary.** A browser console undoes it. |
| "Everyone should sign in" | The app | **A statement of intent**, not a lock. |

The middle three rows are the ones worth reading twice. Hiding a page is a
usability decision that keeps the sidebar honest. It is not what stops someone
reading data — that is the first two rows, and they hold whatever the app does.

## The delegation fences

An administrator who is not the owner — the case this is built for, an
engagement manager running a workspace — can manage everyone else's access and
job role, and set page access. They deliberately **cannot**:

- promote anyone (including themselves) to owner,
- grant `can_admin` to anyone, so they cannot mint a second administrator,
- edit or delete their own membership row.

Without the third, delegation would be one UPDATE away from a handover. All
three are enforced by the `project_members_write` policy, not by the UI.

## Checking it yourself

The policies are executed and attacked against a real Postgres:

```
node tests/test-rls.js
```

It starts a throwaway cluster, applies `supabase/schema.sql` verbatim — twice,
because the file claims to be idempotent — and then tries to break it as an
anonymous request, a viewer, a contributor, an editor, a delegated admin and a
stranger. 42 checks, every one of them an attack that must fail.

It **skips loudly** when Postgres is not installed rather than passing quietly.
A security suite that goes silent is worse than one that is absent.

The suite covers, among others:

- an anonymous request seeing nothing (it is refused by table grants before RLS
  is even consulted),
- a viewer's every attempt to write,
- a contributor editing a row that is not theirs, and reassigning one to
  themselves to get around that,
- a member writing into a project they do not belong to, by naming its id,
- moving a row into another project,
- every one of the three delegation fences above.

## Sign-in

A one-time link emailed to your address. No password is stored anywhere, here
or on the server. The link signs in whoever opens it, so treat an unused link
like a password.

`Sign out and erase this device` clears every `projectPlanner*` key from this
browser. Anything that reached the server returns when you sign in again;
anything that never synced is gone. It is the right button on a shared machine.

## Reporting something

If you find a way past any of the **Real** rows above, that is a genuine
vulnerability and worth raising. If you find a way to unhide a page you were
not assigned, that is expected — see the table.
