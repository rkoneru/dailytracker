// The customer journey in layers: stages, the steps a customer takes in each,
// the touchpoints where they meet us, and which departments own each
// touchpoint. Pure.
//
// The map is the team's own — it starts from a template and is edited — so it
// is stored, on `project.journeyMap`. What is worked out from it is not: the
// count of touchpoints per stage, each department's share, and the gaps a
// journey map exists to find — a touchpoint nobody owns, a stage with no
// touchpoint, a department that touches the customer nowhere, and a
// touchpoint so many departments share that nobody does.

export const STAGE_TONES = ['navy', 'blue', 'green', 'red', 'orange'];
export const CROWDED = 4;

let seq = 0;
const nid = (p) => { seq += 1; return `${p}${Date.now().toString(36)}${seq.toString(36)}`; };

const D = (name) => ({ id: nid('dp'), name });
const T = (name, owners) => ({ id: nid('tp'), name, owners });

export function defaultJourneyMap() {
  const depts = ['Marketing', 'Sales', 'Product', 'Delivery', 'Customer success', 'Support', 'Finance', 'Legal'].map(D);
  const id = Object.fromEntries(depts.map((d) => [d.name, d.id]));
  const own = (...names) => names.map((n) => id[n]);
  return {
    departments: depts,
    stages: [
      { id: nid('st'), label: 'Awareness', steps: ['Has a need', 'Sees an ad or a post', 'Visits the site'], touchpoints: [T('Ads', own('Marketing')), T('Social', own('Marketing')), T('Blog', own('Marketing', 'Product')), T('Events', own('Marketing', 'Sales'))] },
      { id: nid('st'), label: 'Consideration', steps: ['Compares options', 'Books a demo', 'Asks for a price'], touchpoints: [T('Website', own('Marketing', 'Product')), T('Demo', own('Sales', 'Product')), T('Case studies', own('Marketing', 'Customer success')), T('Pricing', own('Sales', 'Finance'))] },
      { id: nid('st'), label: 'Acquisition', steps: ['Receives a proposal', 'Signs', 'Starts onboarding'], touchpoints: [T('Proposal', own('Sales')), T('Contract', own('Sales', 'Legal', 'Finance')), T('Kick-off', own('Delivery', 'Customer success')), T('First invoice', own('Finance'))] },
      { id: nid('st'), label: 'Service', steps: ['Uses it', 'Hits a problem', 'Asks for help'], touchpoints: [T('Help desk', own('Support')), T('Knowledge base', own('Support', 'Product')), T('Incident updates', own('Support', 'Delivery')), T('Check-in calls', own('Customer success'))] },
      { id: nid('st'), label: 'Loyalty', steps: ['Sees the value', 'Renews', 'Recommends us'], touchpoints: [T('NPS survey', own('Customer success')), T('Renewal', own('Customer success', 'Sales', 'Finance')), T('Referral', own('Marketing', 'Customer success')), T('Newsletter', own('Marketing'))] },
    ],
  };
}

export function journeyMapOf(project) {
  const m = project?.journeyMap;
  return m && Array.isArray(m.stages) && Array.isArray(m.departments) ? m : defaultJourneyMap();
}

/** Counts and gaps, worked out from the map. */
export function journeyAnalysis(map) {
  const known = new Set(map.departments.map((d) => d.id));
  const perStage = map.stages.map((s) => ({
    id: s.id, label: s.label,
    touchpoints: s.touchpoints.length,
    links: s.touchpoints.reduce((n, t) => n + (t.owners || []).filter((o) => known.has(o)).length, 0),
  }));
  const perDept = map.departments.map((d) => ({
    id: d.id, name: d.name,
    byStage: map.stages.map((s) => s.touchpoints.filter((t) => (t.owners || []).includes(d.id)).length),
  })).map((d) => ({ ...d, total: d.byStage.reduce((a, b) => a + b, 0) }));
  const gaps = [];
  map.stages.forEach((s) => {
    if (!s.touchpoints.length) gaps.push({ kind: 'stage', id: s.id, text: `${s.label} has no touchpoint — where does the customer meet us here?` });
    s.touchpoints.forEach((t) => {
      const owners = (t.owners || []).filter((o) => known.has(o));
      if (!owners.length) gaps.push({ kind: 'unowned', id: t.id, text: `${t.name || 'A touchpoint'} (${s.label}) has no department — nobody owns it.` });
      else if (owners.length >= CROWDED) gaps.push({ kind: 'crowded', id: t.id, text: `${t.name || 'A touchpoint'} (${s.label}) is shared by ${owners.length} departments — name the one that leads.` });
    });
  });
  perDept.filter((d) => d.total === 0).forEach((d) => gaps.push({ kind: 'idle', id: d.id, text: `${d.name} touches the customer nowhere on this map.` }));
  return { perStage, perDept, gaps, total: perStage.reduce((n, s) => n + s.touchpoints, 0) };
}

export { nid as journeyId };
