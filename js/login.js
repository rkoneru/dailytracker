// The sign-in screen.
//
// Two ways in, and they are not the same kind of thing, so the screen keeps
// them visibly apart rather than blending them into one list of buttons:
//
//   DEMO ACCOUNTS  Five invented people, on this device, no password. They
//                  change what the app shows you and nothing else. This is a
//                  costume rail, and the screen says so in as many words.
//
//   YOUR WORKSPACE A one-time link to a real address, against a real Supabase
//                  project, after which the server decides what you may read
//                  and write.
//
// The screen is not a gate by default, which is a deliberate decision and not
// an oversight. This app works with no account at all, offline, forever; that
// is one of the things it is for. A login wall on first run would take that
// away from everybody in order to protect nothing, because on a device with no
// workspace there is nothing to protect and nothing to check a password
// against. So "Continue without an account" sits in the open.
//
// It becomes a gate when a workspace administrator turns on "Require sign-in",
// and even then the honest description is a door, not a lock: it stops the app
// opening to somebody who has not said who they are, and it stops nothing else.
// Anyone who wants past it can clear a localStorage key. What that person still
// cannot do is read or write a row the server will not give them, which is
// where the actual boundary has been all along.

import { el } from './dom.js';
import * as api from './supabase.js';
import {
  DEMO_ACCOUNTS, activeDemo, signInDemo, signOutDemo, resetDemo, demoPolicy,
} from './demoAccounts.js';
import { ROLES as JOB_ROLES } from './roles.js';
import { ROLE_LABELS } from './members.js';
import { getIdentity, isDemo, onIdentityChange } from './identity.js';
import { getPolicy, onPolicyChange } from './policy.js';

const SKIP_KEY = 'projectPlannerNoAccount_v1';

let onChange = null;
let forced = false;

// ---------- "I don't want an account" ----------

function saidNoAccount() {
  try { return localStorage.getItem(SKIP_KEY) === 'true'; } catch (err) { return false; }
}

function rememberNoAccount(value) {
  try {
    if (value) localStorage.setItem(SKIP_KEY, 'true');
    else localStorage.removeItem(SKIP_KEY);
  } catch (err) {
    console.warn('Could not remember that you are working without an account.', err);
  }
}

// ---------- the account cards ----------

function initial(name) {
  return String(name || '·').trim().charAt(0).toUpperCase() || '·';
}

function jobLabel(id) {
  const role = JOB_ROLES.find((r) => r.id === id);
  return role ? role.label : id;
}

function card(account) {
  const admin = account.canAdmin || account.accessRole === 'owner';
  return el('button', {
    type: 'button',
    class: `login-account${admin ? ' is-admin' : ''}`,
    'data-demo': account.id,
  }, [
    el('span', { class: 'login-account__avatar', 'aria-hidden': 'true', text: initial(account.name) }),
    el('span', { class: 'login-account__body' }, [
      el('span', { class: 'login-account__top' }, [
        el('span', { class: 'login-account__name', text: account.name }),
        el('span', { class: 'login-account__title', text: account.title }),
      ]),
      el('span', { class: 'login-account__chips' }, [
        el('span', {
          class: `chip chip--access is-${account.accessRole}`,
          text: ROLE_LABELS[account.accessRole] || account.accessRole,
        }),
        el('span', { class: 'chip', text: jobLabel(account.jobRole) }),
        admin ? el('span', { class: 'chip chip--admin', text: 'Can administer' }) : null,
      ]),
      el('span', { class: 'login-account__blurb', text: account.blurb }),
    ]),
  ]);
}

function renderAccounts() {
  const host = document.getElementById('login-accounts');
  if (!host) return;
  const current = activeDemo();
  host.innerHTML = '';
  DEMO_ACCOUNTS.forEach((account) => {
    const node = card(account);
    if (current && current.id === account.id) {
      node.classList.add('is-current');
      node.appendChild(el('span', { class: 'login-account__flag', text: 'Signed in' }));
    }
    host.appendChild(node);
  });
}

/** The person a demo is dressed as, for the places that show a name not an email. */
export function activeDemoName() {
  const account = activeDemo();
  return account ? account.name : '';
}

// ---------- the banner that will not go away ----------

