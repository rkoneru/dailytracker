// Use Cases & ROI: intake, evaluation, the ROI model, the signed go/no-go,
// conversion into a project, and value realisation — for client partners.
//
// Two things keep this page honest about who can see it. It is offered only to
// the Account Executive / Client Partner job role (roles.js), which is page
// hiding and says so. And the data never touches the project store: use cases
// live under their own key and sync to a table whose row level security admits
// only client partners (supabase/schema.sql), which is what actually keeps it
// from everyone else. The notice at the top says which of those applies to
// whoever is looking, including the two cases where nothing is enforced at all:
// signed out, and a demo.
//
// Typing updates the use case and refreshes the derived numbers beside it;
// only buttons rebuild a section, so an edit in progress is never dropped.

import { el } from './dom.js';
import {
  getActiveProjectId, listProjects, createProject, switchProject, scheduleSave,
} from './state.js';
import { getIdentity, isSignedIn, isDemo } from './identity.js';
import { getMe } from './me.js';
import { confirmAction, toast } from './dialog.js';
import { requestSignature, signatureView } from './signature.js';
import { METHODOLOGIES } from './methodology.js';
import { goToNode } from './nav.js';
import { formatDate } from './dates.js';
import {
  listUseCases, getUseCase, createUseCase, touchUseCase, deleteUseCase, onUseCasesChange,
} from './useCaseStore.js';
import { useCaseSyncState, onUseCaseSyncChange } from './useCaseSync.js';
import {
  CRITERIA, weightsOf, evaluate, DEFAULT_ASSUMPTIONS, BENEFIT_KINDS, annualBenefit,
  roiModel, openAssumptions, decisionContent, DECISION_SIGNERS, decisionOf, STAGES, stageOf, realisation,
} from './useCaseModel.js';

let selectedId = '';
let editing = false;

