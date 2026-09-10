// The element builder every page module used to carry its own copy of.
//
// There were eight copies and four subtly different implementations — some
// routed `role` through setAttribute and some through the property, only one
// filtered falsy children — which is the kind of drift that produces a bug
// visible on exactly one page. This is the superset of all four:
//
//   - `class` and `text` are spelled the way they read in markup
//   - attributes that must exist in the DOM as attributes (data-*, aria-*,
//     role, type, tabindex) are set as attributes
//   - anything else is assigned as a property, so `hidden`, `htmlFor`,
//     `value`, `checked`, `selected` and event handlers behave as expected
//   - falsy children are skipped, so a caller can write
//     `[header, rows.length > 0 && table]` without guarding

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('data-') || key.startsWith('aria-')
      || key === 'role' || key === 'type' || key === 'tabindex') {
      node.setAttribute(key, value);
    } else node[key] = value;
  });
  children.filter(Boolean).forEach((child) => node.appendChild(child));
  return node;
}

/** `<td>`/`<li>` drag handle, identical everywhere it appears. */
export function dragHandle() {
  return el('span', { class: 'drag-handle', 'aria-hidden': 'true', title: 'Drag to reorder' },
    [document.createTextNode('⠿')]);
}
