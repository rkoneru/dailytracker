// Signatures: who approved what, exactly, and whether it has changed since.
//
// A signature here is an attestation, not cryptography. It records a typed
// name, the account that was signed in (if any), the moment, the sentence that
// was agreed to, and a fingerprint of the exact content it was agreed to. The
// fingerprint is what makes it worth having: edit the thing afterwards and the
// signature says "changed since signed" instead of quietly vouching for words
// nobody approved. An optional drawn mark is kept for printed packs — it looks
// like a signature on paper and proves nothing more than the typed name does.
//
// What it is not: tamper-proof. The record lives in the project data like
// everything else, so anyone who can edit the project can edit the record. The
// dialog says so, and says more plainly still when nobody is signed in or the
// account is a demo, because then the "who" is only what was typed.

import { el } from './dom.js';
import { getIdentity, isSignedIn, isDemo } from './identity.js';
import { createSignature as buildSignature, signatureState, fingerprint, MAX_MARK_BYTES } from './signatureModel.js';

export { signatureState, fingerprint, MAX_MARK_BYTES };

/**
 * How much the "who" can be trusted, in words the UI can show as they are:
 * an account on a real workspace, a demo account (invented, secures nothing),
 * or nobody signed in at all.
 */
export function currentAssurance() {
  if (!isSignedIn()) return { assurance: 'none', account: '' };
  const account = getIdentity().user?.email || '';
  return { assurance: isDemo() ? 'demo' : 'account', account };
}

/** Builds the record, stamped with whoever is signed in on this device. */
export function createSignature(fields) {
  return buildSignature({ ...fields, ...currentAssurance() });
}

export function assuranceText(signature) {
  if (!signature) return '';
  if (signature.assurance === 'account') return `signed in as ${signature.account}`;
  if (signature.assurance === 'demo') return `demo account ${signature.account} — not a real identity`;
  return 'not signed in — the name is as typed';
}

/** "Priya N. · 12 Sep 2026, 14:05 · signed in as priya@…" */
export function signatureLine(signature) {
  if (!signature) return '';
  const at = new Date(signature.at);
  const when = Number.isNaN(at.getTime()) ? '' : at.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return [signature.name, when, assuranceText(signature)].filter(Boolean).join(' · ');
}

/** A small read-only view of a signature: the line, the mark, and its state. */
export function signatureView(signature, content) {
  const state = signatureState(signature, content);
  if (state === 'none') return el('span', { class: 'sig sig--none', text: 'Not signed' });
  return el('div', { class: `sig sig--${state}` }, [
    signature.mark ? el('img', { class: 'sig__mark', src: signature.mark, alt: `Drawn signature of ${signature.name}` }) : null,
    el('span', { class: 'sig__line', text: signatureLine(signature) }),
    signature.comment ? el('span', { class: 'sig__comment', text: `“${signature.comment}”` }) : null,
    state === 'changed'
      ? el('span', { class: 'sig__stale', text: 'Changed since signed — this signature no longer counts' })
      : null,
  ]);
}

// ---------- The dialog ----------

let open = false;

/**
 * Asks for a signature and resolves the record, or null on Cancel. Nothing is
 * written by this function: the caller applies the record only once it has one.
 *
 * `summary` is the exact content being signed, shown as it will be fingerprinted
 * so the signer reads what they are agreeing to rather than a paraphrase.
 */
export function requestSignature({
  title, statement, summary = [], content, name = '', confirmLabel = 'Sign', tone = 'primary', askComment = false,
}) {
  if (open) return Promise.resolve(null);
  open = true;
  const previouslyFocused = document.activeElement;
  const { assurance, account } = currentAssurance();

  return new Promise((resolve) => {
    const nameInput = el('input', { class: 'field-input', id: 'sig-name', value: name, autocomplete: 'name' });
    const agree = el('input', { type: 'checkbox', id: 'sig-agree' });
    const comment = el('textarea', { class: 'field-input', id: 'sig-comment', rows: 2, placeholder: 'Why — kept with the decision' });
    const canvas = el('canvas', { class: 'sig-pad__canvas', width: 480, height: 140, 'aria-label': 'Draw a signature (optional)' });
    const error = el('p', { class: 'sig-dialog__error', role: 'alert', hidden: true });
    let drawn = false;

    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e1b4b';
    let last = null;
    const point = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      last = point(e);
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!last) return;
      const p = point(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      drawn = true;
    });
    const lift = () => { last = null; };
    canvas.addEventListener('pointerup', lift);
    canvas.addEventListener('pointercancel', lift);
    const clearBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', text: 'Clear' });
    clearBtn.addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; });

    const warning = assurance === 'account'
      ? `Recorded against ${account}. It is a record the app keeps, not a lock: anyone who can edit this project can edit the record.`
      : assurance === 'demo'
        ? 'This is a demo account, so the signature is recorded against an invented person. It secures nothing.'
        : 'Nobody is signed in, so the signature is only the name typed here. It secures nothing.';

    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
    const signBtn = el('button', { type: 'submit', class: `btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`, text: confirmLabel });

    const form = el('form', { class: 'dialog__form sig-dialog' }, [
      summary.length ? el('dl', { class: 'sig-dialog__summary' }, summary.flatMap(([k, v]) => [
        el('dt', { text: k }), el('dd', { text: v === '' || v === undefined || v === null ? '—' : String(v) }),
      ])) : null,
      el('label', { class: 'field-label field-label--block', htmlFor: 'sig-name' }, [document.createTextNode('Your name'), nameInput]),
      askComment ? el('label', { class: 'field-label field-label--block', htmlFor: 'sig-comment' }, [document.createTextNode('Comment'), comment]) : null,
      el('div', { class: 'sig-pad' }, [
        el('div', { class: 'sig-pad__head' }, [el('span', { class: 'field-label', text: 'Draw a signature (optional)' }), clearBtn]),
        canvas,
      ]),
      el('label', { class: 'sig-dialog__agree', htmlFor: 'sig-agree' }, [agree, el('span', { text: statement })]),
      el('p', { class: `sig-dialog__assurance is-${assurance}`, text: warning }),
      error,
      el('div', { class: 'dialog__actions' }, [cancelBtn, signBtn]),
    ]);

    const panel = el('div', { class: 'dialog dialog--wide', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sig-title' }, [
      el('div', { class: 'dialog__body' }, [el('h2', { class: 'dialog__title', id: 'sig-title', text: title })]),
      form,
    ]);
    const overlay = el('div', { class: 'dialog-overlay' }, [panel]);

    const close = (value) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      open = false;
      if (previouslyFocused?.focus) previouslyFocused.focus();
      resolve(value);
    };
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
    }
    const fail = (text) => { error.textContent = text; error.hidden = false; };

    cancelBtn.addEventListener('click', () => close(null));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!nameInput.value.trim()) { fail('Type your name.'); nameInput.focus(); return; }
      if (!agree.checked) { fail('Tick the statement to sign it.'); agree.focus(); return; }
      if (askComment && tone === 'danger' && !comment.value.trim()) { fail('Say why — a rejection with no reason cannot be acted on.'); comment.focus(); return; }
      try {
        close(createSignature({
          name: nameInput.value,
          statement,
          content,
          comment: askComment ? comment.value : '',
          mark: drawn ? canvas.toDataURL('image/png') : '',
        }));
      } catch (err) {
        fail(err.message);
      }
    });

    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    nameInput.focus();
    nameInput.select();
  });
}
