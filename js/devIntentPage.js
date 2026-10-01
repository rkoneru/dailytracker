// The Dev Intent tab on Scope & Contract: the form for what a coding agent
// needs that the project does not already hold, what is read from the
// project beside it, the readiness checks, and `intent.md` as it will be
// written. Rules in js/devIntent.js.
//
// The form is built once per draw; typing saves the field and redraws only
// the checks and the preview, so an edit in progress is never replaced.

import { el } from './dom.js';
import { getState, scheduleSave } from './state.js';
import { INTENT_FIELDS, INTENT_GROUPS, intentOf, intentReadiness, intentMarkdown, looksLikeSecret, INTENT_FILE } from './devIntent.js';
import { toast } from './dialog.js';
import { goToNode } from './nav.js';

function fromProject(project) {
  const deliverables = project.deliverables || [];
  const raid = project.raid || [];
  const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  return [
    ['Objective', project.objective ? 'Stated' : 'Not stated', 'tab-dashboard'],
    ['Business case', project.charterBusinessCase ? 'Stated' : 'Not stated', 'nav-charter'],
    ['Scope in / out', `${project.charterScopeIn ? 'In stated' : 'In not stated'} · ${project.charterScopeOut ? 'out stated' : 'out not stated'}`, 'nav-charter'],
    ['Success criteria', project.charterSuccess ? 'Stated' : 'Not stated', 'nav-charter'],
    ['Constraints', project.charterConstraints ? 'Stated' : 'None', 'nav-charter'],
    ['Deliverables', `${count(deliverables.length, 'deliverable')}, ${deliverables.filter((d) => String(d.acceptance || '').trim()).length} with acceptance criteria`, 'nav-deliverables'],
    ['Milestones', count((project.milestones || []).filter((m) => !m.done).length, 'open milestone'), 'nav-milestones'],
    ['Risks & assumptions', `${count(raid.filter((r) => r.type === 'Risk' && r.status !== 'Closed').length, 'open risk')}, ${count(raid.filter((r) => r.type === 'Assumption' && r.status !== 'Closed').length, 'assumption')}`, 'nav-raid-log'],
    ['Dependencies', count((project.dependencies || []).filter((d) => d.status !== 'Met').length, 'open dependency', 'open dependencies'), 'nav-dependencies'],
  ];
}

function refresh() {
  const project = getState();
  if (!project) return;
  const r = intentReadiness(project);
  document.getElementById('intent-count').textContent = r.ready ? 'Ready to start' : `${r.passed} of ${r.total} answered`;
  document.getElementById('intent-count').className = `hint ${r.ready ? 'is-ready' : ''}`;
  document.getElementById('intent-checks').replaceChildren(...r.checks.map((c) => el('li', { class: `intent-check ${c.ok ? 'is-ok' : 'is-bad'}`, 'data-check': c.id }, [
    el('span', { class: 'intent-check__mark', 'aria-hidden': 'true', text: c.ok ? '✓' : '○' }),
    el('span', { text: c.label }),
    !c.ok && el('button', { type: 'button', class: 'link-btn no-print', 'data-intent-go': c.home, text: c.home.startsWith('intent:') ? 'Answer it' : 'Fill it in →' }),
  ].filter(Boolean))));
  document.getElementById('intent-preview').textContent = intentMarkdown(project);
}

export function renderDevIntent() {
  const host = document.getElementById('intent-form');
  const project = getState();
  if (!host || !project) return;
  const values = intentOf(project);
  host.replaceChildren(
    ...INTENT_GROUPS.map((g) => el('fieldset', { class: 'intent-group', 'data-group': g.id }, [
      el('legend', { text: g.label }),
      ...INTENT_FIELDS.filter((f) => f.group === g.id).map((f) => el('label', { class: 'charter-field' }, [
        el('span', { class: 'charter-field__label', text: f.label }),
        el('textarea', { class: 'field-input', rows: f.rows, 'data-intent-field': f.field, placeholder: f.placeholder, value: values[f.field] }),
        el('span', { class: 'intent-secret', 'data-secret-for': f.field, hidden: true, text: 'That looks like a password or key, so it was not kept. Say where the secret is held instead.' }),
      ])),
    ])),
    el('fieldset', { class: 'intent-group intent-group--read' }, [
      el('legend', { text: 'Read from the project' }),
      el('p', { class: 'hint', text: 'Written into the file from where each lives. Edit them there.' }),
      el('dl', { class: 'intent-read' }, fromProject(project).flatMap(([k, v, home]) => [
        el('dt', { text: k }),
        el('dd', {}, [el('span', { text: v }), el('button', { type: 'button', class: 'link-btn no-print', 'data-intent-go': home, text: 'Edit →' })]),
      ])),
    ]),
  );
  refresh();
}

function download(name, body) {
  const a = el('a', { href: URL.createObjectURL(new Blob([body], { type: 'text/markdown' })), download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function initDevIntent() {
  const section = document.getElementById('sec-dev-intent');
  if (!section) return;
  section.addEventListener('input', (e) => {
    const field = e.target.dataset.intentField;
    if (!field) return;
    const secret = looksLikeSecret(e.target.value);
    const note = section.querySelector(`[data-secret-for="${field}"]`);
    if (note) note.hidden = !secret;
    e.target.classList.toggle('is-invalid', secret);
    // Fail closed: a value that looks like a credential is never stored.
    if (secret) return;
    const project = getState();
    project.devIntent = { ...intentOf(project), [field]: e.target.value };
    scheduleSave();
    refresh();
  });
  section.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-intent-go]')?.dataset.intentGo;
    if (go) {
      if (go.startsWith('intent:')) section.querySelector(`[data-intent-field="${go.slice(7)}"]`)?.focus();
      else goToNode(go);
      return;
    }
    const act = e.target.closest('[data-intent]')?.dataset.intent;
    if (!act) return;
    const body = intentMarkdown(getState());
    if (act === 'download') {
      download(INTENT_FILE, body);
      toast(`${INTENT_FILE} downloaded. Put it at the root of the repository and ask Claude Code to start from it.`, 'success');
    }
    if (act === 'copy') {
      try {
        await navigator.clipboard.writeText(body);
        toast(`${INTENT_FILE} copied to the clipboard.`, 'success');
      } catch {
        toast('The clipboard is not available here — use Download instead.', 'error');
      }
    }
  });
}
