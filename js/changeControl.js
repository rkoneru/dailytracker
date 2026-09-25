// Change control and scope control: the rules, with no DOM.
//
// Two things live here because they are one idea seen from either end. A
// change request is how scope is allowed to move; the scope baseline is what
// it is moving from. Scope creep is simply the difference between the two:
// whatever has changed since the baseline that no approved change covers.
//
// A change request moves through the stages PMBOK calls integrated change
// control — raised, impact assessed, decided, implemented — and only through
// the buttons on its panel. The status is never typed: it is the result of
// the steps taken and the approvals signed. An approval whose signature no
// longer matches the request (someone edited the cost after it was signed)
// counts as not given, so editing an approved change quietly un-approves it
// rather than quietly keeping an approval nobody gave for the new numbers.
//
// None of this is enforced by the server. It is the app keeping an honest
// record; SECURITY.md says so and so does the panel.

import { fingerprint, signatureState } from './signatureModel.js';

export const CR_STATUSES = ['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Deferred', 'Implemented', 'Withdrawn'];

/** Approved-and-done still counts as approved wherever money and days are totalled. */
export function isApprovedChange(cr) {
  return cr?.status === 'Approved' || cr?.status === 'Implemented';
}

/** Statuses a decision has been reached in, for cycle time and approval rate. */
export function isDecidedChange(cr) {
  return isApprovedChange(cr) || cr?.status === 'Rejected';
}

// ---------- The request itself ----------

/** Exactly what an approver agrees to. Editing any of it voids their signature. */
export function crContent(cr) {
  return {
    title: String(cr.title || ''),
    reason: String(cr.reason || ''),
    touches: String(cr.touches || ''),
    scopeImpact: String(cr.scopeImpact || ''),
    scheduleImpact: numberOrBlank(cr.scheduleImpact),
    costImpact: numberOrBlank(cr.costImpact),
  };
}

function numberOrBlank(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
}

/** What is missing before this can be assessed: every gap, not just the first. */
export function assessmentGaps(cr) {
  const gaps = [];
  if (!String(cr.title || '').trim()) gaps.push('a title');
  if (!String(cr.raisedBy || '').trim()) gaps.push('who raised it');
  if (!String(cr.scopeImpact || '').trim()) gaps.push('the scope impact');
  if (numberOrBlank(cr.scheduleImpact) === '') gaps.push('the schedule impact in days (0 if none)');
  if (numberOrBlank(cr.costImpact) === '') gaps.push('the cost impact (0 if none)');
  return gaps;
}

// ---------- Who has to approve ----------

export const DEFAULT_ROUTE = {
  manager: '',
  sponsor: '',
  board: 'Change board',
  sponsorCost: 5000,
  sponsorDays: 5,
  boardCost: 25000,
  boardDays: 20,
};

/** The project's route with its defaults filled in, and the names it falls back to. */
export function routeOf(project) {
  const route = { ...DEFAULT_ROUTE, ...(project.changeRoute || {}) };
  const pm = (project.allocations || []).find((a) => a.keyRole === 'project-manager');
  return {
    ...route,
    manager: route.manager || pm?.name || '',
    sponsor: route.sponsor || String(project.charterSponsor || '').split(',')[0].trim(),
  };
}

/**
 * The approvers a change needs, by size. Every change goes past the project
 * manager; the sponsor joins at their threshold; the change board at its.
 * Either threshold is met by cost or by days, whichever is crossed first —
 * a free change that moves go-live by a month is not a small change.
 */
export function approversFor(cr, project) {
  const route = routeOf(project);
  const cost = Math.abs(Number(cr.costImpact) || 0);
  const days = Math.abs(Number(cr.scheduleImpact) || 0);
  const list = [{ role: 'Project manager', name: route.manager }];
  if (cost >= route.sponsorCost || days >= route.sponsorDays) list.push({ role: 'Sponsor', name: route.sponsor });
  if (cost >= route.boardCost || days >= route.boardDays) list.push({ role: 'Change board', name: route.board });
  return list;
}

// ---------- Decisions ----------

/** An approval's decision as it stands now: a stale signature is no decision. */
export function effectiveDecision(approval, cr) {
  if (!approval.signature) return 'Pending';
  return signatureState(approval.signature, crContent(cr)) === 'signed' ? approval.decision : 'Pending';
}

