import { useLayoutEffect, useMemo, useRef } from 'react';

import '../../extension/shared/js/icons.js';

import legacyFocusHtml from '../../extension/pages/focus/focus.html?raw';
import legacyTasksHtml from '../../extension/pages/tasks/tasks.html?raw';
import legacyCalendarHtml from '../../extension/pages/calendar/calendar.html?raw';
import legacySettingsHtml from '../../extension/pages/settings/settings.html?raw';
import legacyFontsCss from '../../extension/shared/styles/fonts.css?raw';
import legacyIconsCss from '../../extension/shared/styles/icons.css?raw';
import legacyGoogleSyncStatusCss from '../../extension/shared/styles/google-sync-status.css?raw';
import legacyFocusCss from '../../extension/pages/focus/styles.css?raw';
import legacyTasksCss from '../../extension/pages/tasks/styles.css?raw';
import legacyCalendarCss from '../../extension/pages/calendar/styles.css?raw';
import legacySettingsCss from '../../extension/pages/settings/styles.css?raw';

const pageDefinitions = {
  dashboard: {
    key: 'dashboard',
    html: legacyFocusHtml,
    css: legacyFocusCss
  },
  tasks: {
    key: 'tasks',
    html: legacyTasksHtml,
    css: legacyTasksCss
  },
  calendar: {
    key: 'calendar',
    html: legacyCalendarHtml,
    css: legacyCalendarCss
  },
  settings: {
    key: 'settings',
    html: legacySettingsHtml,
    css: legacySettingsCss
  }
};

const sharedLegacyCss = [
  legacyFontsCss,
  legacyIconsCss,
  legacyGoogleSyncStatusCss
].join('\n\n');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function bodyFromHtml(html) {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : html;
}

function rewriteLegacyAssetPaths(value) {
  return value
    .replaceAll('../../icons/icon128.png', '/assets/icon128.png')
    .replaceAll('../../icons/icon48.png', '/assets/icon48.png')
    .replaceAll('../../icons/icon16.png', '/assets/icon16.png')
    .replaceAll('../../shared/images/avatar-default.png', '/assets/avatar-default.png')
    .replaceAll('../../shared/images/avatar-student.png', '/assets/avatar-student.png')
    .replaceAll('../../shared/images/avatar-school.png', '/assets/avatar-school.png')
    .replaceAll('../../shared/images/avatar-focus.png', '/assets/avatar-focus.png')
    .replaceAll('../../shared/images/bg.jpg', '/assets/bg.jpg')
    .replaceAll('../../shared/images/', '/assets/')
    .replaceAll('../../fonts/', '/fonts/');
}

function sanitizeLegacyHtml(html) {
  return rewriteLegacyAssetPaths(bodyFromHtml(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ''));
}

function rewriteLegacyCss(css) {
  return rewriteLegacyAssetPaths(css);
}

function formatDateLabel(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
}

function isCompleted(task) {
  return task?.progress === 'completed' || task?.status === 'completed' || Boolean(task?.completed_at);
}

function taskDate(task) {
  return task?.due_date || task?.deadline || task?.start_date || '';
}

function taskMeta(task) {
  const parts = [];
  if (task?.schedule_time) parts.push(task.schedule_time);
  if (taskDate(task)) parts.push(`Due ${taskDate(task)}`);
  if (task?.priority) parts.push(task.priority);
  return parts.join(' · ');
}

function eventMeta(event) {
  const parts = [];
  if (event?.date) parts.push(event.date);
  if (event?.time_start || event?.time_end) parts.push(`${event.time_start || ''}${event.time_end ? `-${event.time_end}` : ''}`);
  if (event?.source) parts.push(event.source);
  return parts.join(' · ');
}

function listItemsHtml(items, emptyText, itemRenderer) {
  if (!items?.length) {
    return `<div class="empty-state legacy-empty-state"><span class="material-symbols-outlined">inbox</span><p>${escapeHtml(emptyText)}</p></div>`;
  }
  return items.map(itemRenderer).join('');
}

function getDateRange(selectedDate, days) {
  const start = new Date(`${selectedDate}T00:00:00`);
  const base = Number.isNaN(start.getTime()) ? new Date() : start;
  const weekday = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - weekday);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function setButtonActive(root, selector, predicate) {
  root.querySelectorAll(selector).forEach(element => {
    element.classList.toggle('active', Boolean(predicate(element)));
  });
}

function setDisplay(element, visible) {
  if (element) element.style.display = visible ? '' : 'none';
}

function bindEvent(element, eventName, handler) {
  if (element) element[`on${eventName}`] = handler;
}

function showLegacyToast(root, message, type = 'info') {
  root.querySelector('.timewhere-web-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type} timewhere-web-toast`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  root.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show', 'toast-show'));
  window.setTimeout(() => {
    toast.classList.remove('show', 'toast-show');
    window.setTimeout(() => toast.remove(), 300);
  }, 2200);
}

function renderSidebarState(root, { activeView, navigateToView, accountName, accountPicture, syncStateClass, syncStateLabel }) {
  root.querySelectorAll('.sidebar .nav-item[href]').forEach(link => {
    const href = link.getAttribute('href') || '';
    const isMoreLink = href === '#' && /^(更多|more)$/i.test(link.getAttribute('title') || '');
    let target = null;
    if (href.includes('focus')) target = 'dashboard';
    if (href.includes('tasks')) target = 'tasks';
    if (href.includes('calendar')) target = 'calendar';
    if (href.includes('settings')) target = 'settings';
    link.classList.toggle('active', target === activeView);
    if (target) {
      bindEvent(link, 'click', event => {
        event.preventDefault();
        navigateToView(target);
      });
    } else if (isMoreLink) {
      link.setAttribute('role', 'button');
      link.setAttribute('aria-label', '更多功能暂未开放');
      link.setAttribute('title', '更多功能暂未开放');
      bindEvent(link, 'click', event => {
        event.preventDefault();
        event.stopPropagation();
        showLegacyToast(root, '更多功能暂未开放', 'info');
      });
    }
  });
  const avatar = root.querySelector('.user-avatar');
  if (!avatar) return;
  if (accountPicture && avatar.tagName === 'IMG') {
    avatar.setAttribute('src', accountPicture);
  }
  avatar.setAttribute('title', syncStateLabel || accountName || 'Google account');
  avatar.classList.add('account-state-button', syncStateClass || 'disconnected');
  bindEvent(avatar, 'click', event => {
    event.preventDefault();
    navigateToView('settings');
  });
}

function renderDashboard(root, props) {
  const {
    dashboardProjection,
    todayProjection,
    tomorrowProjection,
    tasks,
    pendingCount,
    completedCount,
    syncStateLabel,
    accountName,
    onSelectTask,
    navigateToView,
    setSelectedDate
  } = props;
  const activeTasks = dashboardProjection?.currentTasks?.length ? dashboardProjection.currentTasks : tasks.filter(task => !isCompleted(task)).slice(0, 5);
  const nowContent = root.querySelector('.column-now .column-content');
  if (nowContent) {
    nowContent.innerHTML = `
      <div class="current-container-card">
        <span>Current container</span>
        <strong>${escapeHtml(dashboardProjection?.activeContainer?.name || '暂无当前容器')}</strong>
        <p>${escapeHtml(dashboardProjection?.activeContainer ? `${dashboardProjection.activeContainer.time_start || ''} - ${dashboardProjection.activeContainer.time_end || ''}` : '当前没有正在进行的时间容器。')}</p>
      </div>
      <div class="simple-task-list">
        ${listItemsHtml(activeTasks, '暂无当前任务', task => `
          <button class="simple-task-item" type="button" data-task-id="${escapeHtml(task.id)}">
            <strong>${escapeHtml(task.title)}</strong>
            <span>${escapeHtml(taskMeta(task))}</span>
          </button>
        `)}
      </div>
    `;
    nowContent.querySelectorAll('[data-task-id]').forEach(button => {
      bindEvent(button, 'click', () => onSelectTask(button.dataset.taskId));
    });
  }

  const renderProjection = projection => {
    const entries = [
      ...(projection?.events || []),
      ...(projection?.tasks || [])
    ].slice(0, 8);
    return listItemsHtml(entries, '暂无安排', item => `
      <div class="gcal-event ${item.title ? '' : 'is-empty'}">
        <span class="gcal-time">${escapeHtml(item.schedule_time || item.time_start || item.date || '')}</span>
        <strong>${escapeHtml(item.title || 'Untitled')}</strong>
      </div>
    `);
  };
  const todayNode = root.querySelector('#gcal-today') || root.querySelector('.gcal-container');
  if (todayNode) todayNode.innerHTML = renderProjection(todayProjection);
  const tomorrowNode = root.querySelector('#gcal-tomorrow');
  if (tomorrowNode) tomorrowNode.innerHTML = renderProjection(tomorrowProjection);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dateRange = root.querySelector('#cal-date-range');
  if (dateRange) dateRange.textContent = `${today.getMonth() + 1}/${today.getDate()} - ${tomorrow.getMonth() + 1}/${tomorrow.getDate()}`;
  root.querySelectorAll('.gcal-day-header').forEach((header, index) => {
    const date = index === 0 ? today : tomorrow;
    const name = header.querySelector('.day-name');
    const number = header.querySelector('.day-num');
    if (name) name.textContent = date.toLocaleDateString('zh-CN', { weekday: 'short' });
    if (number) number.textContent = String(date.getDate());
  });

  const weekTasks = tasks.filter(task => !isCompleted(task)).slice(0, 5);
  const total = pendingCount + completedCount;
  const totalNode = root.querySelector('.pie-total-num');
  if (totalNode) totalNode.textContent = String(total);
  const completedNode = root.querySelector('#legend-completed');
  const progressNode = root.querySelector('#legend-in-progress');
  const notStartedNode = root.querySelector('#legend-not-started');
  if (completedNode) completedNode.textContent = String(completedCount);
  if (progressNode) progressNode.textContent = String(tasks.filter(task => !isCompleted(task) && (task.progress === 'in_progress' || task.status === 'in_progress')).length);
  if (notStartedNode) notStartedNode.textContent = String(tasks.filter(task => !isCompleted(task) && task.progress !== 'in_progress' && task.status !== 'in_progress').length);
  const weekList = root.querySelector('.week-tasks-section .simple-task-list');
  if (weekList) {
    weekList.innerHTML = listItemsHtml(weekTasks, '暂无本周任务', task => `<button class="simple-task-item" type="button" data-task-id="${escapeHtml(task.id)}"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(taskMeta(task))}</span></button>`);
    weekList.querySelectorAll('[data-task-id]').forEach(button => bindEvent(button, 'click', () => onSelectTask(button.dataset.taskId)));
  }
  bindEvent(root.querySelector('[data-action="add-task"]'), 'click', () => navigateToView('tasks'));
  bindEvent(root.querySelector('[data-action="open-task-arrange-review"]'), 'click', () => navigateToView('tasks'));
  const calendarNav = root.querySelectorAll('.cal-actions .icon-btn');
  calendarNav.forEach((button, index) => bindEvent(button, 'click', () => {
    setSelectedDate?.(addDays(new Date().toISOString().slice(0, 10), index === 0 ? -1 : 1));
    navigateToView('calendar');
  }));
  const notificationButton = root.querySelector('.column-feed .column-header .icon-btn');
  bindEvent(notificationButton, 'click', () => navigateToView('settings'));

  const feedColumn = root.querySelector('.column-feed .column-content');
  if (feedColumn) {
    feedColumn.innerHTML = `
      <div class="feed-card">
        <span>Cloud</span>
        <strong>${escapeHtml(syncStateLabel)}</strong>
        <p>${escapeHtml(accountName)}</p>
      </div>
    `;
  }
}

