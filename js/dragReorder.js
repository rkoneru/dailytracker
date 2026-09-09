// Native HTML5 drag-and-drop row reordering, shared by every draggable
// list/table in the app (milestones, gantt rows, tasks, dashboard tasks,
// notes). No library needed — just dragstart/dragover/drop wired onto the
// stable parent container, so it keeps working after the container's
// children are replaced by a re-render.

export function makeSortable(container, { itemSelector = '[data-id]', handleSelector = '.drag-handle', onDrop }) {
  let draggingId = null;

  container.addEventListener('dragstart', (e) => {
    const item = e.target.closest(itemSelector);
    if (!item || !e.target.closest(handleSelector)) {
      e.preventDefault();
      return;
    }
    draggingId = item.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    item.classList.add('is-dragging');
  });

  container.addEventListener('dragend', (e) => {
    e.target.closest(itemSelector)?.classList.remove('is-dragging');
    container.querySelectorAll('.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
    draggingId = null;
  });

  container.addEventListener('dragover', (e) => {
    if (!draggingId) return;
    const item = e.target.closest(itemSelector);
    if (!item || item.dataset.id === draggingId) return;
    e.preventDefault();
    container.querySelectorAll('.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
    item.classList.add('is-drop-target');
  });

  container.addEventListener('drop', (e) => {
    if (!draggingId) return;
    const target = e.target.closest(itemSelector);
    container.querySelectorAll('.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
    if (!target || target.dataset.id === draggingId) return;
    e.preventDefault();
    onDrop(draggingId, target.dataset.id);
  });
}

// Moves the item with id `draggedId` next to where `targetId` currently is:
// dropping on a later item lands right after it, dropping on an earlier
// item lands right before it — the natural result of removing the dragged
// item first and then re-inserting at the target's original index.
export function reorderById(array, draggedId, targetId) {
  const fromIndex = array.findIndex((item) => item.id === draggedId);
  const toIndex = array.findIndex((item) => item.id === targetId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
  const [item] = array.splice(fromIndex, 1);
  array.splice(toIndex, 0, item);
}