/**
 * Where a request under review has got to. Any rejection rejects it, since a
 * change one required approver refuses cannot go ahead; a deferral parks it;
 * only when every approver has approved is it approved.
 */
export function decisionOf(cr) {
  const approvals = cr.approvals || [];
  if (!approvals.length) return 'Pending';
  const decisions = approvals.map((a) => effectiveDecision(a, cr));
  if (decisions.includes('Rejected')) return 'Rejected';
  if (decisions.includes('Deferred')) return 'Deferred';
  if (decisions.every((d) => d === 'Approved')) return 'Approved';
  return 'Pending';
}

/**
 * The status a request should show, from its stage and its signatures.
 * Called after every edit, so an approved request whose cost is then changed
 * drops back to Under Review on the spot.
 */
export function derivedStatus(cr) {
  const stage = cr.stage || legacyStage(cr);
  if (stage === 'draft') return 'Draft';
  if (stage === 'submitted') return 'Submitted';
  if (stage === 'withdrawn') return 'Withdrawn';
  // Implemented is history: an edit afterwards shows on the panel as a stale
  // signature, but it cannot un-implement what was done.
  if (stage === 'implemented') return 'Implemented';
  if (stage === 'review') {
    const d = decisionOf(cr);
    return d === 'Pending' ? 'Under Review' : d;
  }
  return cr.status || 'Draft';
}

/**
 * Requests written before the workflow existed carry only a status. They keep
 * it, and are shown as decided by hand rather than signed — the app does not
 * invent approvals for them.
 */
export function legacyStage(cr) {
  return ({
    Draft: 'draft', Submitted: 'submitted', 'Under Review': 'legacy', Approved: 'legacy',
    Rejected: 'legacy', Deferred: 'legacy', Implemented: 'legacy', Withdrawn: 'withdrawn',
  })[cr.status] || 'draft';
}

/** Recomputes every request's status in place. Returns how many changed. */
export function reconcileChangeRequests(project) {
  let changed = 0;
  (project.changeRequests || []).forEach((cr) => {
    if (!cr.stage || cr.stage === 'legacy') return;
    const next = derivedStatus(cr);
    if (next !== cr.status) {
      cr.status = next;
      changed += 1;
    }
    syncDecidedFields(cr);
  });
  return changed;
}

/** The old "decided by / decided" columns, kept filled from the signatures. */
function syncDecidedFields(cr) {
  const decision = decisionOf(cr);
  if (decision === 'Pending') {
    cr.decidedBy = '';
    cr.decided = '';
    return;
  }
  const signed = (cr.approvals || []).filter((a) => a.signature && effectiveDecision(a, cr) !== 'Pending');
  cr.decidedBy = signed.map((a) => a.signature.name).join(', ');
  const last = signed.map((a) => a.signature.at).sort().pop();
  cr.decided = last ? localDay(new Date(last)) : '';
}

function localDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------- Transitions ----------
//
// Each returns an error string, or null having changed the request. The panel
// calls these; nothing else moves a request between stages.

function log(cr, by, action, note = '') {
  cr.history = cr.history || [];
  cr.history.push({ at: new Date().toISOString(), by: String(by || '').trim(), action, note });
}

export function submitChange(cr, by) {
  if (!String(cr.title || '').trim()) return 'Give the change a title first.';
  if (!String(cr.raisedBy || '').trim()) cr.raisedBy = String(by || '').trim();
  if (!cr.raisedBy) return 'Say who raised it first, in the Raised by column.';
  if (!cr.raised) cr.raised = localDay(new Date());
  cr.stage = 'submitted';
  log(cr, by, 'Submitted');
  cr.status = derivedStatus(cr);
  return null;
}

export function assessChange(cr, project, by) {
  const gaps = assessmentGaps(cr);
  if (gaps.length) return `Before it can be assessed it needs ${gaps.join(', ')}.`;
  cr.approvals = approversFor(cr, project).map((a, i) => ({ id: `ap${i + 1}`, ...a, decision: 'Pending', signature: null }));
  cr.stage = 'review';
  log(cr, by, 'Impact assessed', `Routed to ${cr.approvals.map((a) => a.name ? `${a.role} (${a.name})` : a.role).join(', ')}`);
  cr.status = derivedStatus(cr);
  syncDecidedFields(cr);
  return null;
}

