import { el } from './dom.js';
import * as api from './supabase.js';
import { toast, confirmAction } from './dialog.js';
import {
  getIdentity, isSignedIn, canAdminister, describeIdentity, refreshIdentity,
  listMembership, assignMember, savePolicy, readPolicyFor, signOut, onIdentityChange,
} from './identity.js';
import { ROLES as JOB_ROLES } from './roles.js';
import { ROLE_LABELS, ASSIGNABLE_ROLES } from './members.js';
import { navLabels, defaultPolicy, isManaged, getPolicy } from './policy.js';
import { STEPS, methodsForStep, defaultWorkflow } from './playbook.js';
import { openPanel } from './nav.js';
import { getActiveProjectId, listProjects, buildBackup } from './state.js';
import { exportBackupJSON } from './export.js';

// The Settings page: the account, the workspace, and the admin screens.
//
// The section at the bottom — "What is actually enforced" — is the one that
// took the most care to write, and it is the reason this page exists in the
// shape it does. An app that hides pages and calls it security teaches people
// something false about their own data. So the page says, in plain words and
// on screen rather than in a comment, which of these things Postgres refuses
// and which are only the app being tidy.

let members = [];
let draftPolicy = null;
let draftRequireSignIn = false;
let draftWorkflow = null;

// ---------- account ----------

function initial(email) {
  return String(email || '·').trim().charAt(0).toUpperCase() || '·';
}

function renderAccount() {
  const identity = getIdentity();
  const signedIn = isSignedIn();

  document.getElementById('signin-block').hidden = signedIn;
  document.getElementById('signed-in-block').hidden = !signedIn;
  document.getElementById('signin-unconfigured').hidden = api.isConfigured();
  document.getElementById('btn-signin').disabled = !api.isConfigured();
  document.getElementById('settings-identity').textContent = describeIdentity();

  if (signedIn) {
    document.getElementById('settings-email').textContent = identity.user.email;
    document.getElementById('settings-avatar').textContent = initial(identity.user.email);
    const bits = [];
    if (identity.isOwner) bits.push('Owner');
    else if (identity.accessRole) bits.push(ROLE_LABELS[identity.accessRole] || identity.accessRole);
    if (identity.canAdmin && !identity.isOwner) bits.push('can administer');
    if (identity.jobRole) {
      const role = JOB_ROLES.find((r) => r.id === identity.jobRole);
      bits.push(`working as ${role ? role.label : identity.jobRole}`);
    }
    document.getElementById('settings-meta').textContent = bits.join(' · ') || 'Signed in';
  }

  // The sidebar's account button mirrors this, so the state is legible from
  // anywhere rather than only on this page.
  const name = document.getElementById('account-name');
  const role = document.getElementById('account-role');
  const avatar = document.getElementById('account-avatar');
  if (name && role && avatar) {
    name.textContent = signedIn ? identity.user.email : 'Signed out';
    avatar.textContent = signedIn ? initial(identity.user.email) : '·';
    role.textContent = signedIn
      ? (identity.isOwner ? 'Owner' : ROLE_LABELS[identity.accessRole] || 'Member')
      : 'On this device';
  }
}

// ---------- workspace ----------

function tile(id, value, sub, tone = 'idle') {
  const node = document.getElementById(id);
  if (!node) return;
  node.querySelector('.kpi__value').textContent = value;
  node.querySelector('.kpi__sub').textContent = sub;
  node.classList.remove('is-good', 'is-warn', 'is-bad', 'is-idle');
  node.classList.add(`is-${tone}`);
}

