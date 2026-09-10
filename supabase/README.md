# Sync setup

Project Planner works with no server at all. Everything below is optional, and
turning it on never takes the offline behaviour away — localStorage stays the
thing the app reads and writes, and sync reconciles it in the background.

Turn this on when you want the same projects on more than one device, or when
teammates need to update their own tasks.

## 1. Create a project

Sign up at [supabase.com](https://supabase.com) and create a project. The free
tier is enough: this app stores a few KB per project.

## 2. Run the schema

Open **SQL Editor → New query**, paste all of [`schema.sql`](./schema.sql), and
run it. It creates four tables, the row level security policies that enforce
who can read and write what, and a trigger that mirrors new signups into
`profiles`. Re-running it later is safe.

## 3. Connect the app

In Project Planner, open **Sync & Team** in the sidebar and paste:

- **Project URL** — Project Settings → API → Project URL
- **Anon public key** — Project Settings → API → `anon` `public`

Both are stored in your browser only; neither is ever committed to this
repository. The anon key is designed to be published — row level security is
what protects the data, which is why step 2 matters.

## 4. Sign in

Enter your email and open the link that arrives. Repeat on every device you
want in sync. There is no password to choose or store.

Supabase sends magic links to the address you signed up with until you
configure SMTP (Project Settings → Auth → SMTP), and the app's URL has to be
listed under **Authentication → URL Configuration → Redirect URLs** for the
link to come back to it.

## How merging works

Each project is stored as one row of scalar fields plus one row per task,
milestone, note and RAID entry. Rows sync individually, so two people editing
different tasks in the same project don't overwrite each other.

When the *same* row is edited in two places, the more recent edit wins. Deletes
are tombstones — a row that simply vanished is indistinguishable from one a
device hasn't received yet, and would otherwise come back on the next sync.

Every device keeps a baseline of what it last agreed with the server, which is
what lets it tell "I deleted this" apart from "I haven't seen this yet". You
can reset it by disconnecting and reconnecting; nothing local is lost.

## Inviting people

**Sync & Team → People on this project**, visible to the project's owner.

Enter an email and pick a role. If that person already has an account they get
access immediately. If they don't, the invitation waits: signing in with that
address for the first time converts it into membership. That conversion is a
database trigger, so it works whether or not anyone has the app open.

| Role | Can do |
|---|---|
| `viewer` | Read only |
| `contributor` | Reads everything; changes only tasks assigned to them |
| `editor` | Reads and changes everything; cannot delete the project or manage people |
| `owner` | Everything, including membership |

The project's creator is the owner implicitly — there is no `project_members`
row for them, which is why the schema spells out owner visibility separately.

Ownership cannot be transferred from the UI. It is a `projects.owner_id`
update, deliberately left out of the dropdown.

## Assigning tasks to people

Once a project has members, the Planner's Assignee column becomes a picker of
real accounts instead of a text box. Choosing someone stores two things: the
account id, which is what the `contributor` policy compares against
`auth.uid()`, and the readable name, so the value still shows correctly
offline, in an export, and for anyone who never turns sync on.

A name typed before the project was shared, or someone since removed, keeps
displaying as "(not a member)" rather than being silently dropped.

## If something goes wrong

Sync failures never touch local data — the merge is only applied after a pull
succeeds, and the Sync & Team page shows the error. Your projects are still in
the browser, and **Export / Share → Download Backup** still works offline.