export function renderDemoBanner() {
  const banner = document.getElementById('demo-banner');
  if (!banner) return;
  const on = isDemo();
  banner.hidden = !on;
  if (!on) return;
  const identity = getIdentity();
  const account = activeDemo();
  const who = account ? `${account.name} · ${account.title}` : identity.user.email;
  document.getElementById('demo-banner-text').textContent =
    `Demo account: ${who}. Nothing here is enforced — every account is on this device, `
    + 'and your own projects are unaffected.';
}

// ---------- opening and closing ----------

export function isLoginOpen() {
  const screen = document.getElementById('login-screen');
  return !!screen && !screen.hidden;
}

export function openLogin({ required = false } = {}) {
  const screen = document.getElementById('login-screen');
  if (!screen) return;
  forced = !!required;
  renderAccounts();
  document.getElementById('login-unconfigured').hidden = api.isConfigured();
  document.getElementById('btn-login-link').disabled = !api.isConfigured();
  document.getElementById('login-note').textContent = '';
  document.getElementById('btn-login-skip').hidden = forced;
  document.getElementById('login-forced-note').hidden = !forced;
  screen.hidden = false;
  document.body.classList.add('login-open');
  // Focus lands on the first account rather than the email field: the demo is
  // what most people opening this screen are here for.
  screen.querySelector('.login-account')?.focus();
}

export function closeLogin() {
  const screen = document.getElementById('login-screen');
  if (!screen) return;
  screen.hidden = true;
  document.body.classList.remove('login-open');
}

/**
 * Whether the app should open onto this screen.
 *
 * Three cases, and none of them is "always": a policy that asks for it, a
 * device that has signed in before and then signed out (where dropping
 * silently into a signed-out app would be confusing), and nothing else. A
 * first run on a fresh device goes straight into the app, because that is the
 * promise the app makes.
 */
export function shouldOpenOnBoot() {
  if (isDemo() || api.getUser()) return false;
  if (requireSignInInForce()) return true;
  if (saidNoAccount()) return false;
  try { return localStorage.getItem('projectPlannerIdentity_v1') !== null; } catch (err) { return false; }
}

/**
 * Whether anybody has asked for a sign-in here.
 *
 * The cached policy answers for a real workspace. A demo workspace has to be
 * asked separately, because signing out of an account inside it is not the same
 * as leaving it — the requirement belonged to the workspace, and clearing the
 * policy cache on sign-out would otherwise make the setting look broken the
 * first time somebody tried it.
 */
function requireSignInInForce() {
  return !!getPolicy().requireSignIn || !!demoPolicy().requireSignIn;
}

/** True when the policy says the screen may not be dismissed. */
export function signInRequired() {
  return requireSignInInForce() && !isDemo() && !api.getUser();
}

// ---------- wiring ----------

async function announce() {
  renderDemoBanner();
  if (onChange) await onChange();
}

export function initLogin({ onChange: handler } = {}) {
  onChange = handler || null;

  document.getElementById('login-accounts').addEventListener('click', async (e) => {
    const button = e.target.closest('[data-demo]');
    if (!button) return;
    if (!signInDemo(button.dataset.demo)) return;
    // Choosing an account is itself a decision about accounts, so the "I am
    // working without one" note is no longer true and is dropped.
    rememberNoAccount(false);
    closeLogin();
    await announce();
  });

  document.getElementById('btn-login-link').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const note = document.getElementById('login-note');
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

  document.getElementById('btn-login-skip').addEventListener('click', () => {
    rememberNoAccount(true);
    closeLogin();
  });

  document.getElementById('btn-demo-switch').addEventListener('click', () => openLogin());

  document.getElementById('btn-demo-leave').addEventListener('click', async () => {
    signOutDemo();
    resetDemo();
    rememberNoAccount(true);
    await announce();
  });

  document.getElementById('btn-open-login').addEventListener('click', () => openLogin());

  document.getElementById('login-screen').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !forced) {
      rememberNoAccount(true);
      closeLogin();
    }
  });

  onIdentityChange(() => renderDemoBanner());
  // A policy arriving mid-session that asks for sign-in is acted on then, not
  // at the next reload — otherwise turning it on appears to do nothing.
  onPolicyChange(() => { if (signInRequired() && !isLoginOpen()) openLogin({ required: true }); });
  renderDemoBanner();
}