const money = (n) => (n === null || n === undefined ? '—' : `$${Math.round(n).toLocaleString()}`);
const pct = (n) => (n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`);

function me() {
  return getMe() || getIdentity().user?.email || '';
}

function projectName(id) {
  return listProjects().find((p) => p.id === id)?.name || 'a project not on this device';
}

function current() {
  return getUseCase(selectedId) || listUseCases()[0] || null;
}

// ---------- Who can see this, said plainly ----------

function access(uc) {
  const identity = getIdentity();
  if (!isSignedIn()) {
    return { see: true, tone: 'local', text: 'Signed out: use cases stay on this device and are shared with nobody. Sign in to share them with the client partners of a workspace.' };
  }
  if (isDemo()) {
    return identity.clientPartner
      ? { see: true, tone: 'demo', text: 'Demo: you hold client partner access. The app hides use cases from the other demo people, but nothing is enforced in a demo — there is no server to refuse anyone.' }
      : { see: false, tone: 'demo', text: 'Demo: you do not hold client partner access, so use cases are hidden from you. In a real workspace the database would return none to you.' };
  }
  const sync = useCaseSyncState();
  if (sync.status === 'not-installed') return { see: true, tone: 'warn', text: sync.message };
  if (!uc) {
    return identity.clientPartner
      ? { see: true, tone: 'enforced', text: 'You hold client partner access in this workspace. Use cases you start here are returned by the database to its client partners and nobody else.' }
      : { see: true, tone: 'none', text: 'You do not hold client partner access in this workspace, so the database returns none of its use cases to you. Any you start here stay on this device.' };
  }
  const shared = sync.writable ? sync.writable.has(uc.projectId) : null;
  if (shared) return { see: true, tone: 'enforced', text: `Shared with the client partners of ${projectName(uc.projectId)} only — the database returns it to nobody else.` };
  if (shared === false) return { see: true, tone: 'none', text: `On this device only: you cannot write use cases in ${projectName(uc.projectId)}, so it is not shared with anyone.` };
  return { see: true, tone: 'local', text: 'Not synced yet.' };
}

// ---------- Paths into a use case ----------

function getPath(uc, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), uc);
}

function setPath(uc, path, value) {
  const keys = path.split('.');
  let o = uc;
  keys.slice(0, -1).forEach((k) => {
    if (o[k] == null) o[k] = {};
    o = o[k];
  });
  o[keys[keys.length - 1]] = value;
}

function field(label, path, uc, { type = 'text', long = false, wide = false, placeholder = '', options = null } = {}) {
  let input;
  const value = getPath(uc, path) ?? '';
  if (options) {
    input = el('select', { class: 'field-input', 'data-uc': path },
      options.map(([v, t]) => el('option', { value: v, text: t, selected: String(value) === String(v) })));
  } else if (long) {
    input = el('textarea', { class: 'field-input', rows: 2, 'data-uc': path, placeholder, value });
  } else {
    input = el('input', { class: 'field-input', type, 'data-uc': path, placeholder, value: String(value) });
  }
  return el('label', { class: `charter-field ${long || wide ? 'charter-field--wide' : ''}` }, [
    el('span', { class: 'charter-field__label', text: label }), input,
  ]);
}

// ---------- Sections ----------

function renderIntake(uc) {
  const host = document.getElementById('uc-intake');
  host.replaceChildren(
    field('Use case', 'name', uc, { wide: true, placeholder: 'What it is, in a line' }),
    field('Client', 'client', uc, { placeholder: 'Organisation' }),
    field('Client sponsor', 'sponsor', uc, { placeholder: 'Who signs the go/no-go for them' }),
    field('Client partner', 'partner', uc, { placeholder: 'Who owns it on our side' }),
    field('People affected', 'usersAffected', uc, { type: 'number' }),
    field('The problem', 'problem', uc, { long: true, placeholder: 'What is costing them today, in their words' }),
    field('How it is done now', 'currentProcess', uc, { long: true, placeholder: 'The current process, and where the time or money goes' }),
    field('Outcome sought', 'outcome', uc, { long: true, placeholder: 'What will be true when this works — this becomes the success criteria' }),
    field('Delivery lifecycle', 'methodology', uc, {
      options: [['', 'Choose one — needed to become a project'], ...METHODOLOGIES.map((m) => [m.id, m.label])],
    }),
    el('p', { class: 'hint charter-field--wide', text: `Workspace: ${projectName(uc.projectId)}. Created ${formatDate(new Date(uc.createdAt))}.` }),
  );
}

function renderEvaluate(uc) {
  const host = document.getElementById('uc-evaluate');
  const weights = weightsOf(uc);
  host.replaceChildren(el('table', { class: 'data-table uc-eval' }, [
    el('thead', {}, [el('tr', {}, ['Criterion', 'Score (1–5)', 'Weight', 'Guide'].map((t) => el('th', { text: t })))]),
    el('tbody', {}, CRITERIA.map((c) => el('tr', {}, [
      el('td', { text: c.label }),
      el('td', {}, [el('select', { class: 'row-select', 'data-uc': `scores.${c.id}`, 'aria-label': `${c.label} score` },
        [['', 'Not scored'], ...[1, 2, 3, 4, 5].map((n) => [String(n), String(n)])]
          .map(([v, t]) => el('option', { value: v, text: t, selected: String(uc.scores?.[c.id] ?? '') === v })))]),
      el('td', { class: 'col-num' }, [el('input', {
        type: 'number', class: 'row-input', min: '0', step: '5', 'data-uc': `weights.${c.id}`, 'aria-label': `${c.label} weight`,
        value: uc.weights?.[c.id] ?? '', placeholder: String(weights[c.id]),
      })]),
      el('td', { class: 'hint', text: c.hint }),
    ]))),
  ]));
}

function renderEvalResult(uc) {
  const out = document.getElementById('uc-eval-result');
  const result = evaluate(uc);
  const total = Object.values(weightsOf(uc)).reduce((a, b) => a + Math.max(0, b), 0);
  out.textContent = result ? `${result.score} / 100 · ${result.band}` : `Not scored · weights total ${total}`;
  out.className = `hint uc-eval-result ${result ? `is-${result.band.toLowerCase()}` : 'is-unscored'}`;
}

function linesTable(uc, key, columns, addLabel) {
  const lines = uc[key] || [];
  return el('div', { class: 'uc-lines' }, [
    el('div', { class: 'table-scroll' }, [el('table', { class: 'data-table' }, [
      el('thead', {}, [el('tr', {}, [...columns.map((c) => el('th', { class: c.cls || '', text: c.label })), el('th', { class: 'col-action no-print' })])]),
      el('tbody', {}, lines.map((line, i) => el('tr', {}, [
        ...columns.map((c) => el('td', { class: c.cls || '' }, [c.render(line, `${key}.${i}.${c.field}`)])),
        el('td', { class: 'col-action no-print' }, [el('button', {
          type: 'button', class: 'icon-btn', 'data-uc-remove': `${key}.${i}`, 'aria-label': `Remove ${line.label || 'line'}`, text: '🗑',
        })]),
      ]))),
    ])]),
    el('button', { type: 'button', class: 'btn btn-small no-print', 'data-uc-add': key, text: addLabel }),
  ]);
}

const input = (type, extra = {}) => (line, path) => el('input', {
  type, class: 'row-input', 'data-uc': path, value: line[path.split('.').pop()] ?? '', ...extra,
});
const select = (options) => (line, path) => el('select', { class: 'row-select', 'data-uc': path },
  options.map((o) => el('option', { value: o, text: o, selected: line[path.split('.').pop()] === o })));
const check = (line, path) => el('input', { type: 'checkbox', 'data-uc': path, checked: !!line[path.split('.').pop()], 'aria-label': 'An assumption, not a sourced figure' });

function renderRoi(uc) {
  const host = document.getElementById('uc-roi');
  const assumption = (key, label, suffix) => el('label', { class: 'field-label' }, [
    document.createTextNode(`${label}${suffix ? ` (${suffix})` : ''}`),
    el('input', { type: 'number', class: 'field-input', 'data-uc': `assumptions.${key}`, value: uc.assumptions?.[key] ?? '', placeholder: String(DEFAULT_ASSUMPTIONS[key]), min: '0' }),
  ]);
  host.replaceChildren(
    el('div', { class: 'uc-assumptions' }, [
      assumption('horizonYears', 'Horizon', 'years'),
      assumption('discountRate', 'Discount rate', '%'),
      assumption('rampMonths', 'Adoption ramp', 'months'),
      assumption('adoption', 'Target adoption', '%'),
      assumption('lowFactor', 'Low case', '% of benefit'),
      assumption('highFactor', 'High case', '% of benefit'),
    ]),
    el('h3', { class: 'uc-sub', text: 'Costs' }),
    linesTable(uc, 'costs', [
      { field: 'label', label: 'Cost', render: input('text', { placeholder: 'Build, licences, training…' }) },
      { field: 'type', label: 'When', render: select(['One-off', 'Annual']) },
      { field: 'amount', label: 'Amount', cls: 'col-num', render: input('number', { step: '1000', min: '0' }) },
      { field: 'source', label: 'Source', render: input('text', { placeholder: 'SOW, quote, estimate…' }) },
      { field: 'assumption', label: 'Assumed', cls: 'col-check', render: check },
    ], '+ Add cost'),
    el('h3', { class: 'uc-sub', text: 'Benefits (at full adoption, per year)' }),
    linesTable(uc, 'benefits', [
      { field: 'label', label: 'Benefit', render: input('text', { placeholder: 'What gets better' }) },
      { field: 'kind', label: 'Kind', render: select(BENEFIT_KINDS) },
      { field: 'hoursPerWeek', label: 'Hours / week', cls: 'col-num', render: input('number', { min: '0' }) },
      { field: 'rate', label: 'Loaded rate', cls: 'col-num', render: input('number', { min: '0' }) },
      { field: 'annual', label: 'Or $ / year', cls: 'col-num', render: input('number', { step: '1000', min: '0' }) },
      { field: 'source', label: 'Source', render: input('text', { placeholder: 'Time study, finance…' }) },
      { field: 'assumption', label: 'Assumed', cls: 'col-check', render: check },
    ], '+ Add benefit'),
    el('div', { id: 'uc-roi-results' }),
  );
  renderRoiResults(uc);
}

function renderRoiResults(uc) {
  const host = document.getElementById('uc-roi-results');
  if (!host) return;
  const model = roiModel(uc);
  if (!model) {
    host.replaceChildren(el('p', { class: 'hint is-unmeasured', text: 'Not modelled: add at least one cost or benefit.' }));
    return;
  }
  const rows = [
    ['Total benefit', (s) => money(s.totalBenefit)],
    ['Total cost', (s) => money(s.totalCost)],
    ['Net', (s) => money(s.net)],
    ['ROI', (s) => (s.roi === null ? 'No cost entered' : pct(s.roi))],
    [`NPV at ${model.assumptions.discountRate}%`, (s) => money(s.npv)],
    ['Payback', (s) => (s.payback === null ? `Not within ${model.assumptions.horizonYears} years` : `Month ${s.payback}`)],
  ];
  const open = openAssumptions(uc);
  host.replaceChildren(
    el('div', { class: 'table-scroll' }, [el('table', { class: 'data-table uc-results', id: 'uc-results-table' }, [
      el('thead', {}, [el('tr', {}, ['', `Low (${model.assumptions.lowFactor}%)`, 'Expected', `High (${model.assumptions.highFactor}%)`].map((t) => el('th', { text: t })))]),
      el('tbody', {}, rows.map(([label, fn]) => el('tr', {}, [
        el('th', { scope: 'row', text: label }),
        ...['low', 'expected', 'high'].map((k) => el('td', { class: `col-num ${k === 'expected' ? 'is-expected' : ''}`, text: fn(model[k]) })),
      ]))),
    ])]),
    el('p', { class: 'hint', text: `Annual benefit at full adoption: ${money((uc.benefits || []).map(annualBenefit).filter((v) => v !== null).reduce((a, b) => a + b, 0))}.` }),
    open.length
      ? el('div', { class: 'uc-open' }, [
        el('strong', { text: `${open.length} open assumption${open.length === 1 ? '' : 's'}` }),
        el('ul', {}, open.map((o) => el('li', { text: `${o.label} — ${o.why}` }))),
      ])
      : el('p', { class: 'hint', text: 'Every line has a source.' }),
  );
}

function renderDecision(uc) {
  const host = document.getElementById('uc-decision');
  const evaluation = evaluate(uc);
  const model = roiModel(uc);
  const decision = decisionOf(uc);
  const content = decisionContent(uc);
  const d = uc.decision || {};
  const ready = evaluation && model;

  const summary = el('dl', { class: 'uc-summary' }, [
    ['Evaluation', evaluation ? `${evaluation.score} / 100 · ${evaluation.band}` : 'Not scored'],
    ['Expected ROI', model?.expected.roi === null || !model ? '—' : pct(model.expected.roi)],
    ['NPV', model ? money(model.expected.npv) : '—'],
    ['Payback', model?.expected.payback ? `Month ${model.expected.payback}` : '—'],
    ['Open assumptions', String(openAssumptions(uc).length)],
  ].flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));

  const status = decision?.outcome
    ? el('p', { class: `uc-verdict is-${decision.outcome === 'Go' ? 'go' : 'nogo'}`, id: 'uc-verdict', text: decision.outcome === 'Go' ? 'Go — signed by both' : 'No-go — signed' })
    : decision?.stale
      ? el('p', { class: 'uc-verdict is-stale', id: 'uc-verdict', text: 'The decision lapsed: the scores or the model changed after it was signed. Sign again.' })
      : el('p', { class: 'uc-verdict', id: 'uc-verdict', text: ready ? 'Not decided yet.' : 'Evaluate it and model the ROI first.' });

  const outcome = el('label', { class: 'field-label' }, [document.createTextNode('Decision'),
    el('select', { class: 'field-input', id: 'uc-outcome', disabled: !ready }, [['', 'Choose…'], ['Go', 'Go'], ['No-go', 'No-go']]
      .map(([v, t]) => el('option', { value: v, text: t, selected: (d.outcome || '') === v })))]);

  const signers = el('ul', { class: 'cr-approvals' }, DECISION_SIGNERS.map((s) => {
    const sig = d.signatures?.[s.id] || null;
    return el('li', { class: 'cr-approval' }, [
      el('div', { class: 'cr-approval__who' }, [
        el('strong', { text: s.label }),
        el('span', { text: s.id === 'sponsor' ? (uc.sponsor || 'not named on Intake') : (uc.partner || 'not named on Intake') }),
      ]),
      sig ? signatureView(sig, content) : null,
      d.outcome && ready ? el('button', { type: 'button', class: 'btn btn-small btn-primary no-print', 'data-uc-sign': s.id, text: sig ? 'Sign again' : `Sign as ${s.label.toLowerCase()}` }) : null,
    ]);
  }));

  const converted = uc.convertedProjectId;
  const canConvert = decision?.outcome === 'Go' && !converted;
  host.replaceChildren(
    summary, outcome, status, signers,
    el('div', { class: 'sync-actions no-print' }, [
      converted
        ? el('span', { class: 'hint', text: `Became the project “${projectName(converted)}”. See Delivery & Value.` })
        : el('button', { type: 'button', class: 'btn btn-primary', id: 'btn-uc-convert', disabled: !canConvert, text: 'Turn into a project…' }),
    ]),
  );
}

function renderValue(uc) {
  const host = document.getElementById('uc-value');
  if (!uc.convertedProjectId) {
    host.replaceChildren(el('p', { class: 'hint', text: 'Nothing to track until it is a project: that happens after a signed Go, on Decision.' }));
    return;
  }
  host.replaceChildren(
    el('div', { class: 'sync-actions no-print' }, [
      el('button', { type: 'button', class: 'btn btn-small', 'data-uc-go': 'tab-dashboard', text: `Open “${projectName(uc.convertedProjectId)}”` }),
      el('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-uc-go': 'tab-service', text: 'Its Service & Support' }),
      el('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-uc-go': 'tab-customers', text: 'Its Customer Success' }),
    ]),
    el('div', { class: 'uc-assumptions' }, [
      field('Went live', 'goLive', uc, { type: 'date' }),
      field('Handed to support', 'supportFrom', uc, { type: 'date' }),
    ]),
    el('h3', { class: 'uc-sub', text: 'Benefit realised' }),
    linesTable(uc, 'actuals', [
      { field: 'month', label: 'Month', render: input('month') },
      { field: 'amount', label: 'Realised', cls: 'col-num', render: input('number', { step: '1000' }) },
      { field: 'note', label: 'Evidence', render: input('text', { placeholder: 'Who confirmed it, from what' }) },
    ], '+ Add a month'),
    el('div', { id: 'uc-realisation' }),
  );
  renderRealisation(uc);
}

function renderRealisation(uc) {
  const host = document.getElementById('uc-realisation');
  if (!host) return;
  const r = realisation(uc);
  if (!r) {
    host.replaceChildren(el('p', { class: 'hint is-unmeasured', text: 'Not measured: set the go-live date to forecast against.' }));
    return;
  }
  host.replaceChildren(el('dl', { class: 'uc-summary', id: 'uc-realisation-read' }, [
    ['Months since go-live', String(r.months)],
    ['Forecast (expected case)', money(r.forecast)],
    ['Realised', r.actual === null ? 'Nothing recorded' : money(r.actual)],
    ['Against forecast', r.ratio === null ? '—' : pct(r.ratio)],
  ].flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])));
}

function renderSteps(uc) {
  const host = document.getElementById('uc-steps');
  const stage = uc ? stageOf(uc) : null;
  if (!uc) { host.replaceChildren(); return; }
  if (stage === 'Declined') {
    host.replaceChildren(el('li', { class: 'cr-step is-current', text: 'Declined — a signed no-go' }));
    return;
  }
  const at = STAGES.indexOf(stage);
  host.replaceChildren(...STAGES.map((s, i) => el('li', {
    class: `cr-step ${i < at ? 'is-done' : i === at ? 'is-current' : ''}`,
    'aria-current': i === at ? 'step' : null,
    text: s,
  })));
}

function renderPicker() {
  const picker = document.getElementById('uc-picker');
  const list = listUseCases();
  picker.replaceChildren(...list.map((uc) => el('option', {
    value: uc.id, selected: uc.id === selectedId, text: `${uc.name || 'Untitled use case'}${uc.client ? ` · ${uc.client}` : ''} · ${stageOf(uc)}`,
  })));
}

function refreshDerived(uc) {
  renderEvalResult(uc);
  renderRoiResults(uc);
  renderSteps(uc);
  renderRealisation(uc);
  const option = document.querySelector(`#uc-picker option[value="${uc.id}"]`);
  if (option) option.textContent = `${uc.name || 'Untitled use case'}${uc.client ? ` · ${uc.client}` : ''} · ${stageOf(uc)}`;
  // The decision section has buttons that depend on the numbers, and holds no
  // text field, so it is safe to rebuild while someone types elsewhere.
  renderDecision(uc);
}

