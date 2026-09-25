// Scope control on screen: the baseline, the creep against it, the change
// request workflow that is the only sanctioned way to move it, and signed
// sign-off of deliverables.
//
// The rules are in js/changeControl.js; this draws them and turns clicks into
// calls on it. Every decision that matters is signed through
// js/signature.js, and nothing is written until the signature dialog returns
// one — Cancel leaves the project exactly as it was.
//
// A panel re-renders only from a button. Typing in a field updates the data
// and refreshes the derived text beside it, never the field itself, because
// rebuilding a form under the caret drops the keystroke in progress.

import { getState, scheduleSave, uid } from './state.js';
import { el } from './dom.js';
import { refFor, refreshDerivedCells, renderRegister } from './register.js';
import { DELIVERABLES, CHANGE_REQUESTS } from './registerDefs.js';
import { showSection } from './tabs.js';
import { toast, promptText, confirmAction } from './dialog.js';
import { getMe } from './me.js';
import { getIdentity } from './identity.js';
import { formatDate, toLocalISO } from './dates.js';
import { notifyProjectDataChanged } from './taskModel.js';
import { requestSignature, signatureView, signatureLine } from './signature.js';
import {
  crContent, routeOf, DEFAULT_ROUTE, effectiveDecision, reconcileChangeRequests,
  submitChange, assessChange, recordDecision, addApprover, reopenChange, withdrawChange, markImplemented,
  scopeContent, takeBaseline, baselineAfter, scopeDrift, scopeGrowth,
  deliverableContent, signOffState, reconcileDeliverables,
} from './changeControl.js';

let selectedId = '';
let onAnyChange = () => {};

