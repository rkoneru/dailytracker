// Service & Support, plus Improvement & Lessons.
//
// This is the half of the app a developer, a tester or a service manager
// actually opens: what the service promises, whether it is fit to hand over,
// what is being released, what is being changed, what is known to be broken —
// and, on its own page, what should be different next time.
//
// Improvement and lessons sit together on purpose. CSI looks forward and a
// lesson looks back, so they stay two registers, but they answer the same
// question and keeping them apart is how the same sentence ends up in both.

import { getState } from './state.js';
import { mountRegisters, renderAll, renderRosterOptions } from './register.js';
import { SERVICE_REGISTERS, IMPROVE_REGISTERS } from './registerDefs.js';
import { notifyProjectDataChanged } from './taskModel.js';

const COUNTERS = [
  {
    id: 'svc-count-sla',
    label: 'Service levels breached',
    value: (s) => (s.serviceLevels || []).filter((l) => l.status === 'Breached').length,
    sub: (s) => {
      const atRisk = (s.serviceLevels || []).filter((l) => l.status === 'At Risk').length;
      const unmeasured = (s.serviceLevels || []).filter((l) => l.status === 'Not measured').length;
      if (atRisk > 0) return `${atRisk} more at risk`;
      if (unmeasured > 0) return `${unmeasured} not being measured`;
      return (s.serviceLevels || []).length > 0 ? 'All targets met' : 'No targets set yet';
    },
    tone: (s) => {
      const list = s.serviceLevels || [];
      if (list.length === 0) return 'is-idle';
      if (list.some((l) => l.status === 'Breached')) return 'is-bad';
      if (list.some((l) => l.status === 'At Risk')) return 'is-warn';
      return 'is-good';
    },
  },
  {
    id: 'svc-count-sac',
    label: 'Acceptance criteria met',
    value: (s) => {
      const list = s.sac || [];
      const met = list.filter((c) => c.status === 'Met' || c.status === 'Waived').length;
      return `${met}/${list.length}`;
    },
    sub: (s) => {
      const list = s.sac || [];
      if (list.length === 0) return 'No criteria defined yet';
      const failed = list.filter((c) => c.status === 'Failed').length;
      if (failed > 0) return `${failed} failed — not ready for go-live`;
      const open = list.filter((c) => c.status === 'Not Started' || c.status === 'In Progress').length;
      return open > 0 ? `${open} still to prove` : 'Ready for go-live';
    },
    tone: (s) => {
      const list = s.sac || [];
      if (list.length === 0) return 'is-idle';
      if (list.some((c) => c.status === 'Failed')) return 'is-bad';
      return list.every((c) => c.status === 'Met' || c.status === 'Waived') ? 'is-good' : 'is-warn';
    },
  },
  {
    id: 'svc-count-changes',
    label: 'Changes awaiting CAB',
    value: (s) => (s.changes || []).filter((c) => c.cab === 'Pending').length,
    sub: (s) => {
      const list = s.changes || [];
      if (list.length === 0) return 'None raised yet';
      const emergency = list.filter((c) => c.type === 'Emergency' && c.status !== 'Closed').length;
      return emergency > 0 ? `${emergency} emergency change${emergency === 1 ? '' : 's'} open` : 'No open emergency changes';
    },
    tone: (s) => {
      if ((s.changes || []).some((c) => c.type === 'Emergency' && c.status !== 'Closed')) return 'is-bad';
      return (s.changes || []).some((c) => c.cab === 'Pending') ? 'is-warn' : 'is-idle';
    },
  },
  {
    id: 'svc-count-kedb',
    label: 'Known errors open',
    value: (s) => (s.knownErrors || []).filter((k) => k.status !== 'Resolved').length,
    sub: (s) => {
      const open = (s.knownErrors || []).filter((k) => k.status !== 'Resolved');
      if (open.length === 0) return (s.knownErrors || []).length === 0 ? 'None recorded yet' : 'All resolved';
      const bare = open.filter((k) => !(k.workaround || '').trim()).length;
      return bare > 0 ? `${bare} with no workaround` : 'All have a workaround';
    },
    tone: (s) => {
      const open = (s.knownErrors || []).filter((k) => k.status !== 'Resolved');
      if (open.length === 0) return 'is-idle';
      return open.some((k) => !(k.workaround || '').trim()) ? 'is-bad' : 'is-warn';
    },
  },
  {
    id: 'improve-count-open',
    value: (s) => (s.csi || []).filter((c) => c.status === 'Approved' || c.status === 'In Progress').length,
    sub: (s) => {
      const list = s.csi || [];
      if (list.length === 0) return 'Nothing proposed yet';
      const quick = list.filter((c) => c.effort === 'S' && c.status !== 'Done' && c.status !== 'Rejected').length;
      return quick > 0 ? `${quick} small enough to just do` : `${list.filter((c) => c.status === 'Done').length} done so far`;
    },
    tone: (s) => ((s.csi || []).length === 0 ? 'is-idle' : 'is-good'),
  },
  {
    id: 'improve-count-lessons',
    value: (s) => (s.lessons || []).length,
    sub: (s) => {
      const list = s.lessons || [];
      if (list.length === 0) return 'Nothing captured yet';
      // A lesson nobody acted on is a lesson nobody learned, so the count that
      // matters is how many are still sitting at New.
      const idle = list.filter((l) => l.status === 'New').length;
      return idle > 0 ? `${idle} not acted on yet` : 'All agreed or applied';
    },
    tone: (s) => {
      const list = s.lessons || [];
      if (list.length === 0) return 'is-idle';
      return list.some((l) => l.status === 'New') ? 'is-warn' : 'is-good';
    },
  },
];

function renderCounters() {
  const state = getState();
  COUNTERS.forEach((c) => {
    const tile = document.getElementById(c.id);
    if (!tile) return;
    tile.querySelector('.kpi__value').textContent = String(c.value(state));
    tile.querySelector('.kpi__sub').textContent = c.sub(state);
    ['is-good', 'is-warn', 'is-bad', 'is-idle'].forEach((cls) => tile.classList.remove(cls));
    tile.classList.add(c.tone(state));
  });
}

export function renderService() {
  renderAll([...SERVICE_REGISTERS, ...IMPROVE_REGISTERS]);
  renderRosterOptions();
  renderCounters();
}

export function initService() {
  const onChanged = (def) => {
    renderCounters();
    notifyProjectDataChanged(`service:${def.id}`);
  };
  mountRegisters('service-registers', SERVICE_REGISTERS, onChanged);
  mountRegisters('improve-registers', IMPROVE_REGISTERS, onChanged);
  renderRosterOptions();
  renderCounters();
}
