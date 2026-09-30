// The risks that sink AI projects, checked against the RAID log. Pure.
//
// An AI project carries the ordinary risks and a set the old playbook does
// not have: data quality, privacy, lineage, bias, explainability, wrong or
// invented answers, drift after launch, regulation and misuse. This asks, for
// a project whose method is AI work, whether its log names each one — by the
// category a row was raised under, or by what its words say — and offers to
// raise the ones it does not. It never marks a category covered because
// nobody thought of it: an unexamined risk is the gap, not a pass.

export const AI_RISKS = [
  { id: 'data', label: 'Data quality', ask: 'Is the data complete, labelled and representative enough to learn from?', words: /data quality|missing data|incomplete data|dirty data|label(l)?ing|training data|representative/i },
  { id: 'privacy', label: 'Privacy and consent', ask: 'Does it use personal data, and is there a basis and a retention rule for it?', words: /privacy|personal data|\bpii\b|gdpr|consent|retention|anonymi[sz]/i },
  { id: 'lineage', label: 'Data lineage and access', ask: 'Do we know where each source came from, and is access granted rather than promised?', words: /lineage|provenance|data access|access to (the )?data|source systems?/i },
  { id: 'bias', label: 'Bias and fairness', ask: 'Could it treat some groups worse, and how would we know?', words: /\bbias|fairness|unfair|discriminat/i },
  { id: 'explain', label: 'Explainability', ask: 'Can we say why it gave an answer, to a user or an auditor?', words: /explain|interpretab|transparen|black box/i },
  { id: 'wrong', label: 'Hallucinations and wrong answers', ask: 'What happens when it is confidently wrong, and who catches it?', words: /hallucinat|wrong answer|confabulat|inaccura|accuracy|grounding|made[- ]up/i },
  { id: 'drift', label: 'Drift and retraining', ask: 'Who watches it after launch, and what triggers retraining?', words: /drift|retrain|degrad|decay|monitor(ing)? (the )?model/i },
  { id: 'regulation', label: 'Regulation', ask: 'Which rules apply — the AI Act, sector regulators — and what do they need from us?', words: /regulat|ai act|compliance|audit trail|conformity/i },
  { id: 'misuse', label: 'Security and misuse', ask: 'Could it be tricked, leak data, or be used for something it should not?', words: /prompt injection|jailbreak|misuse|abuse|data leak|security/i },
];

/**
 * For each AI risk: the RAID rows that cover it (raised under it, or naming
 * it), or none. Returns null for a project whose method is not AI work.
 */
export function aiRiskCoverage(project, method) {
  if (!method?.ai) return null;
  const rows = (project.raid || []).filter((r) => r.type === 'Risk' || r.type === 'Issue');
  return AI_RISKS.map((risk) => {
    const covering = rows.filter((r) => r.aiRisk === risk.id || risk.words.test(`${r.title || ''} ${r.action || ''}`));
    return { ...risk, covering, covered: covering.length > 0, open: covering.filter((r) => r.status !== 'Closed').length };
  });
}

/** The RAID row that raises an uncovered AI risk. */
export function aiRiskRow(risk, today) {
  return {
    type: 'Risk', title: `${risk.label}: ${risk.ask}`, owner: '', severity: 'High', likelihood: 'Medium',
    raised: today, closed: '', status: 'Open', due: '', action: '', aiRisk: risk.id,
  };
}