function closeLegacyDialog(root) {
  const overlay = root.querySelector('#modalOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.innerHTML = '';
}

function openLegacyDialog(root, { title, content, confirmText = '保存', onConfirm }) {
  const overlay = root.querySelector('#modalOverlay');
  if (!overlay) return;
  overlay.innerHTML = `
    <div class="dialog">
      <div class="dialog-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="dialog-close-btn" type="button"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="dialog-body">${content}</div>
      <div class="dialog-actions">
        <button class="btn-dialog btn-dialog-cancel" type="button">取消</button>
        <button class="btn-dialog btn-dialog-confirm" type="button">${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;
  overlay.classList.add('open');
  const close = () => closeLegacyDialog(root);
  bindEvent(overlay.querySelector('.dialog-close-btn'), 'click', close);
  bindEvent(overlay.querySelector('.btn-dialog-cancel'), 'click', close);
  bindEvent(overlay, 'click', event => {
    if (event.target === overlay) close();
  });
  bindEvent(overlay.querySelector('.btn-dialog-confirm'), 'click', async () => {
    const accepted = await onConfirm?.(overlay);
    if (accepted !== false) close();
  });
  overlay.querySelector('input,select,textarea')?.focus();
}

function taskCreateDialogHtml({ plans, buckets, defaultPlanId = null, defaultBucketId = null }) {
  return `
    <div class="dialog-field"><label>任务名称</label><input class="dialog-input" name="title" autofocus></div>
    <div class="dialog-field"><label>Plan</label><select class="dialog-input" name="plan_id"><option value="">No plan</option>${plans.map(plan => `<option value="${escapeHtml(plan.id)}" ${String(plan.id) === String(defaultPlanId) ? 'selected' : ''}>${escapeHtml(plan.name)}</option>`).join('')}</select></div>
    <div class="dialog-field"><label>Bucket</label><select class="dialog-input" name="bucket_id"><option value="">No bucket</option>${buckets.map(bucket => `<option value="${escapeHtml(bucket.id)}" ${String(bucket.id) === String(defaultBucketId) ? 'selected' : ''}>${escapeHtml(bucket.name)}</option>`).join('')}</select></div>
    <div class="dialog-field"><label>开始日期</label><input class="dialog-input" type="date" name="start_date"></div>
    <div class="dialog-field"><label>截止日期</label><input class="dialog-input" type="date" name="due_date"></div>
    <div class="dialog-field"><label>定时时间</label><input class="dialog-input" type="time" name="schedule_time"></div>
    <div class="dialog-field"><label>预计时长（分钟）</label><input class="dialog-input" type="number" min="5" max="480" step="5" name="duration" value="45"></div>
    <div class="dialog-field"><label>优先级</label><select class="dialog-input" name="priority"><option value="urgent">Urgent</option><option value="important">Important</option><option value="medium" selected>Medium</option><option value="low">Low</option></select></div>
    <div class="dialog-field"><label>Notes</label><textarea class="dialog-input" name="notes" rows="3"></textarea></div>
  `;
}

function openTaskCreateDialog(root, props, defaults = {}) {
  openLegacyDialog(root, {
    title: '添加任务',
    content: taskCreateDialogHtml({
      plans: props.plans || [],
      buckets: props.buckets || [],
      defaultPlanId: defaults.plan_id,
      defaultBucketId: defaults.bucket_id
    }),
    confirmText: '添加',
    onConfirm: async overlay => {
      const title = overlay.querySelector('[name="title"]')?.value.trim();
      if (!title) return false;
      await props.onCreateTask({
        title,
        plan_id: overlay.querySelector('[name="plan_id"]')?.value || null,
        bucket_id: overlay.querySelector('[name="bucket_id"]')?.value || null,
        start_date: overlay.querySelector('[name="start_date"]')?.value || null,
        due_date: overlay.querySelector('[name="due_date"]')?.value || null,
        schedule_time: overlay.querySelector('[name="schedule_time"]')?.value || null,
        duration: Number(overlay.querySelector('[name="duration"]')?.value || 45),
        priority: overlay.querySelector('[name="priority"]')?.value || 'medium',
        notes: overlay.querySelector('[name="notes"]')?.value || null
      });
      return true;
    }
  });
}

function openPlanCreateDialog(root, props) {
  openLegacyDialog(root, {
    title: 'Create a plan',
    content: `
      <div class="dialog-field"><label>Plan name</label><input class="dialog-input" name="name" autofocus></div>
      <div class="dialog-field"><label>Color</label><input class="dialog-input" type="color" name="color" value="#2364aa"></div>
      <div class="dialog-field"><label>Icon</label><input class="dialog-input" name="icon_char" maxlength="2"></div>
    `,
    confirmText: 'Create',
    onConfirm: async overlay => {
      const name = overlay.querySelector('[name="name"]')?.value.trim();
      if (!name) return false;
      await props.onCreatePlan({
        name,
        color: overlay.querySelector('[name="color"]')?.value || '#2364aa',
        icon_char: overlay.querySelector('[name="icon_char"]')?.value || null
      });
      return true;
    }
  });
}
function openTaskFilterPanel(root, props) {
  root.querySelector('.filter-panel')?.remove();
  const button = root.querySelector('#btnFilter');
  if (!button) return;
  const panel = document.createElement('div');
  panel.className = 'filter-panel';
  panel.innerHTML = `
    <div class="filter-section"><h4>Priority</h4>
      ${['all', 'urgent', 'important', 'medium', 'low'].map(value => `<label class="filter-checkbox"><input type="radio" name="legacyPriorityFilter" value="${value}" ${props.taskPriorityFilter === value ? 'checked' : ''}> ${value === 'all' ? 'All priorities' : value}</label>`).join('')}
    </div>
    <div class="filter-section"><h4>Progress</h4>
      ${[['all', 'All'], ['pending', 'Pending'], ['completed', 'Completed']].map(([value, label]) => `<label class="filter-checkbox"><input type="radio" name="legacyProgressFilter" value="${value}" ${props.filter === value ? 'checked' : ''}> ${label}</label>`).join('')}
    </div>
    <div class="filter-actions"><button class="btn-dialog btn-dialog-cancel" id="filterClear" type="button">Clear all</button><button class="btn-dialog btn-dialog-confirm" id="filterApply" type="button">Apply</button></div>
  `;
  const rect = button.getBoundingClientRect();
  panel.style.top = `${rect.bottom + 4}px`;
  panel.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  root.appendChild(panel);
  bindEvent(panel.querySelector('#filterClear'), 'click', () => {
    props.setFilter('all');
    props.setTaskPriorityFilter('all');
    panel.remove();
  });
  bindEvent(panel.querySelector('#filterApply'), 'click', () => {
    props.setFilter(panel.querySelector('[name="legacyProgressFilter"]:checked')?.value || 'all');
    props.setTaskPriorityFilter(panel.querySelector('[name="legacyPriorityFilter"]:checked')?.value || 'all');
    panel.remove();
  });
}

function openTaskGroupMenu(root, props) {
  root.querySelector('.groupby-menu')?.remove();
  const button = root.querySelector('#btnGroupBy');
  if (!button) return;
  const menu = document.createElement('div');
  menu.className = 'groupby-menu';
  menu.innerHTML = [['due_date', 'Due date'], ['priority', 'Priority'], ['plan', 'Plan']].map(([value, label]) => `<button class="groupby-option ${props.taskGroupBy === value ? 'active' : ''}" type="button" data-groupby="${value}">${label}</button>`).join('');
  const rect = button.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  root.appendChild(menu);
  menu.querySelectorAll('[data-groupby]').forEach(option => bindEvent(option, 'click', () => {
    props.setTaskGroupBy(option.dataset.groupby);
    menu.remove();
  }));
}
function openPlanStructureDialog(root, props, plan, type) {
  const isBucket = type === 'bucket';
  const items = (isBucket ? props.buckets : props.labels).filter(item => !item.plan_id || String(item.plan_id) === String(plan.id));
  const create = isBucket ? props.onCreateBucket : props.onCreateLabel;
  const remove = isBucket ? props.onDeleteBucket : props.onDeleteLabel;
  openLegacyDialog(root, {
    title: `Manage ${isBucket ? 'buckets' : 'labels'} · ${plan.name}`,
    content: `
      <div class="dialog-field"><label>Existing</label><div class="manage-list">${items.length ? items.map(item => `<div class="manage-list-item"><span><i style="background:${escapeHtml(item.color || '#2364aa')}"></i>${escapeHtml(item.name)}</span><button type="button" data-remove-id="${escapeHtml(item.id)}"><span class="material-symbols-outlined">delete</span></button></div>`).join('') : '<p>No items</p>'}</div></div>
      <div class="dialog-field"><label>Name</label><input class="dialog-input" name="name" autofocus></div>
      <div class="dialog-field"><label>Color</label><input class="dialog-input" type="color" name="color" value="#2364aa"></div>
    `,
    confirmText: 'Add',
    onConfirm: async overlay => {
      const name = overlay.querySelector('[name="name"]')?.value.trim();
      if (!name) return false;
      await create({ name, color: overlay.querySelector('[name="color"]')?.value || '#2364aa', plan_id: plan.id });
      return true;
    }
  });
  const overlay = root.querySelector('#modalOverlay');
  overlay?.querySelectorAll('[data-remove-id]').forEach(button => bindEvent(button, 'click', async () => {
    const item = items.find(candidate => String(candidate.id) === String(button.dataset.removeId));
    if (!item || !window.confirm(`Delete ${item.name}?`)) return;
    await remove(item);
    closeLegacyDialog(root);
  }));
}

function openPlanContextMenu(root, props, plan, anchor) {
  root.querySelector('.plan-context-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'plan-context-menu';
  menu.innerHTML = `
    <button class="ctx-menu-item" type="button" data-action="move_top" disabled title="Cloud v1 尚无 Plan reorder API"><span class="material-symbols-outlined">vertical_align_top</span> Move top</button>
    <button class="ctx-menu-item" type="button" data-action="move_up" disabled title="Cloud v1 尚无 Plan reorder API"><span class="material-symbols-outlined">arrow_upward</span> Move up</button>
    <button class="ctx-menu-item" type="button" data-action="move_down" disabled title="Cloud v1 尚无 Plan reorder API"><span class="material-symbols-outlined">arrow_downward</span> Move down</button>
    <button class="ctx-menu-item" type="button" data-action="move_bottom" disabled title="Cloud v1 尚无 Plan reorder API"><span class="material-symbols-outlined">vertical_align_bottom</span> Move bottom</button>
    <div class="ctx-menu-divider"></div>
    <button class="ctx-menu-item" type="button" data-action="rename"><span class="material-symbols-outlined">edit</span> Rename</button>
    <button class="ctx-menu-item" type="button" data-action="buckets"><span class="material-symbols-outlined">view_column</span> Manage buckets</button>
    <button class="ctx-menu-item" type="button" data-action="labels"><span class="material-symbols-outlined">label</span> Manage labels</button>
    <div class="ctx-menu-divider"></div>
    <button class="ctx-menu-item ctx-menu-danger" type="button" data-action="delete"><span class="material-symbols-outlined">delete</span> Delete plan</button>
  `;
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;
  root.appendChild(menu);
  menu.querySelectorAll('[data-action]').forEach(button => bindEvent(button, 'click', () => {
    if (button.disabled) return;
    menu.remove();
    if (button.dataset.action === 'rename') {
      openLegacyDialog(root, {
        title: 'Rename plan',
        content: `<div class="dialog-field"><label>Plan name</label><input class="dialog-input" name="name" value="${escapeHtml(plan.name)}" autofocus></div>`,
        confirmText: 'Save',
        onConfirm: async overlay => {
          const name = overlay.querySelector('[name="name"]')?.value.trim();
          if (!name) return false;
          await props.onPatchPlan(plan, { name });
          return true;
        }
      });
    }
    if (button.dataset.action === 'buckets') openPlanStructureDialog(root, props, plan, 'bucket');
    if (button.dataset.action === 'labels') openPlanStructureDialog(root, props, plan, 'label');
    if (button.dataset.action === 'delete' && window.confirm(`Delete ${plan.name} and its linked structure?`)) props.onDeletePlan(plan);
  }));
}
function renderTaskCalendarMonths(tasks) {
  const today = new Date();
  const months = Array.from({ length: 13 }, (_, index) => new Date(today.getFullYear(), today.getMonth() - 1 + index, 1));
  const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return `<div class="task-calendar-months">${months.map(monthDate => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    const cells = [
      ...Array.from({ length: startOffset }, () => '<div class="task-calendar-spacer" aria-hidden="true"></div>'),
      ...Array.from({ length: lastDay }, (_, index) => {
        const day = index + 1;
        const date = new Date(year, month, day);
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const items = tasks.filter(task => [task.due_date, task.deadline, task.arranged_date, task.start_date].includes(dateKey)).slice(0, 4);
        return `<div class="task-calendar-day ${date.toDateString() === today.toDateString() ? 'today' : ''}" data-date="${dateKey}"><div class="task-calendar-date">${day}</div><div class="task-calendar-items">${items.map(task => {
          const type = (task.due_date || task.deadline) === dateKey ? 'due' : task.arranged_date === dateKey ? 'arranged' : 'start';
          return `<button type="button" class="task-calendar-item ${type} ${isCompleted(task) ? 'completed' : ''}" data-task-id="${escapeHtml(task.id)}"><span class="task-calendar-item-title">${escapeHtml(task.title)}</span><span class="task-calendar-item-type">${type === 'due' ? '结束' : type === 'arranged' ? '安排' : '开始'}</span></button>`;
        }).join('')}</div></div>`;
      })
    ].join('');
    return `<section class="task-calendar-month ${year === today.getFullYear() && month === today.getMonth() ? 'current-month' : ''}"><h3 class="task-calendar-month-title">${year}.${String(month + 1).padStart(2, '0')}</h3><div class="task-calendar-weekdays">${dayHeaders.map(day => `<div class="task-calendar-weekday">${day}</div>`).join('')}</div><div class="task-calendar-grid">${cells}</div></section>`;
  }).join('')}</div>`;
}
function renderTasks(root, props) {
  const {
    tasks,
    visibleTasks,
    plans,
    taskGroups,
    taskViewMode,
    taskScope,
    taskGroupBy,
    taskPriorityFilter,
    filter,
    search,
    selectedTask,
    canWrite,
    setTaskViewMode,
    setTaskScope,
    setFilter,
    setSearch,
    setTaskGroupBy,
    setTaskPriorityFilter,
    onSelectTask,
    onPatchTask,
    onDeleteTask,
    onCreateTask,
    onCreatePlan,
    navigateToView
  } = props;

  const plansList = root.querySelector('#plansList');
  if (plansList) {
    plansList.innerHTML = listItemsHtml(plans, 'No plans', plan => `
      <a href="#" class="context-item plan-link ${taskScope === `plan:${plan.id}` ? 'active' : ''}" data-plan-id="${escapeHtml(plan.id)}">
        <div class="subject-icon" style="background:${escapeHtml(plan.color || '#2b56e3')}">${escapeHtml(plan.icon_char || plan.name?.charAt(0) || 'P')}</div>
        ${escapeHtml(plan.name)}
        <button class="plan-menu-btn" type="button" data-plan-id="${escapeHtml(plan.id)}" title="Plan options"><span class="material-symbols-outlined">more_horiz</span></button>
      </a>
    `);
    plansList.querySelectorAll('.plan-link').forEach(link => {
      bindEvent(link, 'click', event => {
        event.preventDefault();
        if (event.target.closest('.plan-menu-btn')) return;
        setTaskScope(`plan:${link.dataset.planId}`);
      });
    });
    plansList.querySelectorAll('.plan-menu-btn').forEach(button => bindEvent(button, 'click', event => {
      event.preventDefault();
      event.stopPropagation();
      const plan = plans.find(item => String(item.id) === String(button.dataset.planId));
      if (plan) openPlanContextMenu(root, props, plan, button);
    }));
  }

  bindEvent(root.querySelector('#navMyDay'), 'click', event => { event.preventDefault(); setTaskScope('my_day'); });
  bindEvent(root.querySelector('#navMyTasks'), 'click', event => { event.preventDefault(); setTaskScope('my_tasks'); });
  bindEvent(root.querySelector('#navMyManageBac'), 'click', event => { event.preventDefault(); setTaskScope('my_managebac'); });
  bindEvent(root.querySelector('#btnCreatePlan'), 'click', event => { event.preventDefault(); openPlanCreateDialog(root, props); });
  bindEvent(root.querySelector('#btnCreatePlanAlt'), 'click', event => { event.preventDefault(); openPlanCreateDialog(root, props); });
  const manageBacSync = root.querySelector('#sidebarSyncManageBacBtn');
  if (manageBacSync) {
    manageBacSync.disabled = true;
    manageBacSync.title = 'WebDev 第一阶段未启用 ManageBac Connector。';
  }
  const plannerSnapshot = root.querySelector('#btnCopyPlannerDebugSnapshot');
  if (plannerSnapshot) {
    plannerSnapshot.disabled = true;
    plannerSnapshot.title = 'WebDev 诊断记录请在 Settings 的 Cloud 区域查看。';
  }

  setButtonActive(root, '.context-item', element => {
    if (element.id === 'navMyDay') return taskScope === 'my_day';
    if (element.id === 'navMyTasks') return taskScope === 'my_tasks';
    if (element.id === 'navMyManageBac') return taskScope === 'my_managebac';
    return false;
  });

  root.querySelectorAll('.btn-tab[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === taskViewMode);
    bindEvent(button, 'click', () => setTaskViewMode(button.dataset.view));
  });
  const searchInput = root.querySelector('#searchInput');
  if (searchInput) {
    searchInput.value = search;
    bindEvent(searchInput, 'input', event => setSearch(event.target.value));
  }
  bindEvent(root.querySelector('#btnFilter'), 'click', event => {
    event.preventDefault();
    openTaskFilterPanel(root, { ...props, filter, taskPriorityFilter, setFilter, setTaskPriorityFilter });
  });
  const groupBtn = root.querySelector('#btnGroupBy');
  if (groupBtn) {
    groupBtn.innerHTML = `<span class="material-symbols-outlined">group_work</span> Group by: ${escapeHtml(taskGroupBy === 'due_date' ? 'Due date' : taskGroupBy === 'priority' ? 'Priority' : 'Plan')}`;
    bindEvent(groupBtn, 'click', event => {
      event.preventDefault();
      openTaskGroupMenu(root, { ...props, taskGroupBy, setTaskGroupBy });
    });
  }

  const board = root.querySelector('#kanbanBoard');
  if (board) {
    board.innerHTML = taskGroups.map(group => `
      <div class="kanban-column planner-column" data-group="${escapeHtml(group.key)}">
        <div class="column-header planner-column-header">
          <div class="column-title"><h3>${escapeHtml(group.title)}</h3><span class="column-count">${group.tasks.length}</span></div>
        </div>
        <div class="planner-add-row"><button class="col-add-task planner-add-task" type="button" data-group="${escapeHtml(group.key)}"><span class="material-symbols-outlined">add</span><span>添加任务</span></button></div>
        <div class="column-body custom-scrollbar">${listItemsHtml(group.tasks, 'No tasks', task => taskCardHtml(task))}</div>
      </div>
    `).join('');
  }

  const list = root.querySelector('#taskListView');
  if (list) {
    list.innerHTML = `<div class="task-list">${listItemsHtml(visibleTasks, 'No tasks match this view.', task => `
      <article class="task-list-row ${isCompleted(task) ? 'completed' : ''}" data-task-id="${escapeHtml(task.id)}">
        <div class="task-list-main">
          <strong class="task-list-title">${escapeHtml(task.title)}</strong>
          <div class="task-list-meta">${escapeHtml(taskMeta(task))}</div>
        </div>
      </article>
    `)}</div>`;
  }

  const taskCalendar = root.querySelector('#taskCalendarView');
  if (taskCalendar) {
    taskCalendar.innerHTML = renderTaskCalendarMonths(visibleTasks);
  }

  setDisplay(board, taskViewMode === 'board');
  setDisplay(list, taskViewMode === 'list');
  setDisplay(taskCalendar, taskViewMode === 'calendar');
  setDisplay(root.querySelector('#noPlanState'), visibleTasks.length === 0);

  root.querySelectorAll('.col-add-task').forEach(button => {
    bindEvent(button, 'click', event => {
      event.preventDefault();
      const planId = taskScope?.startsWith('plan:') ? taskScope.slice(5) : null;
      openTaskCreateDialog(root, { ...props, onCreateTask }, { plan_id: planId });
    });
  });
  root.querySelectorAll('[data-task-id]').forEach(element => {
    bindEvent(element, 'click', () => onSelectTask(element.dataset.taskId));
  });
  root.querySelectorAll('[data-action="complete-task"]').forEach(button => {
    bindEvent(button, 'click', event => {
      event.stopPropagation();
      const task = tasks.find(item => item.id === button.dataset.taskId);
      if (task) onPatchTask(task, { progress: 'completed' });
    });
  });
  root.querySelectorAll('[data-action="delete-task"]').forEach(button => {
    bindEvent(button, 'click', event => {
      event.stopPropagation();
      const task = tasks.find(item => item.id === button.dataset.taskId);
      if (task) onDeleteTask(task);
    });
  });

  const panel = root.querySelector('#taskDetailPanel');
  if (panel) {
    panel.classList.toggle('open', Boolean(selectedTask));
    panel.innerHTML = selectedTask ? taskDetailHtml(selectedTask, { canWrite, plans, buckets: props.buckets || [], labels: props.labels || [] }) : '';
    if (selectedTask) {
      bindTaskDetailEvents(panel, selectedTask, {
        canWrite,
        plans,
        buckets: props.buckets || [],
        labels: props.labels || [],
        onPatchTask,
        onDeleteTask,
        onClose: () => onSelectTask(null)
      });
    }
  }
}

function taskCardHtml(task) {
  const completed = isCompleted(task);
  return `
    <article class="task-card kanban-task-card ${completed ? 'completed progress-done' : ''}" data-task-id="${escapeHtml(task.id)}">
      <div class="task-card-header">
        <strong class="task-title">${escapeHtml(task.title)}</strong>
        <button class="task-card-menu-btn" type="button">⋯</button>
      </div>
      <div class="task-card-footer">
        <span class="task-card-meta">${escapeHtml(taskMeta(task))}</span>
        <div class="task-status-badges">
          ${task.due_date || task.deadline ? `<span class="task-due-badge">${escapeHtml(task.due_date || task.deadline)}</span>` : ''}
          ${task.schedule_time ? `<span class="task-start-badge">${escapeHtml(task.schedule_time)}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button type="button" data-action="complete-task" data-task-id="${escapeHtml(task.id)}" ${completed ? 'disabled' : ''}><span class="material-symbols-outlined">check_circle</span></button>
        <button type="button" data-action="delete-task" data-task-id="${escapeHtml(task.id)}"><span class="material-symbols-outlined">delete</span></button>
      </div>
    </article>
  `;
}

function isManageBacTask(task) {
  return Boolean(task && (task.source === 'managebac' || task.source_type === 'managebac_ics' || task.readonly === true && task.managebac_subject));
}

function normalizeChecklist(task) {
  return Array.isArray(task?.checklist) ? task.checklist.map((item, index) => ({
    id: item?.id || `check_${index + 1}`,
    title: item?.title || item?.text || '',
    checked: Boolean(item?.checked || item?.completed)
  })) : [];
}

function taskDetailHtml(task, { canWrite, plans, buckets, labels }) {
  const manageBac = isManageBacTask(task);
  const checklist = normalizeChecklist(task);
  const selectedLabels = Array.isArray(task.labels) ? task.labels.map(String) : [];
  const plan = plans.find(item => String(item.id) === String(task.plan_id));
  const priorities = [
    ['urgent', 'Urgent'],
    ['important', 'Important'],
    ['medium', 'Medium'],
    ['low', 'Low']
  ];
  const progressOptions = [
    ['not_started', 'radio_button_unchecked', 'Not started'],
    ['in_progress', 'pending', 'In progress'],
    ['completed', 'check_circle', 'Completed']
  ];
  return `
    <div class="detail-header">
      <div class="detail-header-title"><h2>Task Details</h2>${manageBac ? '<span class="source-badge">ManageBac</span>' : ''}</div>
      <div class="detail-header-actions">
        <button type="button" class="task-detail-menu-btn" title="More task actions" disabled><span class="material-symbols-outlined">more_horiz</span></button>
        <button class="detail-close-btn" type="button" title="Close"><span class="material-symbols-outlined">close</span></button>
      </div>
    </div>
    <div class="detail-body custom-scrollbar">
      <div class="detail-field">
        <div class="detail-title ${manageBac ? 'source-readonly' : ''}" contenteditable="${canWrite && !manageBac}" data-field="title">${escapeHtml(task.title)}</div>
        ${manageBac ? '<p class="source-readonly-hint">ManageBac 来源标题、截止日期和来源元数据只读；本地执行字段可在 TimeWhere 更新。</p>' : ''}
      </div>
      <div class="detail-field"><label>Progress</label><div class="progress-picker">${progressOptions.map(([value, icon, label]) => `<button class="progress-option ${(task.progress || task.status || 'not_started') === value ? 'active' : ''}" type="button" data-progress="${value}" ${canWrite ? '' : 'disabled'}><span class="material-symbols-outlined">${icon}</span> ${label}</button>`).join('')}</div></div>
      <div class="detail-field detail-field-row">
        <div class="detail-field-half"><label>TimeWhere Plan</label><div class="detail-readonly-value">${escapeHtml(plan?.name || 'No plan')}</div></div>
        <div class="detail-field-half"><label>Subject</label><div class="detail-readonly-value">${escapeHtml(task.subject || plan?.subject || '')}</div></div>
      </div>
      <div class="detail-field"><label>Priority</label><div class="priority-picker">${priorities.map(([value, label]) => `<button class="priority-option ${(task.priority || 'medium') === value ? 'active' : ''}" type="button" data-priority="${value}" ${canWrite ? '' : 'disabled'}>${label}</button>`).join('')}</div></div>
      <div class="detail-field"><label>Bucket</label><select class="detail-select" data-field="bucket_id" ${canWrite ? '' : 'disabled'}><option value="">No bucket</option>${buckets.map(bucket => `<option value="${escapeHtml(bucket.id)}" ${String(bucket.id) === String(task.bucket_id) ? 'selected' : ''}>${escapeHtml(bucket.name)}</option>`).join('')}</select></div>
      <div class="detail-field detail-field-row">
        <div class="detail-field-half"><label>Start date</label><input type="date" class="detail-date" data-field="start_date" value="${escapeHtml(task.start_date || '')}" ${canWrite ? '' : 'disabled'}></div>
        <div class="detail-field-half"><label>Due date</label><input type="date" class="detail-date" data-field="due_date" value="${escapeHtml(task.due_date || task.deadline || '')}" ${canWrite && !manageBac ? '' : 'disabled'}></div>
      </div>
      <div class="detail-field detail-field-row">
        <div class="detail-field-half"><label>定时时间</label><input type="time" class="detail-date" data-field="schedule_time" value="${escapeHtml(task.schedule_time || '')}" ${canWrite ? '' : 'disabled'}></div>
        <div class="detail-field-half"><label>预计时长 (分钟)</label><input type="number" class="detail-date" data-field="duration" min="5" max="480" step="5" value="${escapeHtml(task.duration || 45)}" ${canWrite ? '' : 'disabled'}></div>
      </div>
      <div class="detail-field">
        <label>Checklist${checklist.length ? ` (${checklist.filter(item => item.checked).length}/${checklist.length})` : ''}</label>
        <div class="checklist-list" id="checklistItems">${checklist.map(item => `<div class="checklist-item" data-item-id="${escapeHtml(item.id)}"><input type="checkbox" class="checklist-checkbox" ${item.checked ? 'checked' : ''} ${canWrite ? '' : 'disabled'}><span class="checklist-text ${item.checked ? 'checked' : ''}">${escapeHtml(item.title)}</span><button class="checklist-delete" type="button" ${canWrite ? '' : 'disabled'}><span class="material-symbols-outlined">close</span></button></div>`).join('')}</div>
        <div class="checklist-add"><input type="text" class="checklist-add-input" id="checklistNewItem" placeholder="Add an item..." ${canWrite ? '' : 'disabled'}></div>
      </div>
      ${manageBac ? '' : `<div class="detail-field recurrence-detail-section"><label>周期任务</label><div class="recurrence-create-panel"><select class="detail-select" data-field="recurrence_frequency" ${canWrite ? '' : 'disabled'}><option value="none" ${!task.recurrence_frequency ? 'selected' : ''}>不重复</option><option value="weekly" ${task.recurrence_frequency === 'weekly' ? 'selected' : ''}>每周</option><option value="monthly" ${task.recurrence_frequency === 'monthly' ? 'selected' : ''}>每月</option></select><input type="number" class="detail-date recurrence-count-input" data-field="recurrence_count" min="2" max="12" value="${escapeHtml(task.recurrence_count || 2)}" ${canWrite && task.recurrence_frequency ? '' : 'disabled'}></div></div>`}
      <div class="detail-field"><label>Labels</label><div class="labels-picker">${labels.length ? labels.map(label => `<button class="label-chip ${selectedLabels.includes(String(label.id)) ? 'selected' : ''}" type="button" data-label-id="${escapeHtml(label.id)}" style="--label-color:${escapeHtml(label.color || '#2364aa')}" ${canWrite ? '' : 'disabled'}>${escapeHtml(label.name)}</button>`).join('') : '<span class="text-muted">No labels defined for this plan</span>'}</div></div>
      <div class="detail-field"><label>Notes</label><textarea class="detail-textarea" data-field="notes" rows="4" ${canWrite ? '' : 'disabled'}>${escapeHtml(task.notes || task.description || '')}</textarea></div>
    </div>
    <div class="detail-footer"><button class="btn-delete-task ${manageBac ? 'source-delete-disabled' : ''}" type="button" ${canWrite && !manageBac ? '' : 'disabled'}><span class="material-symbols-outlined">${manageBac ? 'lock' : 'delete'}</span> ${manageBac ? 'ManageBac 来源任务不能删除' : 'Delete task'}</button></div>
  `;
}

function bindTaskDetailEvents(panel, task, { canWrite, onPatchTask, onDeleteTask, onClose }) {
  bindEvent(panel.querySelector('.detail-close-btn'), 'click', onClose);
  if (!canWrite) return;
  const manageBac = isManageBacTask(task);
  const persist = patch => onPatchTask(task, patch);
  const title = panel.querySelector('[data-field="title"]');
  if (title && !manageBac) bindEvent(title, 'blur', () => {
    const value = title.textContent.trim();
    if (value && value !== task.title) persist({ title: value });
  });
  panel.querySelectorAll('.progress-option').forEach(button => bindEvent(button, 'click', () => persist({
    progress: button.dataset.progress,
    completed_at: button.dataset.progress === 'completed' ? new Date().toISOString() : null
  })));
  panel.querySelectorAll('.priority-option').forEach(button => bindEvent(button, 'click', () => persist({ priority: button.dataset.priority })));
  ['bucket_id', 'start_date', 'due_date', 'schedule_time', 'duration', 'recurrence_frequency', 'recurrence_count'].forEach(field => {
    const input = panel.querySelector(`[data-field="${field}"]`);
    if (!input || input.disabled) return;
    bindEvent(input, 'change', () => {
      const value = field === 'duration' || field === 'recurrence_count' ? Number(input.value || 0) : input.value || null;
      persist({ [field]: field === 'recurrence_frequency' && value === 'none' ? null : value });
    });
  });
  const checklist = normalizeChecklist(task);
  panel.querySelectorAll('.checklist-item').forEach(row => {
    const id = row.dataset.itemId;
    bindEvent(row.querySelector('.checklist-checkbox'), 'change', event => persist({ checklist: checklist.map(item => item.id === id ? { ...item, checked: event.target.checked } : item) }));
    bindEvent(row.querySelector('.checklist-delete'), 'click', () => persist({ checklist: checklist.filter(item => item.id !== id) }));
  });
  bindEvent(panel.querySelector('#checklistNewItem'), 'keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const value = event.target.value.trim();
    if (!value) return;
    persist({ checklist: [...checklist, { id: `check_${Date.now()}`, title: value, checked: false }] });
  });
  panel.querySelectorAll('.label-chip').forEach(button => bindEvent(button, 'click', () => {
    const current = Array.isArray(task.labels) ? task.labels.map(String) : [];
    const id = String(button.dataset.labelId);
    persist({ labels: current.includes(id) ? current.filter(item => item !== id) : [...current, id] });
  }));
  const notes = panel.querySelector('[data-field="notes"]');
  bindEvent(notes, 'blur', () => persist({ notes: notes.value }));
  bindEvent(panel.querySelector('.btn-delete-task'), 'click', () => {
    if (!manageBac && window.confirm('确定要删除这个任务吗？')) onDeleteTask(task);
  });
}
function calendarModalBodyHtml(event, date, canWrite) {
  const source = event || {};
  const repeat = source.repeat || source.payload?.repeat || 'none';
  const repeatDays = Array.isArray(source.repeat_days) ? source.repeat_days : source.payload?.repeat_days || [];
  return `
    ${event ? '<div class="type-readonly">类型：日程事件</div>' : '<div class="type-toggle" id="modalTypeToggle"><button class="type-btn" type="button" data-create-type="container">时间容器</button><button class="type-btn active" type="button" data-create-type="event">日程事件</button></div>'}
    <div class="form-group"><label>名称</label><input type="text" id="modalName" value="${escapeHtml(source.title || '')}" placeholder="输入事件名称" ${canWrite ? '' : 'disabled'}></div>
    <div class="form-group"><label>日期</label><input type="date" id="modalDate" value="${escapeHtml(source.date || date || '')}" ${canWrite ? '' : 'disabled'}></div>
    <div class="form-row" id="modalTimeRow">
      <div class="form-group"><label>开始</label><input type="time" id="modalStart" value="${escapeHtml(source.time_start || '09:00')}" ${canWrite ? '' : 'disabled'}></div>
      <div class="form-group"><label>结束</label><input type="time" id="modalEnd" value="${escapeHtml(source.time_end || '10:00')}" ${canWrite ? '' : 'disabled'}></div>
    </div>
    <div class="form-group"><label>重复</label><select id="modalRepeat" ${canWrite ? '' : 'disabled'}><option value="none" ${repeat === 'none' ? 'selected' : ''}>不重复</option><option value="daily" ${repeat === 'daily' ? 'selected' : ''}>每天</option><option value="weekday" ${repeat === 'weekday' ? 'selected' : ''}>工作日</option><option value="weekend" ${repeat === 'weekend' ? 'selected' : ''}>周末</option><option value="weekly" ${repeat === 'weekly' ? 'selected' : ''}>每周</option><option value="custom" ${repeat === 'custom' ? 'selected' : ''}>自定义</option></select></div>
    <div class="form-group"><label>重复星期（0-6）</label><input type="text" id="modalRepeatDays" value="${escapeHtml(repeatDays.join(','))}" placeholder="1,3,5" ${canWrite ? '' : 'disabled'}></div>
    <div class="form-row">
      <div class="form-group"><label>生效开始日期</label><input type="date" id="modalActiveStartDate" value="${escapeHtml(source.active_start_date || source.date || date || '')}" ${canWrite ? '' : 'disabled'}></div>
      <div class="form-group"><label>生效结束日期</label><input type="date" id="modalActiveEndDate" value="${escapeHtml(source.active_end_date || '')}" ${canWrite ? '' : 'disabled'}></div>
    </div>
  `;
}