function me() {
  return getMe() || getIdentity().user?.email || '';
}

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString()}`;
}

function crRef(cr) {
  const list = getState().changeRequests || [];
  return refFor(CHANGE_REQUESTS.refPrefix, list.indexOf(cr));
}

function deliverableRef(d) {
  const list = getState().deliverables || [];
  return refFor(DELIVERABLES.refPrefix, list.indexOf(d));
}

function touchesLabel(touches) {
  if (!touches) return 'Not said';
  if (touches === 'charter') return 'The charter’s scope statement';
  const d = (getState().deliverables || []).find((x) => x.id === touches);
  return d ? `${deliverableRef(d)} ${d.name || 'untitled'}` : 'A deliverable that has been removed';
}

/** Everything that follows from an edit: statuses, derived cells, counters, other pages. */
function committed(source) {
  const state = getState();
  reconcileChangeRequests(state);
  reconcileDeliverables(state);
  scheduleSave();
  onAnyChange();
  notifyProjectDataChanged(source);
}

// ---------- Scope baseline and creep ----------

function trimmed(text, n = 90) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '(blank)';
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function renderBaseline() {
  const host = document.getElementById('scope-baseline-body');
  if (!host) return;
  const state = getState();
  const base = state.scopeBaseline;
  const drift = scopeDrift(state);
  const growth = scopeGrowth(state);
  const parts = [];

  if (!base) {
    parts.push(el('div', { class: 'scope-status is-idle' }, [
      el('strong', { text: 'Not baselined' }),
      el('p', { class: 'hint', text: 'Until the scope is baselined there is nothing to measure creep against: every edit to the charter and the deliverables is simply the scope. Baseline it once it is agreed, and have the sponsor sign it.' }),
    ]));
  } else {
    const unapproved = drift.unapproved.length;
    parts.push(el('div', { class: `scope-status ${unapproved ? 'is-bad' : drift.items.length ? 'is-warn' : 'is-good'}` }, [
      el('strong', {
        id: 'scope-creep-verdict',
        text: unapproved ? `${unapproved} change${unapproved === 1 ? '' : 's'} to scope that nobody approved`
          : drift.items.length ? 'Every change since the baseline is covered by an approved change request'
            : 'Scope matches the baseline',
      }),
      el('p', { class: 'hint', text: `Baseline v${base.version} · ${formatDate(new Date(base.at))}${base.by ? ` · by ${base.by}` : ''}${base.crId ? ` · after ${crRefById(base.crId)}` : base.reason ? ` · ${base.reason}` : ''}` }),
      base.signature ? signatureView(base.signature, base.content) : base.crId
        ? el('p', { class: 'hint', text: `Moved by ${crRefById(base.crId)}, on the approvals signed there.` })
        : el('p', { class: 'hint', text: 'Not signed.' }),
    ]));

    if (drift.items.length) {
      parts.push(el('ul', { class: 'drift-list', id: 'scope-drift' }, drift.items.map((item) => el('li', {
        class: `drift ${item.coveredBy ? 'is-covered' : 'is-creep'}`,
      }, [
        el('div', { class: 'drift__head' }, [
          el('span', { class: 'drift__label', text: item.label }),
          item.coveredBy
            ? el('span', { class: 'status-badge tone-approved', text: `Covered by ${crRef(item.coveredBy)}` })
            : el('span', { class: 'status-badge tone-high', text: 'Not approved' }),
        ]),
        item.kind === 'added' ? null : el('p', { class: 'drift__diff' }, [
          el('span', { class: 'drift__was', text: `Was: ${trimmed(item.was)}` }),
          item.kind === 'removed' ? null : el('span', { class: 'drift__now', text: `Now: ${trimmed(item.now)}` }),
        ]),
        item.coveredBy
          ? el('p', { class: 'hint', text: 'Implement that change to move the baseline.' })
          : el('button', { type: 'button', class: 'btn btn-small no-print', 'data-scope': 'raise', 'data-touches': item.touches, 'data-label': item.label, 'data-was': item.was, 'data-now': item.now, text: 'Raise a change request' }),
      ]))));
    }
  }

  if (growth) {
    parts.push(el('dl', { class: 'scope-growth', id: 'scope-growth' }, [
      ['Deliverables', `${growth.firstDeliverables} at the first baseline, ${growth.nowDeliverables} now`],
      ['Approved changes', `${growth.approvedChanges} · ${growth.approvedDays >= 0 ? '+' : ''}${growth.approvedDays} days · ${money(growth.approvedCost)}`],
      ['Re-baselined without a change', String(growth.withoutChange)],
    ].flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])));
  }

  parts.push(el('div', { class: 'sync-actions no-print' }, [
    el('button', { type: 'button', class: 'btn btn-small btn-primary', 'data-scope': 'baseline', text: base ? 'Re-baseline everything…' : 'Baseline and sign the scope' }),
  ]));
  if (base) {
    parts.push(el('p', { class: 'hint', text: 'Re-baselining everything absorbs every difference above, approved or not, and is counted as a re-baseline without a change. Implementing an approved change moves only what that change covers.' }));
  }

  const history = state.scopeHistory || [];
  if (history.length) {
    parts.push(el('table', { class: 'data-table scope-history' }, [
      el('thead', {}, [el('tr', {}, ['Version', 'When', 'By', 'Why'].map((h) => el('th', { text: h })))]),
      el('tbody', {}, history.slice().reverse().map((h) => el('tr', {}, [
        el('td', { text: `v${h.version}` }),
        el('td', { text: formatDate(new Date(h.at)) }),
        el('td', { text: h.by || '—' }),
        el('td', { text: h.crId ? `Implemented ${crRefById(h.crId)}` : h.reason || (h.version === 1 ? 'First baseline' : '—') }),
      ]))),
    ]));
  }

  host.replaceChildren(...parts);
}

function crRefById(id) {
  const cr = (getState().changeRequests || []).find((c) => c.id === id);
  return cr ? crRef(cr) : 'a deleted change';
}

function scopeSummary(content) {
  return [
    ['In scope', trimmed(content.scopeIn, 200)],
    ['Out of scope', trimmed(content.scopeOut, 200)],
    ['Success criteria', trimmed(content.success, 200)],
    ['Deliverables', content.deliverables.map((d) => d.name || 'untitled').join('; ') || 'none'],
  ];
}

async function baselineScope() {
  const state = getState();
  let reason = '';
  if (state.scopeBaseline) {
    const why = await promptText({
      title: 'Re-baseline the whole scope?',
      message: 'This makes the scope as it stands the new baseline, including any change nobody approved. It is recorded as a re-baseline without a change request.',
      label: 'Reason',
      confirmLabel: 'Continue',
    });
    if (why === null) return;
    if (!why.trim()) { toast('A re-baseline without a change request needs a reason.', 'error'); return; }
    reason = why.trim();
  }
  const content = scopeContent(state);
  if (!content.scopeIn.trim() && !content.deliverables.length) {
    toast('There is no scope to baseline yet: write what is in scope on the Charter, or list a deliverable.', 'error');
    return;
  }
  const signature = await requestSignature({
    title: state.scopeBaseline ? 'Sign the new scope baseline' : 'Sign the scope baseline',
    statement: `I agree this is the scope of ${state.projectName || 'this project'}, and that changes to it go through change control.`,
    summary: scopeSummary(content),
    content,
    name: String(state.charterSponsor || '').split(',')[0].trim() || me(),
  });
  if (!signature) return;
  takeBaseline(state, { by: signature.name, reason, signature, content });
  committed('scope:baseline');
  renderBaseline();
  toast(`Scope baselined as v${state.scopeBaseline.version}.`, 'success');
}

function raiseFromDrift(button) {
  const state = getState();
  const { touches, label, was, now } = button.dataset;
  const cr = {
    id: uid(),
    ...CHANGE_REQUESTS.newRow(),
    title: label,
    touches,
    raisedBy: me(),
    scopeImpact: [was ? `Was: ${trimmed(was, 160)}` : '', now ? `Now: ${trimmed(now, 160)}` : ''].filter(Boolean).join(' — '),
  };
  state.changeRequests = state.changeRequests || [];
  state.changeRequests.push(cr);
  selectedId = cr.id;
  committed('scope:raise');
  renderRegister(CHANGE_REQUESTS);
  renderWorkflow();
  renderBaseline();
  showSection('page-scope', 'sec-change-requests');
  document.getElementById('sec-cr-workflow')?.scrollIntoView({ block: 'start' });
  toast(`${crRef(cr)} drafted. Fill in the impact, then submit it.`, 'success');
}

// ---------- The change request panel ----------

const STEPS = [
  ['Raised', ['Draft', 'Submitted']],
  ['Impact assessed', ['Under Review']],
  ['Decided', ['Approved', 'Rejected', 'Deferred']],
  ['Implemented', ['Implemented']],
];

function selected() {
  const list = getState().changeRequests || [];
  return list.find((c) => c.id === selectedId)
    || list.find((c) => !['Implemented', 'Rejected', 'Withdrawn'].includes(c.status))
    || list[0] || null;
}

export function selectChange(id) {
  selectedId = id;
  renderWorkflow();
}

export function renderWorkflow() {
  const host = document.getElementById('cr-workflow-body');
  if (!host) return;
  const state = getState();
  const list = state.changeRequests || [];
  const cr = selected();
  if (!cr) {
    host.replaceChildren(el('p', { class: 'hint', text: 'No change requests yet. Add one above, or raise one from Scope Baseline when the scope has moved.' }));
    return;
  }
  selectedId = cr.id;
  const legacy = !cr.stage || cr.stage === 'legacy';
  const stepAt = STEPS.findIndex(([, statuses]) => statuses.includes(cr.status));

  const picker = el('select', { class: 'field-input', id: 'cr-picker', 'aria-label': 'Change request to review' },
    list.map((c) => el('option', { value: c.id, text: `${crRef(c)} · ${c.title || 'untitled'} · ${c.status}`, selected: c.id === cr.id })));

  const touches = el('select', { class: 'field-input', id: 'cr-touches', 'data-cr-field': 'touches', disabled: legacy || cr.status === 'Implemented' }, [
    el('option', { value: '', text: 'Not said', selected: !cr.touches }),
    el('option', { value: 'charter', text: 'The charter’s scope statement', selected: cr.touches === 'charter' }),
    ...(state.deliverables || []).map((d) => el('option', { value: d.id, text: `${deliverableRef(d)} ${d.name || 'untitled'}`, selected: cr.touches === d.id })),
  ]);
  const reason = el('textarea', {
    class: 'field-input', id: 'cr-reason', 'data-cr-field': 'reason', rows: 2, value: cr.reason || '',
    placeholder: 'Why it is needed, and what happens if it is not done', disabled: legacy || cr.status === 'Implemented',
  });

  host.replaceChildren(...[
    el('div', { class: 'cr-panel__head' }, [
      el('label', { class: 'field-label cr-panel__picker' }, [document.createTextNode('Change request'), picker]),
      el('span', { class: `status-badge tone-${cr.status.toLowerCase().replace(/[^a-z]+/g, '-')}`, id: 'cr-status', text: cr.status }),
    ]),
    el('ol', { class: 'cr-steps', 'aria-label': 'Where this change has got to' }, STEPS.map(([label], i) => el('li', {
      class: `cr-step ${i < stepAt ? 'is-done' : i === stepAt ? 'is-current' : ''}`,
      'aria-current': i === stepAt ? 'step' : null,
      text: label,
    }))),
    legacy ? el('p', { class: 'hint cr-legacy', text: `Decided before the workflow existed${cr.decidedBy ? `, recorded by hand as ${cr.decidedBy}` : ''}. Nobody signed it, and the app does not invent a signature for it.` }) : null,
    el('div', { class: 'cr-fields' }, [
      el('label', { class: 'field-label' }, [document.createTextNode('What it touches'), touches]),
      el('label', { class: 'field-label cr-fields__wide' }, [document.createTextNode('Why'), reason]),
    ]),
    el('dl', { class: 'cr-impact', id: 'cr-impact' }, impactRows(cr)),
    el('div', { id: 'cr-approvals' }, [approvalsBlock(cr)]),
    el('div', { class: 'sync-actions no-print', id: 'cr-actions' }, actionButtons(cr)),
    (cr.history || []).length ? el('details', { class: 'cr-trail' }, [
      el('summary', { text: `History (${cr.history.length})` }),
      el('ol', {}, cr.history.map((h) => el('li', {}, [
        el('strong', { text: h.action }),
        document.createTextNode(` · ${new Date(h.at).toLocaleString()}${h.by ? ` · ${h.by}` : ''}${h.note ? ` — ${h.note}` : ''}`),
      ]))),
    ]) : null,
  ].filter(Boolean));
}

function impactRows(cr) {
  return [
    ['Scope impact', cr.scopeImpact || '—'],
    ['Schedule', cr.scheduleImpact === '' || cr.scheduleImpact === undefined ? '—' : `${cr.scheduleImpact} days`],
    ['Cost', cr.costImpact === '' || cr.costImpact === undefined ? '—' : money(cr.costImpact)],
    ['Touches', touchesLabel(cr.touches)],
  ].flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]);
}

function approvalsBlock(cr) {
  const approvals = cr.approvals || [];
  if (!approvals.length) {
    return el('p', { class: 'hint', text: cr.stage === 'review' ? 'No approvers.' : 'Approvers are worked out from the change’s size once its impact is assessed, from the route below.' });
  }
  const content = crContent(cr);
  return el('ul', { class: 'cr-approvals' }, approvals.map((a) => {
    const decision = effectiveDecision(a, cr);
    const canDecide = cr.stage === 'review' && decision === 'Pending';
    return el('li', { class: 'cr-approval', 'data-approval': a.id }, [
      el('div', { class: 'cr-approval__who' }, [
        el('strong', { text: a.role }),
        el('span', { text: a.name || 'nobody named — set it in the route below' }),
        el('span', { class: `status-badge tone-${decision.toLowerCase()}`, text: decision }),
      ]),
      a.signature ? signatureView(a.signature, content) : null,
      a.signature && a.name && a.signature.name.trim().toLowerCase() !== a.name.trim().toLowerCase()
        ? el('p', { class: 'hint sig__other', text: `Signed by ${a.signature.name}, not by ${a.name} as routed.` }) : null,
      canDecide ? el('div', { class: 'cr-approval__actions no-print' }, [
        el('button', { type: 'button', class: 'btn btn-small btn-primary', 'data-decide': 'Approved', 'data-approval': a.id, text: 'Approve' }),
        el('button', { type: 'button', class: 'btn btn-small', 'data-decide': 'Deferred', 'data-approval': a.id, text: 'Defer' }),
        el('button', { type: 'button', class: 'btn btn-small btn-danger', 'data-decide': 'Rejected', 'data-approval': a.id, text: 'Reject' }),
      ]) : null,
    ]);
  }));
}

function actionButtons(cr) {
  const b = (action, text, cls = '') => el('button', { type: 'button', class: `btn btn-small ${cls}`, 'data-cr': action, text });
  const out = [];
  if (cr.stage === 'draft') out.push(b('submit', 'Submit', 'btn-primary'));
  if (cr.stage === 'submitted') out.push(b('assess', 'Assess impact and route for approval', 'btn-primary'));
  if (cr.stage === 'review') out.push(b('approver', '+ Add an approver'));
  if (cr.status === 'Approved' && cr.stage === 'review') out.push(b('implement', cr.touches && getState().scopeBaseline ? 'Mark implemented and move the baseline' : 'Mark implemented', 'btn-primary'));
  if (cr.status === 'Deferred') out.push(b('reopen', 'Reopen'));
  if (['draft', 'submitted', 'review'].includes(cr.stage) && !['Approved', 'Rejected'].includes(cr.status)) out.push(b('withdraw', 'Withdraw', 'btn-ghost'));
  if (!out.length) return [el('span', { class: 'hint', text: cr.status === 'Implemented' ? `Implemented ${cr.implemented ? formatDate(cr.implemented) : ''}.` : 'Nothing further to do.' })];
  return out;
}

/** The derived parts of the panel, refreshed in place while someone types. */
function refreshPanelText(cr) {
  const status = document.getElementById('cr-status');
  if (status) {
    status.textContent = cr.status;
    status.className = `status-badge tone-${cr.status.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  }
  document.getElementById('cr-impact')?.replaceChildren(...impactRows(cr));
  document.getElementById('cr-approvals')?.replaceChildren(approvalsBlock(cr));
  document.getElementById('cr-actions')?.replaceChildren(...actionButtons(cr));
}