export function renderUseCases() {
  const uc = current();
  selectedId = uc ? uc.id : '';
  const a = access(uc);
  const note = document.getElementById('uc-access');
  note.textContent = a.text;
  note.className = `uc-access is-${a.tone}`;
  const body = document.getElementById('uc-body');
  const visible = a.see && !!uc;
  body.hidden = !visible;
  document.getElementById('uc-none').hidden = !(a.see && !uc);
  document.querySelector('#page-usecases .uc-bar').hidden = !a.see;
  document.getElementById('uc-steps').hidden = !visible;
  if (!a.see) return;
  renderPicker();
  document.getElementById('btn-uc-delete').disabled = !uc;
  if (!uc) return;
  renderIntake(uc);
  renderEvaluate(uc);
  renderEvalResult(uc);
  renderRoi(uc);
  renderDecision(uc);
  renderValue(uc);
  renderSteps(uc);
}

// ---------- Actions ----------

function commit(uc) {
  editing = true;
  touchUseCase(uc);
  editing = false;
}

async function sign(uc, signerId) {
  const signer = DECISION_SIGNERS.find((s) => s.id === signerId);
  const outcome = uc.decision?.outcome;
  const model = roiModel(uc);
  const evaluation = evaluate(uc);
  const signature = await requestSignature({
    title: `${outcome} — sign as ${signer.label.toLowerCase()}`,
    statement: `I agree to ${outcome === 'Go' ? 'go ahead with' : 'not pursue'} “${uc.name || 'this use case'}”${uc.client ? ` for ${uc.client}` : ''}, on the evaluation and ROI model below.`,
    summary: [
      ['Use case', uc.name],
      ['Evaluation', evaluation ? `${evaluation.score} / 100 · ${evaluation.band}` : 'Not scored'],
      ['Expected benefit', money(model?.expected.totalBenefit)],
      ['Total cost', money(model?.expected.totalCost)],
      ['Expected ROI', model?.expected.roi === null ? '—' : pct(model?.expected.roi)],
      ['NPV', money(model?.expected.npv)],
      ['Open assumptions', String(openAssumptions(uc).length)],
    ],
    content: decisionContent(uc),
    name: signerId === 'sponsor' ? uc.sponsor || '' : uc.partner || me(),
    confirmLabel: 'Sign',
  });
  if (!signature) return;
  uc.decision = { ...uc.decision, signatures: { ...(uc.decision?.signatures || {}), [signerId]: signature } };
  commit(uc);
  renderUseCases();
  const d = decisionOf(uc);
  toast(d?.outcome ? `${d.outcome} — signed.` : `Signed as ${signer.label.toLowerCase()}. The other signature is still needed.`, 'success');
}

