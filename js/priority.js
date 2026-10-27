// Investment priority, derived from three scores on the charter.
//
// The scores are judgements someone typed; the priority is arithmetic on them,
// so it is computed wherever it is shown and never stored — one home for the
// inputs, no second copy of the answer to drift. The formula is the one most
// portfolio boards already use in some form: what it is worth (value plus how
// well it serves the strategy) over what it costs to do (effort). A project
// with any score missing is "Not scored", not zero: an unscored project has
// not been judged low priority, it has not been judged.

export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

function score(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= SCORE_MIN && n <= SCORE_MAX ? n : null;
}

/**
 * `{ score, band }` for a project whose value, fit and effort are all scored,
 * or null. Score runs from 0.4 (little value, lots of effort) to 10.
 */
export function priorityOf(project) {
  if (!project) return null;
  const value = score(project.charterValue);
  const fit = score(project.charterFit);
  const effort = score(project.charterEffort);
  if (value === null || fit === null || effort === null) return null;
  const n = Math.round(((value + fit) / effort) * 10) / 10;
  const band = n >= 4 ? 'High' : n >= 2 ? 'Medium' : 'Low';
  return { score: n, band };
}

/** "6.0 · High", or "Not scored". */
export function priorityLabel(priority) {
  return priority ? `${priority.score.toFixed(1)} · ${priority.band}` : 'Not scored';
}