async function decide(cr, approvalId, decision) {
  const approval = cr.approvals.find((a) => a.id === approvalId);
  const verb = { Approved: 'approve', Rejected: 'reject', Deferred: 'defer' }[decision];
  const signature = await requestSignature({
    title: `${decision === 'Approved' ? 'Approve' : decision === 'Rejected' ? 'Reject' : 'Defer'} ${crRef(cr)} as ${approval.role}`,
    statement: `I ${verb} ${crRef(cr)} “${cr.title || 'untitled'}” as assessed below.`,
    summary: [
      ['Change', cr.title],
      ['Why', cr.reason],
      ['Scope impact', cr.scopeImpact],
      ['Schedule', `${cr.scheduleImpact} days`],
      ['Cost', money(cr.costImpact)],
      ['Touches', touchesLabel(cr.touches)],
    ],
    content: crContent(cr),
    name: approval.name || me(),
    confirmLabel: decision === 'Approved' ? 'Sign and approve' : decision === 'Rejected' ? 'Sign and reject' : 'Sign and defer',
    tone: decision === 'Rejected' ? 'danger' : 'primary',
    askComment: true,
  });
  if (!signature) return;
  const error = recordDecision(cr, approvalId, decision, signature);
  if (error) { toast(error, 'error'); return; }
  committed('scope:decision');
  renderRegister(CHANGE_REQUESTS);
  renderWorkflow();
  renderBaseline();
  toast(`${crRef(cr)}: ${decision.toLowerCase()} by ${signature.name} — now ${cr.status}.`, 'success');
}

