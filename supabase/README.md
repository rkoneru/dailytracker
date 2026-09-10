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

## Roles

Set these in the `project_members` table (a UI for this is not built yet):

| Role | Can do |
|---|---|
| `viewer` | Read only |
| `contributor` | Read everything; update only rows assigned to them |
| `editor` | Read and write every row; cannot delete the project or manage members |
| `owner` | Everything, including membership |

The project's creator is the owner implicitly and does not need a row here.

## If something goes wrong

Sync failures never touch local data — the merge is only applied after a pull
succeeds, and the Sync & Team page shows the error. Your projects are still in
the browser, and **Export / Share → Download Backup** still works offline.
