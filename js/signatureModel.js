// The signature record, with no DOM and no identity lookup, so the rules that
// read signatures (js/changeControl.js, the KPIs) run anywhere, Node included.
// js/signature.js is the part that knows who is signed in and draws the dialog.
//
// The fingerprint is FNV-1a over the content, the same hash sync uses. It is
// not cryptographic and does not need to be: its job is to notice that the
// signed words changed, and anyone able to forge a matching hash could just as
// well edit the stored one — the record is only as trustworthy as the project
// data it sits in, which SECURITY.md spells out.

import { hash, stableStringify } from './syncModel.js';

/** A drawn mark bigger than this is refused rather than bloating every sync. */
export const MAX_MARK_BYTES = 40000;

/** The fingerprint of whatever is being signed. Order-independent. */
export function fingerprint(content) {
  return hash(stableStringify(content));
}

/** Builds the record. `assurance` and `account` say how much the name can be trusted. */
export function createSignature({ name, statement, content, mark = '', comment = '', assurance = 'none', account = '' }) {
  const who = String(name || '').trim();
  if (!who) throw new Error('A signature needs a name.');
  if (mark && mark.length > MAX_MARK_BYTES) throw new Error('The drawn mark is too large to keep.');
  return {
    name: who,
    account,
    assurance,
    at: new Date().toISOString(),
    statement: String(statement || ''),
    comment: String(comment || '').trim(),
    hash: fingerprint(content),
    mark: mark || '',
  };
}

/**
 * 'signed' when the content still matches what was signed, 'changed' when it
 * does not, 'none' when there is no signature. A changed signature counts for
 * nothing anywhere that asks whether something is approved: fail closed.
 */
export function signatureState(signature, content) {
  if (!signature || !signature.hash) return 'none';
  return signature.hash === fingerprint(content) ? 'signed' : 'changed';
}