export function recordDecision(cr, approvalId, decision, signature) {
  if (cr.stage !== 'review') return 'This change is not waiting for a decision.';
  const approval = (cr.approvals || []).find((a) => a.id === approvalId);
  if (!approval) return 'No such approver on this change.';
  if (!['Approved', 'Rejected', 'Deferred'].includes(decision)) return 'Unknown decision.';
  if (!signature || signatureState(signature, crContent(cr)) !== 'signed') return 'The decision has to be signed against the change as it stands.';
  approval.decision = decision;
  approval.signature = signature;
  log(cr, signature.name, `${decision} as ${approval.role}`, signature.comment);
  cr.status = derivedStatus(cr);
  syncDecidedFields(cr);
  return null;
}

export function addApprover(cr, role, name, by) {
  if (cr.stage !== 'review') return 'Approvers are added once the impact is assessed.';
  const id = `ap${(cr.approvals || []).length + 1}-${Date.now().toString(36)}`;
  cr.approvals.push({ id, role: String(role || 'Approver'), name: String(name || '').trim(), decision: 'Pending', signature: null });
  log(cr, by, 'Approver added', `${role}${name ? ` (${name})` : ''}`);
  cr.status = derivedStatus(cr);
  return null;
}

export function reopenChange(cr, by) {
  if (cr.status !== 'Deferred') return 'Only a deferred change can be reopened.';
  (cr.approvals || []).forEach((a) => { a.decision = 'Pending'; a.signature = null; });
  log(cr, by, 'Reopened');
  cr.status = derivedStatus(cr);
  syncDecidedFields(cr);
  return null;
}

export function withdrawChange(cr, by, note = '') {
  if (['Approved', 'Rejected', 'Implemented', 'Withdrawn'].includes(cr.status)) return 'A decided change cannot be withdrawn.';
  cr.stage = 'withdrawn';
  log(cr, by, 'Withdrawn', note);
  cr.status = derivedStatus(cr);
  return null;
}

export function markImplemented(cr, by) {
  if (cr.status !== 'Approved') return 'Only an approved change can be implemented.';
  cr.stage = 'implemented';
  cr.implemented = localDay(new Date());
  log(cr, by, 'Implemented');
  cr.status = derivedStatus(cr);
  return null;
}

// ---------- Scope baseline ----------

/** The part of a project that "scope" means: what the charter says, and what is handed over. */
export function scopeContent(project) {
  return {
    scopeIn: String(project.charterScopeIn || ''),
    scopeOut: String(project.charterScopeOut || ''),
    success: String(project.charterSuccess || ''),
    deliverables: (project.deliverables || []).map((d) => ({
      id: d.id, name: String(d.name || ''), acceptance: String(d.acceptance || ''),
    })),
  };
}

/**
 * Freezes a scope. With no `content`, the scope as it stands — which absorbs
 * every difference, so doing that after the first time needs a reason and is
 * counted as a re-baseline without a change. `crId` names the change that
 * justified it when there was one.
 */
export function takeBaseline(project, { by, reason = '', crId = '', signature = null, content = scopeContent(project) }) {
  const previous = project.scopeBaseline;
  const version = previous ? (previous.version || 1) + 1 : 1;
  project.scopeBaseline = {
    version, at: new Date().toISOString(), by: String(by || '').trim(), reason, crId, content, signature,
  };
  project.scopeHistory = project.scopeHistory || [];
  project.scopeHistory.push({
    version,
    at: project.scopeBaseline.at,
    by: project.scopeBaseline.by,
    reason,
    crId,
    deliverables: content.deliverables.length,
    hash: fingerprint(content),
  });
  return project.scopeBaseline;
}

/**
 * Moves the baseline by exactly what one approved change covers, and nothing
 * else. Re-baselining the whole scope when a change lands would quietly
 * absorb every unrelated edit made since, which is scope creep laundered
 * through somebody else's approval.
 */
export function baselineAfter(project, cr) {
  const base = project.scopeBaseline;
  if (!base || !cr.touches) return null;
  const now = scopeContent(project);
  const next = { ...base.content, deliverables: base.content.deliverables.map((d) => ({ ...d })) };
  if (cr.touches === 'charter') {
    Object.keys(CHARTER_LABELS).forEach((key) => { next[key] = now[key]; });
  } else {
    const current = now.deliverables.find((d) => d.id === cr.touches);
    const at = next.deliverables.findIndex((d) => d.id === cr.touches);
    if (current && at >= 0) next.deliverables[at] = { ...current };
    else if (current) next.deliverables.push({ ...current });
    else if (at >= 0) next.deliverables.splice(at, 1);
  }
  return next;
}