function renderWorkspace() {
  const identity = getIdentity();
  const signedIn = isSignedIn();

  tile('ws-count-mode',
    signedIn ? 'Workspace' : 'This device',
    signedIn ? 'Synced, and governed by its administrator' : 'Nothing leaves this browser',
    signedIn ? 'good' : 'idle');

  tile('ws-count-access',
    signedIn ? (identity.isOwner ? 'Owner' : ROLE_LABELS[identity.accessRole] || 'Unknown') : 'Full',
    signedIn ? 'Enforced by the server' : 'It is your browser',
    signedIn && identity.accessRole === 'viewer' ? 'warn' : 'good');

  const job = identity.jobRole ? JOB_ROLES.find((r) => r.id === identity.jobRole) : null;
  tile('ws-count-job',
    job ? job.label : (signedIn ? 'Not assigned' : 'Your choice'),
    identity.jobRole ? 'Assigned by an administrator' : 'Chosen on this device',
    identity.jobRole ? 'good' : 'idle');

  tile('ws-count-people',
    signedIn ? String(members.length || 1) : String(listProjects().length),
    signedIn ? 'in this workspace' : 'projects on this device',
    'idle');

  const note = document.getElementById('workspace-note');
  if (!signedIn) {
    note.textContent = 'You are working locally. Your projects live in this browser only — '
      + 'they are not on any server, nobody else can read them, and clearing site data removes them. '
      + 'Export a backup below if that matters.';
  } else if (isManaged()) {
    note.textContent = 'An administrator decides which pages each job role is offered here. '
      + 'Your own access level is separate and is enforced by the server.';
  } else {
    note.textContent = 'This workspace has no page policy yet, so everyone sees the pages their '
      + 'job role normally uses. An administrator can change that below.';
  }
}

// ---------- people ----------

function memberRow(member) {
  const identity = getIdentity();
  const isSelf = identity.user && member.userId === identity.user.id;
  // The server refuses all three of these for your own row and for an owner's;
  // disabling them here just avoids offering a click that cannot work.
  const locked = isSelf || member.accessRole === 'owner';

  const access = el('select', { class: 'row-select', 'data-field': 'accessRole', 'aria-label': 'Access level' });
  const options = member.accessRole === 'owner' ? ['owner'] : ASSIGNABLE_ROLES;
  options.forEach((role) => access.appendChild(
    el('option', { value: role, text: ROLE_LABELS[role] || role, selected: member.accessRole === role })));
  access.disabled = locked;

  const job = el('select', { class: 'row-select', 'data-field': 'jobRole', 'aria-label': 'Job role' });
  job.appendChild(el('option', { value: '', text: '— not assigned —', selected: !member.jobRole }));
  JOB_ROLES.forEach((role) => job.appendChild(
    el('option', { value: role.id, text: role.label, selected: member.jobRole === role.id })));
  job.disabled = isSelf;

  const admin = el('input', {
    type: 'checkbox', 'data-field': 'canAdmin', checked: member.canAdmin, 'aria-label': 'May administer',
  });
  // Only an owner may create another administrator. A delegated admin who
  // could would be able to build themselves a majority.
  admin.disabled = locked || !identity.isOwner;

  return el('tr', { 'data-user': member.userId }, [
    el('td', { class: 'col-name' }, [
      el('span', { class: 'member-name', text: member.name || member.email || 'Unknown' }),
      isSelf ? el('span', { class: 'member-you', text: 'you' }) : null,
    ]),
    el('td', { class: 'col-status' }, [access]),
    el('td', { class: 'col-status' }, [job]),
    el('td', { class: 'col-check' }, [admin]),
  ]);
}

function renderPeople() {
  const admin = canAdminister();
  document.getElementById('admin-denied').hidden = admin;
  document.getElementById('admin-people').hidden = !admin;
  if (!admin) return;

  const body = document.getElementById('members-body');
  body.innerHTML = '';
  members.forEach((member) => body.appendChild(memberRow(member)));
  document.getElementById('members-empty').hidden = members.length > 1;
  const admins = members.filter((m) => m.canAdmin || m.accessRole === 'owner').length;
  document.getElementById('admin-count').textContent =
    `${members.length} ${members.length === 1 ? 'person' : 'people'} · ${admins} can administer`;
}

// ---------- page access ----------