async function runAction(cr, action) {
  const state = getState();
  let error = null;
  if (action === 'submit') error = submitChange(cr, me());
  else if (action === 'assess') error = assessChange(cr, state, me());
  else if (action === 'reopen') error = reopenChange(cr, me());
  else if (action === 'approver') {
    const name = await promptText({ title: 'Add an approver', message: 'Someone else whose signature this change needs.', label: 'Name', confirmLabel: 'Add' });
    if (name === null) return;
    if (!name.trim()) { toast('An approver needs a name.', 'error'); return; }
    error = addApprover(cr, 'Additional approver', name, me());
  } else if (action === 'withdraw') {
    if (!(await confirmAction({ title: `Withdraw ${crRef(cr)}?`, message: 'It stays on the list as withdrawn, with its history.', confirmLabel: 'Withdraw', tone: 'danger' }))) return;
    error = withdrawChange(cr, me());
  } else if (action === 'implement') {
    const next = baselineAfter(state, cr);
    error = markImplemented(cr, me());
    if (!error && next) {
      // The change's own signed approvals are the authority for this move, so
      // the new baseline carries a reference to them rather than a signature.
      takeBaseline(state, { by: me(), crId: cr.id, content: next });
    }
  }
  if (error) { toast(error, 'error'); return; }
  committed(`scope:${action}`);
  renderRegister(CHANGE_REQUESTS);
  renderWorkflow();
  renderBaseline();
}