async function convert(uc) {
  if (!uc.methodology) {
    toast('Choose the delivery lifecycle on Intake first — every project needs one.', 'error');
    return;
  }
  const model = roiModel(uc);
  const scores = uc.scores || {};
  const ok = await confirmAction({
    title: `Turn “${uc.name || 'this use case'}” into a project?`,
    message: `Copied into the new project: its name, the outcome sought as the objective and success criteria, the problem as the business case, `
      + `the client sponsor, the value and fit scores, and the expected total cost (${money(model?.expected.totalCost)}) as the planned budget. `
      + 'Not copied: the benefits, rates, ROI, NPV, assumptions and signatures — they stay here, with the client partners. '
      + 'Everything in a project can be read by every member of it, so the budget will be visible to the whole team.',
    confirmLabel: 'Create the project',
  });
  if (!ok) return;
  const project = createProject({ name: uc.name || 'Untitled project', templateKey: 'blank', methodology: uc.methodology });
  Object.assign(project, {
    objective: uc.outcome || '',
    charterSponsor: uc.sponsor || '',
    charterBusinessCase: uc.problem || '',
    charterSuccess: uc.outcome || '',
    charterValue: scores.value ? String(scores.value) : '',
    charterFit: scores.fit ? String(scores.fit) : '',
    budgetPlanned: model ? model.expected.totalCost : 0,
  });
  scheduleSave();
  uc.convertedProjectId = project.id;
  commit(uc);
  renderUseCases();
  toast(`Project “${project.projectName}” created and opened. The use case stays here.`, 'success');
}