function renderPolicyGrid() {
  const admin = canAdminister();
  document.getElementById('pages-denied').hidden = admin;
  document.getElementById('admin-pages').hidden = !admin;
  if (!admin || !draftPolicy) return;

  document.getElementById('policy-require-signin').checked = draftRequireSignIn;

  const grid = document.getElementById('policy-grid');
  grid.innerHTML = '';
  const labels = navLabels();

  JOB_ROLES.forEach((role) => {
    const allowed = new Set(draftPolicy[role.id] || []);
    const list = el('div', { class: 'policy-role' }, [
      el('div', { class: 'policy-role__head' }, [
        el('h3', { class: 'policy-role__name', text: role.label }),
        el('span', { class: 'policy-role__count', text: `${allowed.size} pages` }),
      ]),
      el('p', { class: 'policy-role__blurb', text: role.blurb }),
    ]);

    const pages = el('div', { class: 'policy-pages' });
    labels.forEach((meta, navId) => {
      const box = el('input', {
        type: 'checkbox',
        checked: allowed.has(navId),
        'data-role': role.id,
        'data-nav': navId,
        id: `policy-${role.id}-${navId}`,
      });
      pages.appendChild(el('label', { class: 'policy-page' }, [
        box,
        el('span', { class: 'policy-page__label', text: meta.label }),
      ]));
    });
    list.appendChild(pages);
    grid.appendChild(list);
  });
}

// ---------- task execution ----------

function renderWorkflow() {
  const admin = canAdminister();
  document.getElementById('workflow-denied').hidden = admin;
  document.getElementById('admin-workflow').hidden = !admin;
  if (!admin || !draftWorkflow) return;

  document.getElementById('wf-wip').value = String(draftWorkflow.wipLimit);
  document.getElementById('wf-big').value = String(draftWorkflow.dailyBig);
  document.getElementById('wf-small').value = String(draftWorkflow.dailySmall);

  const host = document.getElementById('workflow-steps');
  host.innerHTML = '';
  const enabled = new Set(draftWorkflow.steps);
  const required = new Set(draftWorkflow.required || []);

  STEPS.forEach((step) => {
    const on = enabled.has(step.id);
    const chosen = new Set(draftWorkflow.methods[step.id] || []);

    const methods = el('div', { class: 'workflow-methods' });
    methodsForStep(step.id).forEach((method) => {
      // Deliberately not `data-method`: the wizard's own method cards use
      // that, both are in the document at once, and a selector meant for one
      // quietly matching the other is the kind of collision that shows up as
      // a test clicking the wrong thing.
      const box = el('input', {
        type: 'checkbox',
        id: `wf-${step.id}-${method.id}`,
        checked: chosen.has(method.id),
        'data-wf-step': step.id,
        'data-wf-method': method.id,
      });
      methods.appendChild(el('label', { class: 'workflow-method' }, [
        box,
        el('span', { class: 'workflow-method__icon', 'aria-hidden': 'true', text: method.icon }),
        el('span', { class: 'workflow-method__text' }, [
          el('span', { class: 'workflow-method__name', text: method.name }),
          el('span', { class: 'workflow-method__trigger', text: method.trigger }),
        ]),
      ]));
    });

    host.appendChild(el('div', { class: `workflow-step${on ? '' : ' is-off'}` }, [
      el('div', { class: 'workflow-step__head' }, [
        el('label', { class: 'workflow-step__toggle' }, [
          el('input', { type: 'checkbox', checked: on, 'data-step-toggle': step.id }),
          el('span', { class: 'workflow-step__n', text: String(step.n) }),
          el('span', { class: 'workflow-step__title', text: step.title }),
        ]),
        el('label', { class: 'workflow-step__required' }, [
          el('input', {
            type: 'checkbox',
            checked: required.has(step.id),
            disabled: !on,
            'data-step-required': step.id,
          }),
          el('span', { text: 'Required' }),
        ]),
      ]),
      el('p', { class: 'workflow-step__question', text: step.question }),
      methods,
    ]));
  });
}

// ---------- what is enforced ----------

const FACTS = [
  {
    tone: 'good',
    title: 'Who can read and change your data',
    body: 'Enforced by the database, not by this app. Every read and write is checked by row '
      + 'level security in Postgres against your account. A viewer who edits this page in a '
      + 'browser console still cannot save, because the server refuses the write.',
  },
  {
    tone: 'good',
    title: 'Who can assign roles and page access',
    body: 'Enforced by the database. Only the project owner, or someone the owner has made an '
      + 'administrator, can change an assignment. An administrator cannot promote anyone to '
      + 'owner, cannot create another administrator, and cannot edit their own membership — '
      + 'those three are what stop delegation becoming a handover.',
  },
  {
    tone: 'warn',
    title: 'Which pages you are shown',
    body: 'Not a security boundary. The app hides pages your job role is not assigned, which '
      + 'keeps the sidebar honest and the app usable. Somebody determined can unhide them in a '
      + 'browser console. They still cannot read or write anything their access level forbids, '
      + 'because that is checked on the server.',
  },
  {
    tone: 'warn',
    title: 'Data in this browser',
    body: 'Projects you have not synced live in this browser’s storage, unencrypted, like every '
      + 'offline web app. Anyone with the unlocked device can read them. On a shared computer, '
      + 'sign out and erase, or do not sign in at all.',
  },
  {
    tone: 'idle',
    title: 'Sign-in',
    body: 'A one-time link sent to your address; no password is stored anywhere, here or on the '
      + 'server. The link signs in whoever opens it, so treat it like a password while it is '
      + 'unused.',
  },
];