// ---------- The approval route ----------

const ROUTE_FIELDS = [
  ['manager', 'Project manager', 'text'],
  ['sponsor', 'Sponsor', 'text'],
  ['board', 'Change board', 'text'],
  ['sponsorCost', 'Sponsor from (cost)', 'number'],
  ['sponsorDays', 'Sponsor from (days)', 'number'],
  ['boardCost', 'Change board from (cost)', 'number'],
  ['boardDays', 'Change board from (days)', 'number'],
];

export function renderRoute() {
  const host = document.getElementById('cr-route-fields');
  if (!host) return;
  const state = getState();
  const stored = state.changeRoute || {};
  const fallback = routeOf(state);
  host.replaceChildren(...ROUTE_FIELDS.map(([key, label, type]) => el('label', { class: 'field-label' }, [
    document.createTextNode(label),
    el('input', {
      class: 'field-input', type, 'data-route': key, min: type === 'number' ? '0' : null,
      value: stored[key] === undefined || stored[key] === '' ? '' : String(stored[key]),
      placeholder: type === 'number' ? String(DEFAULT_ROUTE[key]) : fallback[key] || 'Not named',
    }),
  ])));
}

// ---------- Deliverable sign-off ----------

function signOffCell(col, d) {
  const state = signOffState(d);
  const actions = el('div', { class: 'signoff__actions no-print' }, [
    el('button', { type: 'button', class: 'btn btn-small', 'data-cell-action': 'accept', text: state === 'signed' ? 'Re-sign' : 'Accept' }),
    el('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-cell-action': 'reject', text: 'Reject' }),
  ]);
  if (state === 'signed' || state === 'changed') {
    return el('div', { class: `signoff is-${state}` }, [
      el('span', { class: 'signoff__what', text: `${d.signature.decision || 'Signed'} · ${signatureLine(d.signature)}` }),
      state === 'changed' ? el('span', { class: 'sig__stale', text: 'Changed since signed — no longer accepted' }) : null,
      state === 'changed' ? actions : null,
    ]);
  }
  if (state === 'unsigned') {
    return el('div', { class: 'signoff is-unsigned' }, [
      el('span', { class: 'signoff__what', text: d.signedOffBy ? `Recorded by hand as ${d.signedOffBy}${d.signOffDate ? `, ${formatDate(d.signOffDate)}` : ''} — not signed` : `${d.status} without a signature` }),
      actions,
    ]);
  }
  return el('div', { class: 'signoff' }, [actions]);
}