function closeCalendarModal(root, onSelectEvent) {
  const modal = root.querySelector('#calModal');
  if (modal) modal.style.display = 'none';
  onSelectEvent?.(null);
}

function openCalendarModal(root, props, event = null, date = null) {
  const modal = root.querySelector('#calModal');
  if (!modal) return;
  const canWrite = props.canWrite;
  const selectedDate = date || event?.date || props.selectedDate;
  const title = root.querySelector('#calModalTitle');
  const body = root.querySelector('#calModalBody');
  const footer = root.querySelector('#calModalFooter');
  if (title) title.textContent = event ? '编辑日程' : '创建日程';
  if (body) body.innerHTML = calendarModalBodyHtml(event, selectedDate, canWrite);
  if (footer) {
    footer.innerHTML = `
      ${event ? '<button class="btn-delete" id="modalDelete" type="button">删除</button>' : ''}
      <button class="btn-cancel" id="modalCancel" type="button">取消</button>
      <button class="btn-save" id="modalSave" type="button" ${canWrite ? '' : 'disabled'}>保存</button>
    `;
  }
  modal.style.display = 'flex';
  const close = () => closeCalendarModal(root, props.onSelectEvent);
  bindEvent(root.querySelector('#calModalClose'), 'click', close);
  bindEvent(root.querySelector('#calModalBackdrop'), 'click', close);
  bindEvent(root.querySelector('#modalCancel'), 'click', close);
  root.querySelectorAll('#modalTypeToggle [data-create-type]').forEach(button => bindEvent(button, 'click', () => {
    if (button.dataset.createType === 'container') openCalendarContainerModal(root, props, null, selectedDate);
  }));
  bindEvent(root.querySelector('#modalDelete'), 'click', async () => {
    if (!event || !window.confirm('确定要删除这个日程吗？')) return;
    await props.onDeleteEvent(event);
    close();
  });
  bindEvent(root.querySelector('#modalSave'), 'click', async () => {
    const name = root.querySelector('#modalName')?.value.trim();
    const eventDate = root.querySelector('#modalDate')?.value;
    if (!name || !eventDate) return;
    const repeat = root.querySelector('#modalRepeat')?.value || 'none';
    const payload = {
      title: name,
      date: eventDate,
      time_start: root.querySelector('#modalStart')?.value || null,
      time_end: root.querySelector('#modalEnd')?.value || null,
      active_start_date: repeat === 'none' ? null : root.querySelector('#modalActiveStartDate')?.value || eventDate,
      active_end_date: repeat === 'none' ? null : root.querySelector('#modalActiveEndDate')?.value || null,
      repeat,
      repeat_days_text: root.querySelector('#modalRepeatDays')?.value || '',
      payload: {
        ...(event?.payload || {}),
        repeat,
        repeat_days: String(root.querySelector('#modalRepeatDays')?.value || '').split(/[ ,]+/).map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
      }
    };
    if (event) await props.onPatchEvent(event, payload);
    else await props.onCreateEvent(payload);
    close();
  });
  root.querySelector('#modalName')?.focus();
}