const CHARTER_LABELS = { scopeIn: 'In scope', scopeOut: 'Out of scope', success: 'Success criteria' };

/**
 * Every way the scope differs from its baseline, each with the change request
 * that covers it if there is one. "Covers" means approved (and not yet
 * implemented, which would have re-baselined it) and naming what it touches:
 * a deliverable by id, or the charter.
 */
export function scopeDrift(project) {
  const base = project.scopeBaseline;
  if (!base) return null;
  const now = scopeContent(project);
  const items = [];
  Object.keys(CHARTER_LABELS).forEach((key) => {
    if (now[key] !== base.content[key]) {
      items.push({ kind: 'charter', key, touches: 'charter', label: `Charter — ${CHARTER_LABELS[key].toLowerCase()} edited`, was: base.content[key], now: now[key] });
    }
  });
  const before = new Map(base.content.deliverables.map((d) => [d.id, d]));
  const after = new Map(now.deliverables.map((d) => [d.id, d]));
  now.deliverables.forEach((d) => {
    const was = before.get(d.id);
    if (!was) {
      items.push({ kind: 'added', touches: d.id, label: `Deliverable added — ${d.name || 'untitled'}`, was: '', now: d.name });
    } else if (was.name !== d.name || was.acceptance !== d.acceptance) {
      const what = was.name !== d.name ? 'renamed' : 'acceptance criteria changed';
      items.push({ kind: 'changed', touches: d.id, label: `Deliverable ${what} — ${d.name || 'untitled'}`, was: was.name !== d.name ? was.name : was.acceptance, now: was.name !== d.name ? d.name : d.acceptance });
    }
  });
  base.content.deliverables.forEach((d) => {
    if (!after.has(d.id)) items.push({ kind: 'removed', touches: d.id, label: `Deliverable removed — ${d.name || 'untitled'}`, was: d.name, now: '' });
  });

  const approved = (project.changeRequests || []).filter((c) => c.status === 'Approved');
  items.forEach((item) => {
    item.coveredBy = approved.find((c) => c.touches === item.touches) || null;
  });
  return {
    items,
    unapproved: items.filter((i) => !i.coveredBy),
    covered: items.filter((i) => i.coveredBy),
  };
}

/**
 * How far scope has moved over the project's life, from the first baseline:
 * the numbers a scope-creep conversation actually needs.
 */
export function scopeGrowth(project) {
  const history = project.scopeHistory || [];
  if (!history.length) return null;
  const approved = (project.changeRequests || []).filter(isApprovedChange);
  return {
    baselines: history.length,
    firstDeliverables: history[0].deliverables,
    nowDeliverables: (project.deliverables || []).length,
    withoutChange: history.slice(1).filter((h) => !h.crId).length,
    approvedChanges: approved.length,
    approvedDays: approved.reduce((n, c) => n + (Number(c.scheduleImpact) || 0), 0),
    approvedCost: approved.reduce((n, c) => n + (Number(c.costImpact) || 0), 0),
  };
}

// ---------- Deliverable sign-off ----------

/** What accepting a deliverable agrees to: its name and its acceptance criteria. */
export function deliverableContent(d) {
  return { id: d.id, name: String(d.name || ''), acceptance: String(d.acceptance || '') };
}

/**
 * A signed acceptance stops counting the moment the deliverable it accepted
 * changes: the status drops back to In Review rather than go on claiming an
 * acceptance nobody gave for the new words. One way only — putting the words
 * back does not re-accept it; signing again does.
 */
export function reconcileDeliverables(project) {
  let changed = 0;
  (project.deliverables || []).forEach((d) => {
    if (!d.signature) return;
    if (signatureState(d.signature, deliverableContent(d)) === 'changed' && d.status === d.signature.decision) {
      d.status = 'In Review';
      changed += 1;
    }
  });
  return changed;
}

/**
 * 'signed' | 'changed' | 'unsigned' (a decision with no signature: typed by
 * hand, or set from the status list) | 'none' (nothing decided yet).
 */
export function signOffState(d) {
  if (d.signature) return signatureState(d.signature, deliverableContent(d));
  if (d.status === 'Accepted' || d.status === 'Rejected' || d.signedOffBy) return 'unsigned';
  return 'none';
}
