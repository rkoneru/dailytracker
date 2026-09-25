# Security

What this app actually enforces, what it only tidies, and how to check both
yourself. The short version is that there are two different guarantees here and
they are not equally strong — so they are described separately rather than
folded into one reassuring sentence.

## The modes

**On this device.** No account. Every project lives in this browser's
`localStorage`, unencrypted, like every offline web app. Nothing is sent
anywhere. Nobody else can read it *over a network*, and anyone with the
unlocked device can read all of it. The role picker in the sidebar is a
personal view filter, because there is nobody here to protect you from.

**In a demo.** One of five invented people, picked from the sign-in screen.
Not really a third mode: it is the one above wearing a name badge. The data is
still only in this browser and the account is a costume. See below.

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
| "Everyone should sign in" | The app | **A door, not a lock.** It opens the app onto the sign-in screen with no way past; clearing a `localStorage` key is the way past. |
| Which demo account you are | Nothing at all | **Not a boundary, and not trying to be.** See below. |

The bottom three rows are the ones worth reading twice, because they are the
ones that could be mistaken for the top three. Hiding a page, asking people to
sign in, and letting somebody pick the administrator costume are all usability
decisions that keep the app honest about who is looking. None of them is what
stops someone reading data — that is the first two rows, and they hold whatever
the app does.

## Demo accounts

The sign-in screen offers five people who do not exist — an owner who
administers, a delegated administrator, two contributors and a viewer — so that
you can see how the app behaves for each without standing up a Supabase project
first. Signing in as the administrator is how you look at the admin screens.

**It secures nothing, and it is not meant to.** There is no password. Every
account is offered to everybody who opens the app. The roster lives in a
`projectPlannerDemo_v1` key in this browser, which anyone holding the device can
edit. Being the demo administrator is a claim the browser is making about itself,
which is exactly the kind of claim the rest of this document exists to
distinguish from an enforced one. The app says so on the sign-in screen, in a
banner that stays up for as long as a demo account is worn and has no dismiss
button, and in a Settings panel that withdraws every other guarantee on the page
while a demo is in force.

What the demo *does* take seriously is the shape of the rules. The delegation
fences below are re-implemented in `js/demoAccounts.js` and refuse the same three
things, so that a demo administrator cannot do something the real product
forbids. That is a teaching decision, not a security one: the refusals are there
so the demo is not misleading about the product, not because anything depends on
them holding.

Your own projects are untouched by any of it. Leaving the demo removes the key.

## The delegation fences

An administrator who is not the owner — the case this is built for, an
engagement manager running a workspace — can manage everyone else's access and
job role, and set page access. They deliberately **cannot**:

- promote anyone (including themselves) to owner,
- grant `can_admin` to anyone, so they cannot mint a second administrator,
- edit or delete their own membership row.

Without the third, delegation would be one UPDATE away from a handover. All
three are enforced by the `project_members_write` policy, not by the UI.

## Signatures and approvals

Change requests, the scope baseline and deliverable sign-off are **signed**, and
the signature is an attestation, not cryptography. It records the typed name,
the account signed in at the time (if any, and whether it was a demo), the
moment, the sentence agreed to, a fingerprint of exactly what was signed, and
optionally a drawn mark.

What that gives you:

- **Edits are caught.** Change a signed change request's cost, or a signed
  deliverable's acceptance criteria, and the fingerprint stops matching. The
  signature then counts for nothing: the change drops back to Under Review, the
  deliverable to In Review, and the screen says "changed since signed".
- **The status is never typed.** A change request's status comes from the
  workflow and the signatures; the table does not offer it as a field.
- **Scope creep is visible.** Anything that differs from the signed scope
  baseline and is not covered by an approved change is counted and named.

What it does **not** give you:

- **It is not tamper-proof.** The records live in the project data, which any
  editor can write. Someone determined can rewrite a signature and its
  fingerprint together; the fingerprint (FNV-1a) is for noticing change, not
  for resisting forgery.
- **It does not prove who signed.** Signed out, the name is only what was
  typed. On a demo account it is an invented person. On a real account it is
  whoever was using that browser. The app says which, on the dialog and on the
  signature.
- **Postgres does not enforce any of it.** Row level security decides who may
  write the project; it does not know what an approval is, so a contributor
  with write access can record an approval in the sponsor's name.

If approvals need to bind, they need a separate append-only table that only the
named approver's account can insert into. That is a schema change, not built
yet.

## Checking it yourself

The policies are executed and attacked against a real Postgres:

```
node tests/test-rls.js
```

It starts a throwaway cluster, applies `supabase/schema.sql` verbatim — twice,
because the file claims to be idempotent — and then tries to break it as an
anonymous request, a viewer, a contributor, an editor, a delegated admin and a
stranger. 46 checks, every one of them an attack that must fail.

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