function renderFacts() {
  const host = document.getElementById('security-facts');
  host.innerHTML = '';
  FACTS.forEach((fact) => {
    host.appendChild(el('div', { class: `security-fact is-${fact.tone}` }, [
      el('h3', { class: 'security-fact__title', text: fact.title }),
      el('p', { class: 'security-fact__body', text: fact.body }),
    ]));
  });
}

function renderStorage() {
  const note = document.getElementById('storage-note');
  let bytes = 0;
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('projectPlanner'))
      .forEach((key) => { bytes += (localStorage.getItem(key) || '').length; });
  } catch (err) {
    note.textContent = 'This browser will not report what is stored.';
    return;
  }
  const projects = listProjects().length;
  note.textContent = `${projects} project${projects === 1 ? '' : 's'} in this browser, about `
    + `${(bytes / 1024).toFixed(0)} KB. ${isSignedIn() ? 'Synced projects also exist on your server.' : 'There is no copy anywhere else.'}`;
}

// ---------- the page ----------

export function renderSettings() {
  renderAccount();
  renderWorkspace();
  renderPeople();
  renderPolicyGrid();
  renderWorkflow();
  renderFacts();
  renderStorage();
}

async function reload() {
  const projectId = getActiveProjectId();
  await refreshIdentity(projectId);
  if (canAdminister()) {
    members = await listMembership(projectId);
    const stored = await readPolicyFor(projectId);
    draftPolicy = stored.pages;
    draftRequireSignIn = stored.requireSignIn;
    draftWorkflow = stored.workflow;
  } else {
    members = [];
    draftPolicy = null;
    draftWorkflow = null;
    draftRequireSignIn = getPolicy().requireSignIn;
  }
  renderSettings();
}

export function refreshSettings() {
  return reload();
}

