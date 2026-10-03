// The Project Plan tab on Scope & Contract: the nineteen sections, each read
// from its home with a link to it, the SMART check on the objective, and the
// sponsor's approval. Rules in js/projectPlan.js. Nothing here is edited in
// place — every section is edited where it lives.

import { el } from './dom.js';
import { getState, scheduleSave } from './state.js';
import { planSections, smartCheck, planApproval, planContent, planText } from './projectPlan.js';
import { requestSignature, signatureLine } from './signature.js';
import { confirmAction, toast } from './dialog.js';
import { goToNode } from './nav.js';

const STATUS_TEXT = { filled: 'Filled', partial: 'Part filled', empty: 'Empty', na: 'None needed' };

export function renderProjectPlan() {
  const host = document.getElementById('plan-sections');
  if (!host || !getState()) return;
  const project = getState();
  const sections = planSections(project);
  const counted = sections.filter((s) => s.status !== 'na');
  document.getElementById('plan-count').textContent = `${counted.filter((s) => s.status === 'filled').length} of ${counted.length} sections filled`;
  document.getElementById('plan-smart').replaceChildren(...smartCheck(project).map((c) => el('li', {
    class: `plan-smart__item ${c.ok === null ? 'is-judgement' : c.ok ? 'is-ok' : 'is-bad'}`, 'data-smart': c.id,
  }, [el('span', { class: 'plan-smart__letter', text: c.id }), el('span', {}, [el('strong', { text: c.label }), el('span', { class: 'hint', text: ` — ${c.detail}` })])])));
  host.replaceChildren(...sections.map((s) => el('section', { class: `plan-section is-${s.status}`, 'data-section': s.id }, [
    el('header', {}, [
      el('span', { class: 'plan-section__n', text: String(s.n) }),
      el('strong', { text: s.label }),
      el('span', { class: `plan-section__status is-${s.status}`, text: STATUS_TEXT[s.status] }),
      s.home && el('button', { type: 'button', class: 'link-btn no-print', 'data-plan-go': s.home, text: 'Edit where it lives →' }),
    ]),
    el('ul', {}, s.lines.length ? s.lines.slice(0, 12).map((l) => el('li', { text: l })) : [el('li', { class: 'hint', text: 'Nothing recorded yet.' })]),
    s.lines.length > 12 && el('p', { class: 'hint', text: `and ${s.lines.length - 12} more` }),
  ])));
  const { state, signature } = planApproval(project);
  document.getElementById('plan-approval').replaceChildren(
    el('p', { class: state === 'signed' ? 'hf-accepted' : state === 'changed' ? 'hf-changed' : 'hint', text: state === 'signed' ? `Approved — ${signatureLine(signature)}` : state === 'changed' ? `Approved by ${signature.name}, then the plan’s commitments changed. The approval no longer counts.` : 'Not approved yet.' }),
    el('button', { type: 'button', class: 'btn btn-small btn-primary no-print', 'data-plan': 'approve', text: state === 'signed' ? 'Approve again' : 'Approve the plan' }),
  );
}

export function initProjectPlan() {
  const section = document.getElementById('sec-project-plan');
  if (!section) return;
  section.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-plan-go]')?.dataset.planGo;
    if (go) { goToNode(go); return; }
    const act = e.target.closest('[data-plan]')?.dataset.plan;
    const project = getState();
    if (act === 'copy') {
      const text = planText(project);
      try { await navigator.clipboard.writeText(text); } catch { /* shown below */ }
      await confirmAction({ title: 'Project plan', message: `Copied to the clipboard:\n\n${text}`, confirmLabel: 'Done' });
    }
    if (act === 'approve') {
      const empty = planSections(project).filter((s) => s.status === 'empty' && s.id !== 'approval');
      const signature = await requestSignature({
        title: `Approve the plan: ${project.projectName || 'this project'}`,
        statement: 'I approve this plan: its objectives, scope, deliverables, milestones, schedule and budget as written.',
        summary: [['Objective', project.objective], ['Due', project.dueDate], ['Budget', project.budgetPlanned], ['Empty sections', empty.map((s) => s.label).join(', ')]],
        content: planContent(project),
        name: project.charterSponsor || '',
        confirmLabel: 'Approve',
      });
      if (!signature) return;
      project.planApproval = signature;
      scheduleSave();
      renderProjectPlan();
      toast('Plan approved. Moving a commitment afterwards will ask for approval again.', 'success');
    }
  });
}