function bind() {
  const page = document.getElementById('page-usecases');

  page.addEventListener('input', (e) => {
    const path = e.target.dataset.uc;
    const uc = current();
    if (!path || !uc) return;
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setPath(uc, path, value);
    commit(uc);
    refreshDerived(uc);
  });
  page.addEventListener('change', (e) => {
    const uc = current();
    if (e.target.id === 'uc-picker') { selectedId = e.target.value; renderUseCases(); return; }
    if (e.target.id === 'uc-outcome' && uc) {
      // A new outcome needs new signatures: nobody signed this one.
      uc.decision = e.target.value ? { outcome: e.target.value, signatures: {} } : null;
      commit(uc);
      renderUseCases();
      return;
    }
    // Selects and checkboxes report on change; the input handler already saw text.
    if (e.target.dataset.uc && (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') && uc) {
      setPath(uc, e.target.dataset.uc, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
      commit(uc);
      refreshDerived(uc);
    }
  });

  page.addEventListener('click', async (e) => {
    const uc = current();
    const add = e.target.closest('[data-uc-add]')?.dataset.ucAdd;
    const remove = e.target.closest('[data-uc-remove]')?.dataset.ucRemove;
    const signer = e.target.closest('[data-uc-sign]')?.dataset.ucSign;
    const go = e.target.closest('[data-uc-go]')?.dataset.ucGo;
    if (add && uc) {
      const blank = {
        costs: { label: '', type: 'One-off', amount: '', source: '', assumption: false },
        benefits: { label: '', kind: 'Time saved', hoursPerWeek: '', rate: '', annual: '', source: '', assumption: false },
        actuals: { month: '', amount: '', note: '' },
      }[add];
      uc[add] = [...(uc[add] || []), blank];
      commit(uc);
      renderUseCases();
      return;
    }
    if (remove && uc) {
      const [key, index] = remove.split('.');
      uc[key] = (uc[key] || []).filter((_, i) => i !== Number(index));
      commit(uc);
      renderUseCases();
      return;
    }
    if (signer && uc) { sign(uc, signer); return; }
    if (e.target.id === 'btn-uc-convert' && uc) { convert(uc); return; }
    if (go && uc) {
      switchProject(uc.convertedProjectId);
      goToNode(go);
    }
  });

  document.getElementById('btn-uc-new').addEventListener('click', () => {
    const uc = createUseCase(getActiveProjectId(), { partner: me() });
    selectedId = uc.id;
    renderUseCases();
    document.querySelector('#uc-intake [data-uc="name"]')?.focus();
  });
  document.getElementById('btn-uc-delete').addEventListener('click', async () => {
    const uc = current();
    if (!uc) return;
    const ok = await confirmAction({
      title: `Delete “${uc.name || 'this use case'}”?`,
      message: 'It is removed for every client partner it is shared with. A project it became is not touched.',
      confirmLabel: 'Delete', tone: 'danger',
    });
    if (!ok) return;
    deleteUseCase(uc.id);
    selectedId = '';
    renderUseCases();
  });

  // Sync bringing rows in, or taking them away when access is revoked,
  // rebuilds the page — but not our own saves, which would drop the caret.
  onUseCasesChange(() => {
    if (editing) return;
    if (document.getElementById('page-usecases').classList.contains('is-active')) renderUseCases();
  });
  onUseCaseSyncChange(() => {
    if (document.getElementById('page-usecases').classList.contains('is-active')) renderUseCases();
  });
}

export function initUseCases() {
  bind();
  renderUseCases();
}

/** For the closure report: the business case behind a project, when this device holds it. */
export function useCaseFor(projectId) {
  return listUseCases().find((uc) => uc.convertedProjectId === projectId) || null;
}