export function initSettings(goTo) {
  document.getElementById('btn-signin').addEventListener('click', async () => {
    const email = document.getElementById('signin-email').value.trim();
    const note = document.getElementById('signin-note');
    if (!email) { note.textContent = 'Enter the address to send the link to.'; return; }
    note.textContent = 'Sending…';
    try {
      await api.sendMagicLink(email, window.location.href.split('#')[0]);
      note.textContent = `Check ${email}. The link signs you in on this device.`;
    } catch (err) {
      console.warn('Could not send the sign-in link.', err);
      note.textContent = `Could not send it: ${err.message}`;
    }
  });

  document.getElementById('btn-signout').addEventListener('click', async () => {
    await signOut();
    await reload();
    toast('Signed out. Your projects are still on this device.');
  });

  document.getElementById('btn-signout-wipe').addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Sign out and erase this device?',
      message: 'Every project in this browser is removed. Anything that reached the server comes '
        + 'back when you sign in again; anything that never synced is gone for good.',
      confirmLabel: 'Sign out and erase',
      tone: 'danger',
    });
    if (!ok) return;
    await signOut({ wipeLocal: true });
    window.location.reload();
  });

  document.getElementById('btn-refresh-members').addEventListener('click', () => reload());

  document.getElementById('members-body').addEventListener('change', async (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    const row = e.target.closest('tr[data-user]');
    if (!row) return;
    const userId = row.dataset.user;
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    try {
      await assignMember(getActiveProjectId(), userId, { [field]: value });
      const member = members.find((m) => m.userId === userId);
      if (member) member[field] = value;
      toast('Saved.');
      renderPeople();
    } catch (err) {
      console.warn('The server refused that assignment.', err);
      // Re-reading rather than trusting the form is the point: the server is
      // the authority on what the assignment now is, and a refusal must not
      // leave the screen showing a change that did not happen.
      toast('The server refused that change.', 'error');
      await reload();
    }
  });

  document.getElementById('policy-grid').addEventListener('change', (e) => {
    const { role, nav } = e.target.dataset;
    if (!role || !nav || !draftPolicy) return;
    const list = new Set(draftPolicy[role] || []);
    if (e.target.checked) list.add(nav);
    else list.delete(nav);
    draftPolicy[role] = [...list];
    const count = e.target.closest('.policy-role').querySelector('.policy-role__count');
    if (count) count.textContent = `${list.size} pages`;
  });

  document.getElementById('policy-require-signin').addEventListener('change', (e) => {
    draftRequireSignIn = e.target.checked;
  });

  document.getElementById('btn-save-policy').addEventListener('click', async () => {
    try {
      await savePolicy(getActiveProjectId(), {
        pages: draftPolicy, requireSignIn: draftRequireSignIn, workflow: draftWorkflow,
      });
      toast('Page access saved for everyone in this workspace.');
      await reload();
    } catch (err) {
      console.warn('Could not save the policy.', err);
      toast('The server refused that change.', 'error');
    }
  });

  document.getElementById('btn-reset-policy').addEventListener('click', () => {
    draftPolicy = defaultPolicy();
    renderPolicyGrid();
    toast('Reset to the defaults — save to apply them.');
  });

  document.getElementById('workflow-steps').addEventListener('change', (e) => {
    if (!draftWorkflow) return;
    const { stepToggle, stepRequired, wfStep, wfMethod } = e.target.dataset;

    if (stepToggle) {
      const on = e.target.checked;
      const list = new Set(draftWorkflow.steps);
      if (on) list.add(stepToggle);
      else list.delete(stepToggle);
      draftWorkflow.steps = STEPS.map((s) => s.id).filter((id) => list.has(id));
      // A step that is off cannot also be required, or saving would produce a
      // workflow the wizard has to silently disagree with.
      if (!on) draftWorkflow.required = (draftWorkflow.required || []).filter((id) => id !== stepToggle);
      renderWorkflow();
      return;
    }

    if (stepRequired) {
      const list = new Set(draftWorkflow.required || []);
      if (e.target.checked) list.add(stepRequired);
      else list.delete(stepRequired);
      draftWorkflow.required = [...list];
      return;
    }

    if (wfStep && wfMethod) {
      const list = new Set(draftWorkflow.methods[wfStep] || []);
      if (e.target.checked) list.add(wfMethod);
      else list.delete(wfMethod);
      draftWorkflow.methods[wfStep] = [...list];
    }
  });

  ['wf-wip', 'wf-big', 'wf-small'].forEach((id) => {
    document.getElementById(id).addEventListener('change', (e) => {
      if (!draftWorkflow) return;
      const key = { 'wf-wip': 'wipLimit', 'wf-big': 'dailyBig', 'wf-small': 'dailySmall' }[id];
      draftWorkflow[key] = Number(e.target.value);
    });
  });

  document.getElementById('btn-save-workflow').addEventListener('click', async () => {
    try {
      await savePolicy(getActiveProjectId(), {
        pages: draftPolicy, requireSignIn: draftRequireSignIn, workflow: draftWorkflow,
      });
      toast('Execution workflow saved for this project.');
      await reload();
    } catch (err) {
      console.warn('Could not save the workflow.', err);
      toast('The server refused that change.', 'error');
    }
  });

  document.getElementById('btn-reset-workflow').addEventListener('click', () => {
    draftWorkflow = defaultWorkflow();
    renderWorkflow();
    toast('Reset to the full map — save to apply it.');
  });

  document.getElementById('btn-settings-export').addEventListener('click', () => exportBackupJSON(buildBackup()));
  document.getElementById('btn-settings-open-export').addEventListener('click', () => openPanel('export'));

  document.getElementById('btn-account').addEventListener('click', () => {
    if (goTo) goTo({ navId: 'tab-settings' });
  });

  onIdentityChange(() => renderSettings());
  renderSettings();
  // The first read happens off the boot path: it is a network call, and the
  // app must open at the same speed with or without an account.
  reload();
}