async function signOff(d, decision) {
  const ref = deliverableRef(d);
  if (decision === 'Accepted' && !String(d.acceptance || '').trim()) {
    toast(`${ref} has no acceptance criteria, so there is nothing to accept it against. Write them first.`, 'error');
    return;
  }
  const signature = await requestSignature({
    title: `${decision === 'Accepted' ? 'Accept' : 'Reject'} ${ref}`,
    statement: decision === 'Accepted'
      ? `I accept ${ref} “${d.name || 'untitled'}” as meeting the acceptance criteria below.`
      : `I reject ${ref} “${d.name || 'untitled'}”: it does not meet the acceptance criteria below.`,
    summary: [['Deliverable', d.name], ['Acceptance criteria', d.acceptance], ['Owner', d.owner]],
    content: deliverableContent(d),
    name: me(),
    confirmLabel: decision === 'Accepted' ? 'Sign and accept' : 'Sign and reject',
    tone: decision === 'Accepted' ? 'primary' : 'danger',
    askComment: decision !== 'Accepted',
  });
  if (!signature) return;
  d.signature = { ...signature, decision };
  d.status = decision;
  d.signedOffBy = signature.name;
  d.signOffDate = toLocalISO(new Date(signature.at));
  committed('scope:signoff');
  renderRegister(DELIVERABLES);
  renderBaseline();
  toast(`${ref} ${decision.toLowerCase()} and signed by ${signature.name}.`, 'success');
}

