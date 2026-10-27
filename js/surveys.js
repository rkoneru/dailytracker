// Satisfaction surveys on closed incidents: sending one, and bringing the
// answers back.
//
// Signed in to a workspace, a survey is a link. The token in it is random and
// only its hash goes to the database (incident_surveys), so the link cannot be
// rebuilt from anything stored; it is shown once, in the email, and nowhere in
// the project, where every member could read it and answer for the customer.
// The customer answers on survey.html through one database function, and the
// answer comes back here the next time the service page is opened or a sync
// runs. It lands on the incident: the survey table is the inbox, the incident
// is the record.
//
// Signed out, or in a workspace whose schema predates surveys, there is
// nowhere for an answer to go, so the email asks for a reply instead and the
// score is recorded by hand. Either way the page says which it was, and says
// that a survey link is a bearer token: it proves the link was used, not who
// used it.

import * as api from './supabase.js';
import { isSignedIn, isDemo } from './identity.js';

const SURVEY_TTL_DAYS = 30;

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** 256 random bits, as 64 hex characters. */
export function newToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return hex(new Uint8Array(digest));
}

/** Whether a survey can be a link: a real workspace session, not a demo. */
export function canSendLinks() {
  return api.isConfigured() && isSignedIn() && !isDemo();
}

/** The survey page, next to the app wherever it is served from. */
export function surveyLink({ token, subject, config = api.getConfig(), base = location.href }) {
  const page = new URL('survey.html', base);
  const params = new URLSearchParams({ t: token, u: config.url, k: config.anonKey, s: subject || '' });
  page.hash = params.toString();
  return page.toString();
}

/**
 * Creates the request and returns the email to send. `via` is 'link' when the
 * request is in the database, 'reply' when it could not be (and `reason` says
 * why), so the caller never records a link survey that does not exist.
 */
export async function prepareSurvey(projectId, incident, { to = '' } = {}) {
  const subject = incident.title || 'your recent support request';
  if (canSendLinks()) {
    try {
      const token = newToken();
      const expires = new Date(Date.now() + SURVEY_TTL_DAYS * 86400000);
      await api.insert('incident_surveys', [{
        id: crypto.randomUUID(), project_id: projectId, incident_id: incident.id,
        token_hash: await sha256Hex(token), expires_at: expires.toISOString(),
      }]);
      const link = surveyLink({ token, subject });
      return { via: 'link', link, email: emailFor({ to, subject, link }) };
    } catch (err) {
      const reason = err.status === 404
        ? 'This workspace’s database has no survey table yet: re-run supabase/schema.sql.'
        : `The survey could not be created (${err.message}).`;
      return { via: 'reply', reason, email: emailFor({ to, subject }) };
    }
  }
  return { via: 'reply', reason: 'Not signed in to a workspace, so there is nowhere online for an answer to go.', email: emailFor({ to, subject }) };
}

function emailFor({ to, subject, link = '' }) {
  const body = link
    ? `Hello,\n\nWe have closed "${subject}". How did we do?\n\nOne click to answer, from 1 (poor) to 5 (excellent):\n${link}\n\nThe link works once and expires in ${SURVEY_TTL_DAYS} days.\n\nThank you.`
    : `Hello,\n\nWe have closed "${subject}". How did we do?\n\nPlease reply with a number from 1 (poor) to 5 (excellent), and anything you would like us to know.\n\nThank you.`;
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`How did we do? ${subject}`)}&body=${encodeURIComponent(body)}`;
  return { to, subject: `How did we do? ${subject}`, body, href };
}

/**
 * Pulls answered surveys for a project and writes each onto its incident.
 * Returns how many incidents changed. Any failure leaves the incidents alone.
 */
export async function pullAnswers(project) {
  if (!canSendLinks() || !project?.id) return 0;
  let rows;
  try {
    rows = await api.select('incident_surveys', `project_id=eq.${project.id}&answered_at=not.is.null&select=incident_id,score,comment,answered_at`);
  } catch {
    return 0;
  }
  let changed = 0;
  (rows || []).forEach((r) => {
    if (!r.answered_at || !(r.score >= 1 && r.score <= 5)) return;
    const incident = (project.incidents || []).find((i) => i.id === r.incident_id);
    if (!incident || incident.csatAt === r.answered_at) return;
    Object.assign(incident, { csat: r.score, csatComment: r.comment || '', csatAt: r.answered_at });
    changed += 1;
  });
  return changed;
}