function containerAppliesOnDate(container, dateKey) {
  if (!container || container.enabled === false) return false;
  if (container.active_start_date && dateKey < container.active_start_date) return false;
  if (container.active_end_date && dateKey > container.active_end_date) return false;
  const day = new Date(`${dateKey}T00:00:00`).getDay();
  if (container.repeat === 'weekday') return day >= 1 && day <= 5;
  if (container.repeat === 'weekend') return day === 0 || day === 6;
  if (container.repeat === 'weekly') {
    const days = Array.isArray(container.days) ? container.days.map(Number) : [];
    return days.length ? days.includes(day) : day === new Date(`${container.active_start_date || dateKey}T00:00:00`).getDay();
  }
  if (container.repeat === 'once') return !container.active_start_date || container.active_start_date === dateKey;
  return true;
}

function calendarContainerHtml(container) {
  return `<div class="calendar-event container-event" data-container-id="${escapeHtml(container.id)}" style="--event-color:${escapeHtml(container.color || '#4A90D9')}"><strong>${escapeHtml(container.name)}</strong><span>${escapeHtml(`${container.time_start || ''}-${container.time_end || ''}`)}</span></div>`;
}

function openCalendarContainerModal(root, props, container = null, date = null) {
  const modal = root.querySelector('#calModal');
  if (!modal) return;
  const canWrite = props.canWrite;
  const source = container || {};
  const selectedDate = date || source.active_start_date || props.selectedDate;
  const title = root.querySelector('#calModalTitle');
  if (title) title.textContent = container ? '编辑日程' : '创建日程';
  const body = root.querySelector('#calModalBody');
  if (body) body.innerHTML = `
    ${container ? '<div class="type-readonly">类型：时间容器</div>' : '<div class="type-toggle" id="modalTypeToggle"><button class="type-btn active" type="button" data-create-type="container">时间容器</button><button class="type-btn" type="button" data-create-type="event">日程事件</button></div>'}
    <div class="form-group"><label>名称</label><input type="text" id="modalName" value="${escapeHtml(source.name || '')}" placeholder="输入容器名称" ${canWrite ? '' : 'disabled'}></div>
    <div class="form-row"><div class="form-group"><label>开始</label><input type="time" id="modalStart" value="${escapeHtml(source.time_start || '09:00')}" ${canWrite ? '' : 'disabled'}></div><div class="form-group"><label>结束</label><input type="time" id="modalEnd" value="${escapeHtml(source.time_end || '10:00')}" ${canWrite ? '' : 'disabled'}></div></div>
    <div class="form-row"><div class="form-group"><label>生效开始日期</label><input type="date" id="modalActiveStartDate" value="${escapeHtml(source.active_start_date || selectedDate)}" ${canWrite ? '' : 'disabled'}></div><div class="form-group"><label>生效结束日期</label><input type="date" id="modalActiveEndDate" value="${escapeHtml(source.active_end_date || '')}" ${canWrite ? '' : 'disabled'}></div></div>
    <div class="form-group"><label>重复</label><select id="modalRepeat" ${canWrite ? '' : 'disabled'}><option value="daily" ${source.repeat === 'daily' ? 'selected' : ''}>每天</option><option value="weekday" ${!source.repeat || source.repeat === 'weekday' ? 'selected' : ''}>工作日</option><option value="weekend" ${source.repeat === 'weekend' ? 'selected' : ''}>周末</option><option value="weekly" ${source.repeat === 'weekly' ? 'selected' : ''}>每周</option></select></div>
    <div class="form-group"><label>颜色</label><input type="color" id="modalColor" value="${escapeHtml(source.color || '#4A90D9')}" ${canWrite ? '' : 'disabled'}></div>
  `;
  const footer = root.querySelector('#calModalFooter');
  if (footer) footer.innerHTML = `${container ? '<button class="btn-delete" id="modalDelete" type="button">删除</button>' : ''}<button class="btn-cancel" id="modalCancel" type="button">取消</button><button class="btn-save" id="modalSave" type="button" ${canWrite ? '' : 'disabled'}>保存</button>`;
  modal.style.display = 'flex';
  const close = () => closeCalendarModal(root, null);
  bindEvent(root.querySelector('#calModalClose'), 'click', close);
  bindEvent(root.querySelector('#calModalBackdrop'), 'click', close);
  bindEvent(root.querySelector('#modalCancel'), 'click', close);
  root.querySelectorAll('#modalTypeToggle [data-create-type]').forEach(button => bindEvent(button, 'click', () => {
    if (button.dataset.createType === 'event') openCalendarModal(root, props, null, selectedDate);
  }));
  bindEvent(root.querySelector('#modalDelete'), 'click', async () => {
    if (!container || !window.confirm('确定要删除这个时间容器吗？')) return;
    await props.onDeleteContainer(container);
    close();
  });
  bindEvent(root.querySelector('#modalSave'), 'click', async () => {
    const name = root.querySelector('#modalName')?.value.trim();
    const timeStart = root.querySelector('#modalStart')?.value;
    const timeEnd = root.querySelector('#modalEnd')?.value;
    if (!name || !timeStart || !timeEnd || timeStart >= timeEnd) return;
    const payload = {
      name,
      time_start: timeStart,
      time_end: timeEnd,
      repeat: root.querySelector('#modalRepeat')?.value || 'weekday',
      color: root.querySelector('#modalColor')?.value || '#4A90D9',
      active_start_date: root.querySelector('#modalActiveStartDate')?.value || null,
      active_end_date: root.querySelector('#modalActiveEndDate')?.value || null,
      enabled: true
    };
    if (container) await props.onPatchContainer(container, payload);
    else await props.onCreateContainer(payload);
    close();
  });
}
function renderCalendar(root, props) {
  const {
    selectedDate,
    calendarViewMode,
    visibleEvents,
    tasks,
    containers,
    setSelectedDate,
    setCalendarViewMode,
    eventSearch,
    setEventSearch,
    onSelectTask,
    onSelectEvent,
    selectedEvent,
    navigateToView
  } = props;
  const currentDate = root.querySelector('#currentDate');
  if (currentDate) currentDate.textContent = formatDateLabel(selectedDate);
  bindEvent(root.querySelector('#btnToday'), 'click', () => setSelectedDate(new Date().toISOString().slice(0, 10)));
  bindEvent(root.querySelector('#btnPrev'), 'click', () => setSelectedDate(addDays(selectedDate, calendarViewMode === 'week' ? -7 : -30)));
  bindEvent(root.querySelector('#btnNext'), 'click', () => setSelectedDate(addDays(selectedDate, calendarViewMode === 'week' ? 7 : 30)));
  bindEvent(root.querySelector('#btnSearch'), 'click', () => setDisplay(root.querySelector('#searchBar'), true));
  bindEvent(root.querySelector('#searchClose'), 'click', () => setDisplay(root.querySelector('#searchBar'), false));
  const searchInput = root.querySelector('#searchInput');
  if (searchInput) {
    searchInput.value = eventSearch;
    bindEvent(searchInput, 'input', searchEvent => setEventSearch(searchEvent.target.value));
  }
  bindEvent(root.querySelector('#viewSelector'), 'click', () => {
    const dropdown = root.querySelector('#viewDropdown');
    setDisplay(dropdown, dropdown?.style.display === 'none');
  });
  root.querySelectorAll('#viewDropdown [data-view]').forEach(item => bindEvent(item, 'click', () => {
    setCalendarViewMode(item.dataset.view);
    setDisplay(root.querySelector('#viewDropdown'), false);
  }));
  const label = root.querySelector('#currentViewLabel');
  if (label) label.textContent = calendarViewMode === 'month' ? '月' : '周';
  setDisplay(root.querySelector('#weekView'), calendarViewMode === 'week');
  setDisplay(root.querySelector('#monthView'), calendarViewMode === 'month');

  const toolbarButtons = Array.from(root.querySelectorAll('.toolbar-right .tb-icon'));
  const helpButton = toolbarButtons.find(button => button.getAttribute('title') === '帮助');
  const settingsButton = toolbarButtons.find(button => button.getAttribute('title') === '设置');
  if (helpButton) {
    helpButton.disabled = true;
    helpButton.title = 'WebDev 帮助内容尚未迁入；控件按旧版保留。';
  }
  bindEvent(settingsButton, 'click', () => navigateToView('settings'));
  const debugButton = root.querySelector('#btnCopyCalendarDebugSnapshot');
  if (debugButton) {
    debugButton.disabled = true;
    debugButton.title = 'WebDev 诊断记录请在 Settings 的 Cloud 区域查看。';
  }

  const days = getDateRange(selectedDate, 7);
  const weekHeader = root.querySelector('#weekDaysHeader');
  if (weekHeader) weekHeader.innerHTML = days.map(day => `<div class="day-header"><span>${escapeHtml(formatDateLabel(day))}</span></div>`).join('');
  const timeAxis = root.querySelector('#timeAxis');
  if (timeAxis) timeAxis.innerHTML = Array.from({ length: 16 }, (_, index) => `<div class="time-label">${String(index + 7).padStart(2, '0')}:00</div>`).join('');
  const gridLines = root.querySelector('#gridLines');
  if (gridLines) gridLines.innerHTML = Array.from({ length: 16 }, () => '<div class="grid-line"></div>').join('');
  const weekColumns = root.querySelector('#weekColumns');
  if (weekColumns) {
    weekColumns.innerHTML = days.map(day => {
      const dayEvents = visibleEvents.filter(calendarEvent => calendarEvent.date === day);
      const dayTasks = tasks.filter(task => taskDate(task) === day);
      const dayContainers = containers.filter(container => containerAppliesOnDate(container, day));
      return `<div class="day-column" data-date="${escapeHtml(day)}">${[...dayContainers.map(container => calendarContainerHtml(container)), ...dayEvents.map(calendarEvent => calendarEventHtml(calendarEvent)), ...dayTasks.map(task => calendarTaskHtml(task))].join('')}</div>`;
    }).join('');
  }
  const allday = root.querySelector('#weekAlldayGrid');
  if (allday) allday.innerHTML = days.map(day => `<div class="allday-cell" data-date="${escapeHtml(day)}"></div>`).join('');
  const monthGrid = root.querySelector('#monthGrid');
  if (monthGrid) {
    monthGrid.innerHTML = getMonthGrid(selectedDate).map(day => {
      const dayEvents = visibleEvents.filter(calendarEvent => calendarEvent.date === day);
      const dayTasks = tasks.filter(task => taskDate(task) === day);
      const dayContainers = containers.filter(container => containerAppliesOnDate(container, day));
      return `<div class="month-cell" data-date="${escapeHtml(day)}"><div class="month-cell-date">${escapeHtml(day.slice(-2))}</div>${[...dayContainers.slice(0, 2).map(container => `<div class="month-event container-event" data-container-id="${escapeHtml(container.id)}">${escapeHtml(container.name)}</div>`), ...dayEvents.slice(0, 3).map(calendarEvent => `<div class="month-event" data-event-id="${escapeHtml(calendarEvent.id)}">${escapeHtml(calendarEvent.title)}</div>`), ...dayTasks.slice(0, 3).map(task => `<div class="month-task" data-task-id="${escapeHtml(task.id)}">${escapeHtml(task.title)}</div>`)].slice(0, 5).join('')}</div>`;
    }).join('');
  }
  root.querySelectorAll('[data-event-id]').forEach(element => bindEvent(element, 'click', clickEvent => {
    clickEvent.stopPropagation();
    onSelectEvent(element.dataset.eventId);
  }));
  root.querySelectorAll('[data-task-id]').forEach(element => bindEvent(element, 'click', clickEvent => {
    clickEvent.stopPropagation();
    onSelectTask(element.dataset.taskId);
  }));
  root.querySelectorAll('[data-container-id]').forEach(element => bindEvent(element, 'click', clickEvent => {
    clickEvent.stopPropagation();
    const container = containers.find(item => String(item.id) === String(element.dataset.containerId));
    if (container) openCalendarContainerModal(root, props, container, element.closest('[data-date]')?.dataset.date);
  }));
  root.querySelectorAll('.day-column,.allday-cell,.month-cell').forEach(cell => bindEvent(cell, 'dblclick', () => openCalendarContainerModal(root, props, null, cell.dataset.date)));
  bindEvent(root.querySelector('.calendar-container'), 'dblclick', event => {
    if (!event.target.closest('.day-column,.allday-cell,.month-cell,[data-event-id],[data-task-id],[data-container-id]')) openCalendarContainerModal(root, props, null, selectedDate);
  });
  const emptyState = root.querySelector('#calendarEmptyState');
  setDisplay(emptyState, visibleEvents.length === 0 && tasks.length === 0 && containers.length === 0);
  bindEvent(root.querySelector('.empty-state-link'), 'click', () => navigateToView('settings'));

  const initPanel = root.querySelector('#initPanel');
  ['#closeInitPanel', '#initSkipBtn'].forEach(selector => bindEvent(root.querySelector(selector), 'click', () => setDisplay(initPanel, false)));
  const initComplete = root.querySelector('#initCompleteBtn');
  if (initComplete) {
    initComplete.disabled = true;
    initComplete.title = 'WebDev 暂不支持旧版 ICS 初始化；请在 Settings 查看迁移状态。';
  }
  const uploadArea = root.querySelector('#icsUploadArea');
  if (uploadArea) {
    uploadArea.setAttribute('title', 'WebDev 暂不支持旧版 ICS 导入。');
    uploadArea.setAttribute('aria-disabled', 'true');
  }

  if (selectedEvent) openCalendarModal(root, props, selectedEvent, selectedEvent.date);
}
function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function getMonthGrid(selectedDate) {
  const date = new Date(`${selectedDate}T00:00:00`);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

function calendarEventHtml(event) {
  return `<div class="calendar-event" data-event-id="${escapeHtml(event.id)}"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(eventMeta(event))}</span></div>`;
}

function calendarTaskHtml(task) {
  return `<div class="calendar-task" data-task-id="${escapeHtml(task.id)}"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(taskMeta(task))}</span></div>`;
}

function renderSettings(root, props) {
  const {
    settingsDraft,
    setSettingsDraft,
    saveSettings,
    accountName,
    accountProfileName,
    googleButtonRef,
    syncStateLabel,
    cloudSessionStatus,
    hasSession,
    onSignOut,
    onRefreshCloud,
    onRefreshChanges,
    onRunMigration,
    migrationResult,
    plans,
    buckets,
    labels,
    containers,
    onCreateContainer,
    onPatchContainer,
    onDeleteContainer,
    navigateToView
  } = props;
  const assignValue = (selector, value) => {
    const element = root.querySelector(selector);
    if (element) element.value = value ?? '';
  };
  assignValue('#theme', settingsDraft.theme || 'light');
  assignValue('#weekStartsOn', settingsDraft.start_week_on ?? 1);
  assignValue('#tomatoDuration', settingsDraft.pomodoro_work || settingsDraft.tomato_duration || 25);
  assignValue('#appearanceBackground', settingsDraft.appearance_background || 'calm');
  assignValue('#appearanceAvatar', settingsDraft.appearance_avatar || 'default');
  assignValue('#defaultDuration', settingsDraft.default_duration || 45);
  assignValue('#defaultPriority', settingsDraft.default_priority || 'medium');
  const notificationEnabled = root.querySelector('#notificationEnabled');
  if (notificationEnabled) notificationEnabled.checked = settingsDraft.notification_enabled !== false;
  bindEvent(root.querySelector('#saveBtn'), 'click', saveSettings);
  const settingBindings = {
    theme: ['theme', value => value],
    weekStartsOn: ['start_week_on', value => Number(value)],
    tomatoDuration: ['pomodoro_work', value => Number(value)],
    appearanceBackground: ['appearance_background', value => value],
    appearanceAvatar: ['appearance_avatar', value => value],
    defaultDuration: ['default_duration', value => Number(value)],
    defaultPriority: ['default_priority', value => value]
  };
  Object.entries(settingBindings).forEach(([id, [key, normalize]]) => {
    bindEvent(root.querySelector(`#${id}`), 'change', event => setSettingsDraft(current => ({ ...current, [key]: normalize(event.target.value) })));
  });
  bindEvent(notificationEnabled, 'change', event => setSettingsDraft(current => ({
    ...current,
    notification_enabled: event.target.checked,
    reminders_enabled: event.target.checked
  })));
  bindEvent(root.querySelector('#importCalendarBtn'), 'click', () => setDisplay(root.querySelector('#importArea'), true));
  bindEvent(root.querySelector('#manageContainersBtn'), 'click', () => {
    const area = root.querySelector('#containerManageArea');
    setDisplay(area, area?.style.display === 'none');
  });
  bindEvent(root.querySelector('.empty-state-link'), 'click', () => navigateToView('settings'));

  const containerList = root.querySelector('#settingsContainerList');
  if (containerList) {
    containerList.innerHTML = containers.map(container => `
      <div class="container-item ${container.enabled === false ? 'disabled' : ''}">
        <div class="container-info"><span class="container-name">${escapeHtml(container.name)}</span><span class="container-time">${escapeHtml(`${container.time_start || ''} - ${container.time_end || ''} · ${container.repeat || 'daily'}`)}</span></div>
        <div class="container-actions">
          <label class="toggle-switch"><input type="checkbox" class="container-toggle" data-id="${escapeHtml(container.id)}" ${container.enabled !== false ? 'checked' : ''}><span class="toggle-slider"></span></label>
          <button class="delete" type="button" data-id="${escapeHtml(container.id)}"><span class="material-symbols-outlined">delete</span></button>
        </div>
      </div>
    `).join('');
    containerList.querySelectorAll('.container-toggle').forEach(toggle => bindEvent(toggle, 'change', () => {
      const container = containers.find(item => String(item.id) === String(toggle.dataset.id));
      if (container) onPatchContainer(container, { enabled: toggle.checked });
    }));
    containerList.querySelectorAll('.delete').forEach(button => bindEvent(button, 'click', () => {
      const container = containers.find(item => String(item.id) === String(button.dataset.id));
      if (container && window.confirm('确定要删除这个容器吗？')) onDeleteContainer(container);
    }));
  }
  const emptyState = root.querySelector('#containerEmptyState');
  if (emptyState) emptyState.style.display = containers.length ? 'none' : '';

  const markUnsupported = (selector, message) => {
    const element = root.querySelector(selector);
    if (!element) return;
    element.disabled = true;
    element.setAttribute('aria-disabled', 'true');
    element.title = message;
  };
  const webUnsupportedMessage = 'WebDev 当前不启用旧 Extension 本地导入能力；控件按旧版保留。';
  ['#selectFileBtn', '#importBtn', '#importMatrixViewBtn', '#settingsSaveManageBacIcsLinkBtn', '#settingsSyncManageBacBtn', '#testNotificationBtn', '#importJsonBtn', '#resetSettingsBtn']
    .forEach(selector => markUnsupported(selector, webUnsupportedMessage));
  const manageBacInput = root.querySelector('#settingsManageBacIcsLinkInput');
  if (manageBacInput) {
    manageBacInput.disabled = true;
    manageBacInput.title = 'ManageBac Connector 尚未进入 WebDev 第一阶段。';
  }
  const manageBacStatus = root.querySelector('#settingsManageBacSyncStatus');
  if (manageBacStatus) manageBacStatus.textContent = 'WebDev 第一阶段未启用 ManageBac Connector';
  const timetableStatus = root.querySelector('#timetableStatus');
  if (timetableStatus) timetableStatus.textContent = 'WebDev 当前不支持直接导入 ICS；可通过自动迁移保留旧数据';

  bindEvent(root.querySelector('#addContainerBtn'), 'click', () => {
    const modal = root.querySelector('#addContainerModal');
    if (!modal) return;
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date();
    end.setMonth(end.getMonth() + 1);
    const startInput = root.querySelector('#newContainerActiveStartDate');
    const endInput = root.querySelector('#newContainerActiveEndDate');
    if (startInput && !startInput.value) startInput.value = today;
    if (endInput && !endInput.value) endInput.value = end.toISOString().slice(0, 10);
    modal.style.display = 'flex';
  });
  const closeContainerModal = () => setDisplay(root.querySelector('#addContainerModal'), false);
  bindEvent(root.querySelector('#closeContainerModal'), 'click', closeContainerModal);
  bindEvent(root.querySelector('#cancelContainerBtn'), 'click', closeContainerModal);
  bindEvent(root.querySelector('#newContainerColorPicker'), 'click', event => {
    const option = event.target.closest('.color-option');
    if (!option) return;
    root.querySelectorAll('#newContainerColorPicker .color-option').forEach(item => item.classList.remove('active'));
    option.classList.add('active');
  });
  bindEvent(root.querySelector('#newContainerLayerToggle'), 'click', event => {
    const option = event.target.closest('.layer-btn');
    if (!option) return;
    root.querySelectorAll('#newContainerLayerToggle .layer-btn').forEach(item => item.classList.remove('active'));
    option.classList.add('active');
  });
  bindEvent(root.querySelector('#confirmAddContainer'), 'click', async () => {
    const name = root.querySelector('#newContainerName')?.value.trim();
    const timeStart = root.querySelector('#newContainerStart')?.value;
    const timeEnd = root.querySelector('#newContainerEnd')?.value;
    if (!name || !timeStart || !timeEnd || timeStart >= timeEnd) return;
    await onCreateContainer({
      name,
      time_start: timeStart,
      time_end: timeEnd,
      repeat: root.querySelector('#newContainerRepeat')?.value || 'weekday',
      color: root.querySelector('#newContainerColorPicker .color-option.active')?.dataset.color || '#4A90D9',
      layer: Number(root.querySelector('#newContainerLayerToggle .layer-btn.active')?.dataset.layer || 1),
      active_start_date: root.querySelector('#newContainerActiveStartDate')?.value || null,
      active_end_date: root.querySelector('#newContainerActiveEndDate')?.value || null,
      enabled: true
    });
    closeContainerModal();
  });

  bindEvent(root.querySelector('#exportBtn'), 'click', () => {
    const payload = {
      schema: 'timewhere-web-export-v1',
      exported_at: new Date().toISOString(),
      tasks: props.tasks || [],
      events: props.events || [],
      plans,
      buckets,
      labels,
      containers,
      settings: settingsDraft
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'timewhere-web-export.json';
    link.click();
    URL.revokeObjectURL(link.href);
  });
  const googleSection = root.querySelector('#googleSyncSection');
  if (googleSection) {
    googleSection.dataset.webdevCloudSection = 'true';
    const accountActions = googleSection.querySelector('.google-sync-account-actions');
    const accountDisplay = googleSection.querySelector('#googleSyncAccountEmail');
    const connectButton = googleSection.querySelector('#connectGoogleSyncBtn');
    const switchButton = googleSection.querySelector('#switchGoogleSyncAccountBtn');
    const disconnectButton = googleSection.querySelector('#disconnectGoogleSyncBtn');
    const revokeButton = googleSection.querySelector('#revokeGoogleSyncBtn');
    let googleSsoMount = googleSection.querySelector('#googleSsoButtonMount');

    if (hasSession) {
      googleSsoMount?.remove();
      googleSsoMount = null;
      if (accountDisplay) {
        accountDisplay.hidden = false;
        accountDisplay.textContent = `已连接：${accountName}`;
      }
      if (connectButton) connectButton.hidden = true;
      if (switchButton) switchButton.hidden = false;
      if (disconnectButton) disconnectButton.hidden = false;
    } else {
      if (accountDisplay) accountDisplay.hidden = true;
      if (connectButton) connectButton.hidden = true;
      if (switchButton) switchButton.hidden = true;
      if (disconnectButton) disconnectButton.hidden = true;
      if (!googleSsoMount && accountActions) {
        accountActions.insertAdjacentHTML('afterbegin', '<div id="googleSsoButtonMount" class="google-sso-button-mount"></div>');
        googleSsoMount = googleSection.querySelector('#googleSsoButtonMount');
      }
    }
    if (revokeButton) revokeButton.hidden = true;

    const googleStatus = googleSection.querySelector('#googleSyncStatus');
    if (googleStatus) {
      googleStatus.dataset.status = hasSession ? 'connected' : 'not_configured';
      googleStatus.textContent = hasSession ? '● Google 已连接' : '○ Google 未连接';
    }
    const accountDescription = googleSection.querySelector('.google-sync-card .setting-desc');
    if (accountDescription) accountDescription.textContent = 'Google 用于登录 TimeWhere Cloud；WebDev 不使用 Google Drive 作为数据源。';
    const autoStatus = googleSection.querySelector('#googleSyncAutoStatus');
    if (autoStatus) autoStatus.textContent = hasSession ? 'Cloud 同步：已连接' : 'Cloud 同步：等待登录';
    const lastSyncStatus = googleSection.querySelector('#googleSyncLastSyncAt');
    if (lastSyncStatus) lastSyncStatus.textContent = props.syncIncrementalStatus || '最近同步：暂无';

    const syncNowButton = googleSection.querySelector('#syncGoogleNowBtn');
    bindEvent(syncNowButton, 'click', onRefreshCloud);
    bindEvent(switchButton, 'click', onSignOut);
    bindEvent(disconnectButton, 'click', onSignOut);
    ['#uploadGoogleSyncBtn', '#restoreGoogleSyncBtn', '#clearGoogleSyncHistoryBtn', '#connectAndRestoreGoogleSyncBtn'].forEach(selector => {
      const button = googleSection.querySelector(selector);
      if (!button) return;
      button.disabled = true;
      button.title = 'WebDev 使用 TimeWhere Cloud，不使用 Google Drive 覆盖同步。';
    });
    const historyButton = googleSection.querySelector('#toggleGoogleSyncHistoryBtn');
    const historyPanel = googleSection.querySelector('#googleSyncHistoryPanel');
    bindEvent(historyButton, 'click', () => {
      if (!historyPanel) return;
      historyPanel.hidden = !historyPanel.hidden;
      const historyList = googleSection.querySelector('#googleSyncHistoryList');
      if (historyList) {
        historyList.innerHTML = `
          <div class="google-sync-history-item"><strong>Cloud session</strong><span>${escapeHtml(cloudSessionStatus)}</span></div>
          <div class="google-sync-history-item"><strong>Incremental cursor</strong><span>${escapeHtml(props.syncIncrementalStatus || 'Not loaded')} · ${escapeHtml(props.syncCursor ?? 0)}</span></div>
          <div class="google-sync-history-item"><strong>Migration</strong><span>${escapeHtml(migrationResult?.status || 'Not run')}</span></div>
        `;
      }
    });
    const conflictButton = googleSection.querySelector('#processGoogleConflictsBtn');
    if (conflictButton) {
      const conflictCount = Number(props.syncConflictRecords?.length || props.migrationConflicts?.length || 0);
      conflictButton.hidden = conflictCount === 0;
      conflictButton.textContent = `处理冲突 (${conflictCount})`;
      bindEvent(conflictButton, 'click', () => {
        const cloudCard = googleSection.querySelector('#webdevCloudSection');
        cloudCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    const syncGroup = googleSection.querySelector('.google-sync-group');
    if (syncGroup && !googleSection.querySelector('#webdevCloudSection')) {
      syncGroup.insertAdjacentHTML('beforeend', '<div class="google-sync-card" id="webdevCloudSection"></div>');
    }
    const cloudCard = googleSection.querySelector('#webdevCloudSection');
    if (cloudCard) {
      cloudCard.innerHTML = `
        <div class="google-sync-card-header">
          <span class="setting-label">TimeWhere Cloud</span>
          <span class="google-sync-status" data-status="${hasSession ? 'connected' : 'disconnected'}">${escapeHtml(syncStateLabel)}</span>
        </div>
        <div class="google-sync-meta-line">
          <span>${escapeHtml(accountProfileName)}</span>
          <span>${escapeHtml(cloudSessionStatus)}</span>
          <span>Read cache cursor: ${escapeHtml(props.syncCursor ?? 0)}</span>
          <span>${escapeHtml(props.syncIncrementalStatus || 'Not loaded')}</span>
          <span id="legacySsoStatus">${escapeHtml(props.ssoState?.message || 'Google SSO ready.')}</span>
          <span>结构概览：Plans ${plans.length} · Buckets ${buckets.length} · Labels ${labels.length} · Containers ${containers.length}</span>
        </div>
        <div class="google-sync-card-actions">
          <button class="action-btn" id="legacyRefreshCloudBtn" type="button">刷新 session</button>
          <button class="action-btn" id="legacyRefreshChangesBtn" type="button">刷新变更</button>
          <button class="action-btn" id="legacyRunMigrationBtn" type="button">运行迁移预览</button>
          <button class="action-btn danger" id="legacySignOutBtn" type="button" ${hasSession ? '' : 'disabled'}>断开本机 session</button>
        </div>
        ${migrationResult ? `<pre class="google-sync-debug-block">${escapeHtml(JSON.stringify(migrationResult, null, 2))}</pre>` : ''}
      `;
      bindEvent(cloudCard.querySelector('#legacyRefreshCloudBtn'), 'click', onRefreshCloud);
      bindEvent(cloudCard.querySelector('#legacyRefreshChangesBtn'), 'click', onRefreshChanges);
      bindEvent(cloudCard.querySelector('#legacyRunMigrationBtn'), 'click', onRunMigration);
      bindEvent(cloudCard.querySelector('#legacySignOutBtn'), 'click', onSignOut);
    }
  }
  const legacySsoStatus = root.querySelector('#legacySsoStatus');
  if (legacySsoStatus) {
    legacySsoStatus.textContent = props.ssoState?.message || 'Google SSO ready.';
  }

  if (googleButtonRef) {
    const googleSsoMount = root.querySelector('#googleSsoButtonMount');
    if (googleButtonRef.current !== googleSsoMount) {
      googleButtonRef.current = googleSsoMount;

    }
  }
}

export function LegacyPageShell(props) {
  const rootRef = useRef(null);
  const mountedHtmlRef = useRef(null);
  const definition = pageDefinitions[props.activeView] || pageDefinitions.dashboard;
  const html = useMemo(() => sanitizeLegacyHtml(definition.html), [definition.html]);
  const css = useMemo(() => rewriteLegacyCss(`${sharedLegacyCss}\n\n${definition.css}`), [definition.css]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (mountedHtmlRef.current !== html) {
      root.innerHTML = html;
      mountedHtmlRef.current = html;
    }
    renderSidebarState(root, props);
    if (definition.key === 'dashboard') renderDashboard(root, props);
    if (definition.key === 'tasks') renderTasks(root, props);
    if (definition.key === 'calendar') renderCalendar(root, props);
    if (definition.key === 'settings') renderSettings(root, props);
  });

  return (
    <>
      <style data-timewhere-legacy-css>{css}</style>
      <div
        ref={rootRef}
        className={`legacy-page-root legacy-page-${definition.key}`}
      />
    </>
  );
}