// ---------- Wiring ----------

/** Called by the page after any register edit, so derived text keeps up with typing. */
export function afterRegisterEdit(def) {
  if (def.key === 'changeRequests') {
    reconcileChangeRequests(getState());
    refreshDerivedCells(CHANGE_REQUESTS);
    const cr = selected();
    if (cr) refreshPanelText(cr);
  }
  if (def.key === 'deliverables') {
    // A status that drops back to In Review is a select, not derived text:
    // set it in place, so the field being typed in keeps its caret.
    if (reconcileDeliverables(getState())) {
      (getState().deliverables || []).forEach((d) => {
        const select = document.querySelector(`#deliverables-body tr[data-id="${d.id}"] select[data-field="status"]`);
        if (select && select.value !== d.status) {
          select.value = d.status;
          select.className = `row-select tone-${d.status.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        }
      });
    }
    refreshDerivedCells(DELIVERABLES);
    renderBaseline();
  }
}

export function renderScopeControl() {
  reconcileChangeRequests(getState());
  renderBaseline();
  renderWorkflow();
  renderRoute();
}

export function initScopeControl({ onChange = () => {} } = {}) {
  onAnyChange = onChange;
  DELIVERABLES.renderCell = signOffCell;
  DELIVERABLES.onRowAction = (action, id) => {
    const d = (getState().deliverables || []).find((x) => x.id === id);
    if (d) signOff(d, action === 'reject' ? 'Rejected' : 'Accepted');
  };
  CHANGE_REQUESTS.onRowAction = (action, id) => {
    if (action !== 'review') return;
    selectChange(id);
    document.getElementById('sec-cr-workflow')?.scrollIntoView({ block: 'start' });
    document.getElementById('cr-picker')?.focus();
  };

  document.getElementById('scope-baseline-body')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-scope]');
    if (!btn) return;
    if (btn.dataset.scope === 'baseline') baselineScope();
    if (btn.dataset.scope === 'raise') raiseFromDrift(btn);
  });

  const panel = document.getElementById('cr-workflow-body');
  panel?.addEventListener('change', (e) => {
    if (e.target.id === 'cr-picker') { selectChange(e.target.value); return; }
    const field = e.target.dataset.crField;
    const cr = selected();
    if (!field || !cr || e.target.tagName !== 'SELECT') return;
    cr[field] = e.target.value;
    committed('scope:cr-field');
    refreshDerivedCells(CHANGE_REQUESTS);
    refreshPanelText(cr);
    renderBaseline();
  });
  panel?.addEventListener('input', (e) => {
    const field = e.target.dataset.crField;
    const cr = selected();
    if (!field || !cr || e.target.tagName !== 'TEXTAREA') return;
    cr[field] = e.target.value;
    committed('scope:cr-field');
    refreshDerivedCells(CHANGE_REQUESTS);
    refreshPanelText(cr);
  });
  panel?.addEventListener('click', (e) => {
    const cr = selected();
    if (!cr) return;
    const decideBtn = e.target.closest('[data-decide]');
    if (decideBtn) { decide(cr, decideBtn.dataset.approval, decideBtn.dataset.decide); return; }
    const actionBtn = e.target.closest('[data-cr]');
    if (actionBtn) runAction(cr, actionBtn.dataset.cr);
  });

  document.getElementById('cr-route-fields')?.addEventListener('input', (e) => {
    const key = e.target.dataset.route;
    if (!key) return;
    const state = getState();
    state.changeRoute = { ...(state.changeRoute || {}) };
    const numeric = ROUTE_FIELDS.find(([k]) => k === key)[2] === 'number';
    if (e.target.value === '') delete state.changeRoute[key];
    else state.changeRoute[key] = numeric ? Math.max(0, Number(e.target.value) || 0) : e.target.value;
    scheduleSave();
  });

  renderScopeControl();
}
