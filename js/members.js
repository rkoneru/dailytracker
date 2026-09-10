// Project membership: who can see a project, what they may do, and who a task
// belongs to.
//
// The database has enforced four roles since sync shipped, but nothing in the
// app could grant one — adding a teammate meant hand-editing project_members
// in the Supabase table editor, and `assignee_user_id` was written by nothing,
// so the contributor rule ("edit only the rows assigned to you") could never
// match a row. This is the half that was missing.

import * as api from './supabase.js';
import { getActiveProjectId } from './state.js';

export const ROLES = ['viewer', 'contributor', 'editor', 'owner'];

export const ROLE_LABELS = {
  owner: 'Owner',
  editor: 'Editor',
  contributor: 'Contributor',
  viewer: 'Viewer',
};

export const ROLE_HELP = {
  owner: 'Everything, including deleting the project and managing people.',
  editor: 'Read and change everything. Cannot delete the project or manage people.',
  contributor: 'Reads everything. Can only change tasks assigned to them.',
  viewer: 'Read only.',
};

// Roles that can be granted. Ownership transfer is a different operation with
// different consequences, so it is not in the dropdown.
export const ASSIGNABLE_ROLES = ['viewer', 'contributor', 'editor'];

let cache = { projectId: null, members: [], invites: [], loadedAt: 0 };
const listeners = new Set();

export function onMembersChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((fn) => fn());
}

export function getMembers() {
  return cache.members.slice();
}

export function getInvites() {
  return cache.invites.slice();
}

/** True once membership is known — the assignee picker falls back to free text until then. */
export function membersLoaded() {
  return cache.projectId === getActiveProjectId() && cache.loadedAt > 0;
}

function displayName(profile, email) {
  return (profile && profile.display_name) || (email || '').split('@')[0] || 'Unknown';
}

/**
 * Loads members, their profiles and any pending invites for the active
 * project. Everything is filtered by RLS, so a viewer sees the member list but
 * gets an empty invite list rather than an error.
 */
export async function loadMembers({ force = false } = {}) {
  const projectId = getActiveProjectId();
  if (!api.isConfigured() || !api.getUser()) {
    cache = { projectId: null, members: [], invites: [], loadedAt: 0 };
    emit();
    return cache;
  }
  if (!force && cache.projectId === projectId && cache.loadedAt > 0) return cache;

  const [rows, projectRows] = await Promise.all([
    api.select('project_members', `project_id=eq.${projectId}&select=user_id,role`),
    api.select('projects', `id=eq.${projectId}&select=owner_id`),
  ]);

  const ownerId = projectRows && projectRows[0] ? projectRows[0].owner_id : null;
  const ids = [...new Set([...(rows || []).map((r) => r.user_id), ...(ownerId ? [ownerId] : [])])];

  const profiles = ids.length > 0
    ? await api.select('profiles', `id=${api.inList(ids)}&select=id,email,display_name`)
    : [];
  const profileById = new Map((profiles || []).map((p) => [p.id, p]));

  const members = ids.map((id) => {
    const profile = profileById.get(id);
    // The owner is implicit — there is no project_members row for them.
    const role = id === ownerId ? 'owner' : ((rows || []).find((r) => r.user_id === id) || {}).role;
    return {
      userId: id,
      email: profile ? profile.email : null,
      name: displayName(profile, profile && profile.email),
      role: role || 'viewer',
      isOwner: id === ownerId,
      isSelf: id === (api.getUser() || {}).id,
    };
  }).sort((a, b) => ROLES.indexOf(b.role) - ROLES.indexOf(a.role) || a.name.localeCompare(b.name));

  let invites = [];
  try {
    invites = await api.select('project_invites', `project_id=eq.${projectId}&select=id,email,role`) || [];
  } catch (err) {
    // Only the owner may read these; anyone else gets an empty list, not a failure.
    invites = [];
  }

  cache = { projectId, members, invites, loadedAt: Date.now() };
  emit();
  return cache;
}

/** True when the signed-in user owns the active project. */
export function isOwner() {
  const me = cache.members.find((m) => m.isSelf);
  return !!(me && me.isOwner);
}

export function myRole() {
  const me = cache.members.find((m) => m.isSelf);
  return me ? me.role : null;
}

/**
 * Invites by email. If they already have an account they become a member
 * immediately; if not the invite waits, and signing up converts it — that
 * conversion is a database trigger, so it happens whether or not this app is
 * open at the time.
 */
export async function invite(email, role = 'contributor') {
  const address = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new Error('That does not look like an email address.');
  }
  const projectId = getActiveProjectId();

  const existing = await api.select('profiles', `email=eq.${encodeURIComponent(address)}&select=id`);
  if (existing && existing.length > 0) {
    const userId = existing[0].id;
    if (cache.members.some((m) => m.userId === userId)) {
      throw new Error(`${address} is already on this project.`);
    }
    await api.upsert('project_members', [{ project_id: projectId, user_id: userId, role }], 'project_id,user_id');
    await loadMembers({ force: true });
    return { status: 'added', email: address };
  }

  if (cache.invites.some((i) => i.email.toLowerCase() === address.toLowerCase())) {
    throw new Error(`${address} has already been invited.`);
  }
  await api.upsert('project_invites', [{ project_id: projectId, email: address, role }], 'project_id,email');
  await loadMembers({ force: true });
  return { status: 'invited', email: address };
}

export async function setRole(userId, role) {
  await api.upsert(
    'project_members',
    [{ project_id: getActiveProjectId(), user_id: userId, role }],
    'project_id,user_id',
  );
  await loadMembers({ force: true });
}

export async function removeMember(userId) {
  await api.remove('project_members', `project_id=eq.${getActiveProjectId()}&user_id=eq.${userId}`);
  await loadMembers({ force: true });
}

export async function cancelInvite(inviteId) {
  await api.remove('project_invites', `id=eq.${inviteId}`);
  await loadMembers({ force: true });
}

/** Resolves a stored assignee_user_id to a name for display. */
export function memberName(userId) {
  const member = cache.members.find((m) => m.userId === userId);
  return member ? member.name : null;
}
