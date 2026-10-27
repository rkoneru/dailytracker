import { el } from './dom.js';

// In-page dialogs and toasts, replacing window.alert / confirm / prompt.
//
// Native dialogs block the event loop, look wrong in an installed PWA, can be
// suppressed outright by the browser, and force every test that touches one to
// register a handler before the click that triggers it. These are promise-based
// so calling code reads almost the same:
//
//     if (!(await confirmAction({ ... }))) return;
//
// The dialog is modal in the accessibility sense as well as the visual one:
// focus is trapped inside it, Escape cancels, and focus returns to whatever
// opened it.

const TOAST_MS = 4000;
let openDialog = null;

function focusables(root) {
  return [...root.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.disabled && node.offsetParent !== null);
}

/**
 * The one place a dialog is actually built. `fields` turns it into a prompt;
 * with none it is a confirm.
 */
function present({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', tone = 'default', fields = [], actions = [], details = [], choice = false }) {
  // Two dialogs at once would fight over focus, and the second's result would
  // be the only one anyone sees. Refuse rather than stack.
  if (openDialog) return Promise.resolve(null);

  const previouslyFocused = document.activeElement;

  return new Promise((resolve) => {
    const inputs = new Map();

    const form = el('form', { class: 'dialog__form' });
    fields.forEach((field) => {
      const input = field.options
        ? el('select', { class: 'field-input', id: `dialog-field-${field.name}` }, field.options.map((o) => el('option', { value: o.value, text: o.label })))
        : el('input', {
          type: field.type || 'text',
          class: 'field-input',
          id: `dialog-field-${field.name}`,
          value: field.value || '',
          placeholder: field.placeholder || '',
          required: !!field.required,
        });
      if (field.options) input.value = field.value || '';
      inputs.set(field.name, input);
      form.appendChild(el('label', { class: 'field-label field-label--block', htmlFor: input.id }, [
        document.createTextNode(field.label),
        input,
      ]));
    });

    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: cancelLabel });
    const confirmBtn = el('button', {
      type: 'submit',
      class: `btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`,
      text: confirmLabel,
    });

    const body = el('div', { class: 'dialog__body' }, [
      el('h2', { class: 'dialog__title', id: 'dialog-title', text: title }),
      ...(message ? [el('p', { class: 'dialog__message', text: message })] : []),
      ...(details.length ? [el('dl', { class: 'dialog__details' }, details.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]))] : []),
    ]);

    const collect = () => {
      const values = {};
      inputs.forEach((input, name) => { values[name] = input.value; });
      return values;
    };
    // Extra choices besides the main one. Each resolves { action, values };
    // one that needs the fields filled checks them first, as submit would.
    const extra = actions.map((a) => {
      const b = el('button', { type: 'button', class: `btn ${a.tone === 'danger' ? 'btn-danger' : 'btn-ghost'}`, 'data-dialog-action': a.value, text: a.label });
      b.addEventListener('click', () => {
        if (a.validate && !form.reportValidity()) return;
        close({ action: a.value, values: collect() });
      });
      return b;
    });
    form.appendChild(el('div', { class: 'dialog__actions' }, [cancelBtn, ...extra, confirmBtn]));

    const panel = el('div', {
      class: 'dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'dialog-title',
    }, [body, form]);

    const overlay = el('div', { class: 'dialog-overlay' }, [panel]);

    const close = (value) => {
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
      openDialog = null;
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      resolve(value);
    };

    function onKeyDown(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(null); return; }
      if (e.key !== 'Tab') return;
      // Trap: without this, Tab walks out into the page behind the dialog.
      const items = focusables(panel);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    cancelBtn.addEventListener('click', () => close(null));
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (choice) { close({ action: 'confirm', values: collect() }); return; }
      if (fields.length === 0) { close(true); return; }
      close(collect());
    });

    document.addEventListener('keydown', onKeyDown, true);
    document.body.appendChild(overlay);
    openDialog = overlay;

    // Land on the first field when there is one to fill, otherwise on the
    // action — never on Cancel, which would make Enter a no-op.
    const target = fields.length > 0 ? inputs.values().next().value : confirmBtn;
    target.focus();
    if (target.select) target.select();
  });
}

/** Resolves true when confirmed, false otherwise. Never rejects. */
export async function confirmAction(options) {
  return (await present(options)) === true;
}

/**
 * A dialog with more than one way out: `actions` adds buttons beside the main
 * one. Resolves { action, values } — `action` is 'confirm' for the main
 * button — or null if cancelled. `details` is a list of [label, value] pairs
 * shown above the fields.
 */
export async function chooseAction(options) {
  return present({ ...options, choice: true });
}

/** Resolves the entered string, or null if cancelled. */
export async function promptText({ title, message, label = 'Value', value = '', confirmLabel = 'Save' }) {
  const result = await present({
    title, message, confirmLabel, fields: [{ name: 'value', label, value }],
  });
  return result ? result.value : null;
}

// ---------- toasts ----------

function toastHost() {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = el('div', { class: 'toast-host', id: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  return host;
}

/**
 * A message that does not need an answer. `tone` is 'info' | 'success' |
 * 'error'; errors stay until dismissed, since they usually say something the
 * user has to act on.
 */
export function toast(message, tone = 'info') {
  const host = toastHost();
  const dismiss = el('button', { type: 'button', class: 'toast__close', 'aria-label': 'Dismiss', text: '✕' });
  const node = el('div', { class: `toast toast--${tone}` }, [
    el('span', { class: 'toast__text', text: message }),
    dismiss,
  ]);

  const remove = () => node.remove();
  dismiss.addEventListener('click', remove);
  host.appendChild(node);

  if (tone !== 'error') setTimeout(remove, TOAST_MS);
  return remove;
}
