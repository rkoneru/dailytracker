// "My week" on My Work: the weekly planning board for whoever "you are" is.
// Rules in js/weekBoard.js. The objectives, focus blocks, typed wins and
// review are saved on this device as they are typed; the projects, meetings
// and recorded wins are read off every project each time the board is drawn.

import { el } from './dom.js';
import { listFullProjects } from './state.js';
import { getMe } from './me.js';
import { weekOf, keyProjects, weekMeetings, weekWins, loadWeek, saveWeek } from './weekBoard.js';
import { formatDate } from './dates.js';
import { formatTime } from './meetingModel.js';

let shown = null;
let onGo = () => {};
const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri']];

export function renderWeekBoard() {
  const host = document.getElementById('week-board');
  if (!host) return;
  const week = weekOf(shown || new Date());
  const me = getMe();
  const projects = listFullProjects();
  const plan = loadWeek(week.key);
  document.getElementById('week-board-range').textContent = `${formatDate(week.from, 'day')} – ${formatDate(week.to, 'day')}`;
  const card = (n, title, sub, body) => el('section', { class: 'wb-card', 'data-wb': title.toLowerCase().replace(/\s+/g, '-') }, [
    el('header', {}, [el('span', { class: 'wb-card__n', text: String(n) }), el('strong', { text: title }), el('span', { class: 'hint', text: sub })]),
    ...body,
  ]);
  const projectsList = me ? keyProjects(projects, me) : [];
  const meetings = me ? weekMeetings(projects, me, week) : [];
  const wins = me ? weekWins(projects, me, week) : [];
  const dayName = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  host.replaceChildren(
    card(1, 'Weekly objectives', 'What will make this week a success?', [
      el('ol', { class: 'wb-objectives' }, plan.objectives.map((o, i) => el('li', {}, [
        el('input', { type: 'checkbox', 'data-wb-done': String(i), checked: !!o.done, 'aria-label': `Objective ${i + 1} done` }),
        el('input', { class: 'row-input', 'data-wb-objective': String(i), value: o.text, placeholder: ['Focus on high-impact work', 'Move a key goal forward', 'Keep balance and energy'][i], 'aria-label': `Objective ${i + 1}` }),
      ]))),
    ]),
    card(2, 'Key projects', 'The projects you have work on, by priority', [
      !me ? el('p', { class: 'hint', text: 'Say who you are above to see your projects.' })
        : el('table', { class: 'wb-table' }, [el('tbody', {}, projectsList.length ? projectsList.map((p) => el('tr', {}, [
          el('td', {}, [el('button', { type: 'button', class: 'link-btn', 'data-wb-project': p.id, text: p.name })]),
          el('td', { class: 'hint', text: p.priorityText }),
          el('td', { class: 'wb-progress' }, p.progress === null ? [el('span', { class: 'hint', text: 'no tasks' })] : [el('span', { class: 'wb-bar' }, [el('span', { style: `width:${p.progress}%` })]), el('span', { text: `${p.progress}%` })]),
        ])) : [el('tr', {}, [el('td', { class: 'hint', text: 'Nothing is in your name on any project.' })])])]),
    ]),
    card(3, 'Meetings', 'This week, where you are invited', [
      el('ul', { class: 'wb-list' }, meetings.length ? meetings.map((m) => el('li', {}, [
        el('span', { class: 'wb-day', text: dayName.format(new Date(`${m.date}T00:00:00`)) }),
        el('span', {}, [el('strong', { text: m.name }), el('span', { class: 'hint', text: ` · ${m.project}` })]),
        el('span', { class: 'hint', text: m.time ? formatTime(m.time) : 'all day' }),
      ])) : [el('li', { class: 'hint', text: me ? 'No meetings this week.' : 'Say who you are above.' })]),
    ]),
    card(4, 'Deep work', 'Protect your focus time', [
      el('div', { class: 'wb-focus' }, DAYS.map(([k, label]) => el('label', {}, [
        el('span', { class: 'wb-day', text: label }),
        el('textarea', { class: 'field-input', rows: 2, 'data-wb-focus': k, value: plan.focus[k] || '', placeholder: '08:00–10:30 on…', 'aria-label': `Focus block, ${label}` }),
      ]))),
    ]),
    card(5, 'Wins', 'Celebrate progress', [
      el('ul', { class: 'wb-list' }, wins.length ? wins.map((w) => el('li', {}, [el('span', { class: 'wb-day', text: w.kind }), el('span', { text: w.text }), el('span', { class: 'hint', text: w.project })]))
        : [el('li', { class: 'hint', text: 'Nothing recorded as finished in your name this week yet.' })]),
      el('textarea', { class: 'field-input', rows: 2, 'data-wb-field': 'wins', value: plan.wins, placeholder: 'Other wins worth remembering', 'aria-label': 'Other wins' }),
    ]),
    card(6, 'Weekly review', 'Look back before you plan the next one', [
      el('label', { class: 'charter-field' }, [el('span', { class: 'charter-field__label', text: 'What worked well?' }), el('textarea', { class: 'field-input', rows: 2, 'data-wb-field': 'worked', value: plan.worked })]),
      el('label', { class: 'charter-field' }, [el('span', { class: 'charter-field__label', text: 'What will I improve?' }), el('textarea', { class: 'field-input', rows: 2, 'data-wb-field': 'improve', value: plan.improve })]),
    ]),
  );
}

export function initWeekBoard(go) {
  if (go) onGo = go;
  const section = document.getElementById('sec-my-week');
  if (!section) return;
  const save = (mutate) => {
    const key = weekOf(shown || new Date()).key;
    const plan = loadWeek(key);
    mutate(plan);
    saveWeek(key, plan);
  };
  section.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.wbObjective !== undefined) save((p) => { p.objectives[Number(t.dataset.wbObjective)].text = t.value; });
    else if (t.dataset.wbFocus) save((p) => { p.focus[t.dataset.wbFocus] = t.value; });
    else if (t.dataset.wbField) save((p) => { p[t.dataset.wbField] = t.value; });
  });
  section.addEventListener('change', (e) => {
    if (e.target.dataset.wbDone !== undefined) save((p) => { p.objectives[Number(e.target.dataset.wbDone)].done = e.target.checked; });
  });
  section.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-wb-nav]')?.dataset.wbNav;
    if (nav !== undefined) {
      const base = shown || new Date();
      shown = nav === '0' ? null : new Date(base.getFullYear(), base.getMonth(), base.getDate() + Number(nav) * 7);
      renderWeekBoard();
      return;
    }
    const id = e.target.closest('[data-wb-project]')?.dataset.wbProject;
    if (id) onGo({ projectId: id, navId: 'tab-dashboard', rowId: '' });
  });
}
