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

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('data-') || key.startsWith('aria-') || key === 'role' || key === 'type') {
      node.setAttribute(key, value);
    } else node[key] = value;
  });
  children.forEach((child) => node.appendChild(child));
  return node;
}

function focusables(root) {
  return [...root.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.disabled && node.offsetParent !== null);
}

/**
 * The one place a dialog is actually built. `fields` turns it into a prompt;
 * with none it is a confirm.
 */
function present({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', tone = 'default', fields = [] }) {
  // Two dialogs at once would fight over focus, and the second's result would
  // be the only one anyone sees. Refuse rather than stack.
  if (openDialog) return Promise.resolve(null);

  const previouslyFocused = document.activeElement;

  return new Promise((resolve) => {
    const inputs = new Map();

    const form = el('form', { class: 'dialog__form' });
    fields.forEach((field) => {
      const input = el('input', {
        type: field.type || 'text',
        class: 'field-input',
        id: `dialog-field-${field.name}`,
        value: field.value || '',
        placeholder: field.placeholder || '',
      });
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
    ]);

    form.appendChild(el('div', { class: 'dialog__actions' }, [cancelBtn, confirmBtn]));

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
      if (fields.length === 0) { close(true); return; }
      const values = {};
      inputs.forEach((input, name) => { values[name] = input.value; });
      close(values);
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
