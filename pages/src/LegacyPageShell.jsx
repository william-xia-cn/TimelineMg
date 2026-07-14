import { useEffect, useMemo, useRef } from 'react';

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

function renderSidebarState(root, { activeView, navigateToView, accountName, accountPicture, syncStateClass, syncStateLabel }) {
  root.querySelectorAll('.sidebar .nav-item[href]').forEach(link => {
    const href = link.getAttribute('href') || '';
    let target = null;
    if (href.includes('focus')) target = 'dashboard';
    if (href.includes('tasks')) target = 'tasks';
    if (href.includes('calendar')) target = 'calendar';
    if (href.includes('settings')) target = 'settings';
    link.classList.toggle('active', target === activeView);
    if (target) {
      link.addEventListener('click', event => {
        event.preventDefault();
        navigateToView(target);
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
  avatar.addEventListener('click', event => {
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
    onSelectTask
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
      button.addEventListener('click', () => onSelectTask(button.dataset.taskId));
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

  const weekColumn = root.querySelector('.column-week .column-content');
  if (weekColumn) {
    weekColumn.innerHTML = `
      <div class="week-stats-section">
        <h3>本周进度</h3>
        <div class="week-stat-grid">
          <div><span>待办</span><strong>${pendingCount}</strong></div>
          <div><span>完成</span><strong>${completedCount}</strong></div>
          <div><span>今日</span><strong>${todayProjection?.counts?.tasks || 0}</strong></div>
        </div>
      </div>
    `;
  }

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

function renderTasks(root, props) {
  const {
    tasks,
    visibleTasks,
    plans,
    taskGroups,
    taskViewMode,
    taskScope,
    taskGroupBy,
    filter,
    search,
    selectedTask,
    canWrite,
    setTaskViewMode,
    setTaskScope,
    setFilter,
    setSearch,
    setTaskGroupBy,
    onSelectTask,
    onPatchTask,
    onDeleteTask,
    navigateToView
  } = props;

  const plansList = root.querySelector('#plansList');
  if (plansList) {
    plansList.innerHTML = listItemsHtml(plans, 'No plans', plan => `
      <a href="#" class="plan-item ${taskScope === `plan:${plan.id}` ? 'active' : ''}" data-plan-id="${escapeHtml(plan.id)}">
        <span class="plan-color" style="background:${escapeHtml(plan.color || '#cbd7e4')}"></span>
        <span>${escapeHtml(plan.name)}</span>
      </a>
    `);
    plansList.querySelectorAll('[data-plan-id]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        setTaskScope(`plan:${link.dataset.planId}`);
      });
    });
  }

  root.querySelector('#navMyDay')?.addEventListener('click', event => { event.preventDefault(); setTaskScope('my_day'); });
  root.querySelector('#navMyTasks')?.addEventListener('click', event => { event.preventDefault(); setTaskScope('my_tasks'); });
  root.querySelector('#navMyManageBac')?.addEventListener('click', event => { event.preventDefault(); setTaskScope('my_managebac'); });
  root.querySelector('#btnCreatePlan')?.addEventListener('click', event => { event.preventDefault(); navigateToView('settings'); });
  root.querySelector('#btnCreatePlanAlt')?.addEventListener('click', event => { event.preventDefault(); navigateToView('settings'); });

  setButtonActive(root, '.context-item', element => {
    if (element.id === 'navMyDay') return taskScope === 'my_day';
    if (element.id === 'navMyTasks') return taskScope === 'my_tasks';
    if (element.id === 'navMyManageBac') return taskScope === 'my_managebac';
    return false;
  });

  root.querySelectorAll('.btn-tab[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === taskViewMode);
    button.addEventListener('click', () => setTaskViewMode(button.dataset.view));
  });
  const searchInput = root.querySelector('#searchInput');
  if (searchInput) {
    searchInput.value = search;
    searchInput.addEventListener('input', event => setSearch(event.target.value));
  }
  root.querySelector('#btnFilter')?.addEventListener('click', event => {
    event.preventDefault();
    setFilter(filter === 'all' ? 'pending' : filter === 'pending' ? 'completed' : 'all');
  });
  const groupBtn = root.querySelector('#btnGroupBy');
  if (groupBtn) {
    groupBtn.innerHTML = `<span class="material-symbols-outlined">group_work</span> Group by: ${escapeHtml(taskGroupBy === 'due_date' ? 'Due date' : taskGroupBy === 'priority' ? 'Priority' : 'Plan')}`;
    groupBtn.addEventListener('click', event => {
      event.preventDefault();
      setTaskGroupBy(taskGroupBy === 'due_date' ? 'priority' : taskGroupBy === 'priority' ? 'plan' : 'due_date');
    });
  }

  const board = root.querySelector('#kanbanBoard');
  if (board) {
    board.innerHTML = taskGroups.map(group => `
      <div class="kanban-column planner-column" data-group="${escapeHtml(group.key)}">
        <div class="kanban-column-header planner-column-header">
          <h3>${escapeHtml(group.title)}</h3><span>${group.tasks.length}</span>
        </div>
        ${listItemsHtml(group.tasks, 'No tasks', task => taskCardHtml(task))}
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
    taskCalendar.innerHTML = `<div class="task-calendar-grid">${visibleTasks.slice(0, 21).map(task => `
      <article class="task-calendar-card" data-task-id="${escapeHtml(task.id)}">
        <strong>${escapeHtml(task.title)}</strong>
        <span>${escapeHtml(taskDate(task) || 'No date')}</span>
      </article>
    `).join('')}</div>`;
  }

  setDisplay(board, taskViewMode === 'board');
  setDisplay(list, taskViewMode === 'list');
  setDisplay(taskCalendar, taskViewMode === 'calendar');
  setDisplay(root.querySelector('#noPlanState'), visibleTasks.length === 0);

  root.querySelectorAll('[data-task-id]').forEach(element => {
    element.addEventListener('click', () => onSelectTask(element.dataset.taskId));
  });
  root.querySelectorAll('[data-action="complete-task"]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const task = tasks.find(item => item.id === button.dataset.taskId);
      if (task) onPatchTask(task, { progress: 'completed' });
    });
  });
  root.querySelectorAll('[data-action="delete-task"]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const task = tasks.find(item => item.id === button.dataset.taskId);
      if (task) onDeleteTask(task);
    });
  });

  const panel = root.querySelector('#taskDetailPanel');
  if (panel) {
    panel.classList.toggle('open', Boolean(selectedTask));
    panel.innerHTML = selectedTask ? taskDetailHtml(selectedTask, canWrite) : '';
    panel.querySelector('[data-action="close-detail"]')?.addEventListener('click', () => onSelectTask(null));
    panel.querySelector('[data-action="save-detail"]')?.addEventListener('click', () => {
      if (!selectedTask) return;
      const patch = {
        title: panel.querySelector('[name="title"]')?.value || selectedTask.title,
        notes: panel.querySelector('[name="notes"]')?.value || '',
        schedule_time: panel.querySelector('[name="schedule_time"]')?.value || null,
        duration: Number(panel.querySelector('[name="duration"]')?.value || selectedTask.duration || 45)
      };
      onPatchTask(selectedTask, patch);
    });
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

function taskDetailHtml(task, canWrite) {
  return `
    <div class="task-detail-content">
      <div class="task-detail-header">
        <h3>任务详情</h3>
        <button class="task-detail-close" type="button" data-action="close-detail">×</button>
      </div>
      <label class="detail-field"><span>Title</span><input name="title" value="${escapeHtml(task.title)}" ${canWrite ? '' : 'disabled'}></label>
      <label class="detail-field"><span>Schedule time</span><input name="schedule_time" type="time" value="${escapeHtml(task.schedule_time || '')}" ${canWrite ? '' : 'disabled'}></label>
      <label class="detail-field"><span>Duration</span><input name="duration" type="number" value="${escapeHtml(task.duration || 45)}" ${canWrite ? '' : 'disabled'}></label>
      <label class="detail-field"><span>Notes</span><textarea name="notes" ${canWrite ? '' : 'disabled'}>${escapeHtml(task.notes || task.description || '')}</textarea></label>
      <button class="action-btn" type="button" data-action="save-detail" ${canWrite ? '' : 'disabled'}>保存</button>
    </div>
  `;
}

function renderCalendar(root, props) {
  const {
    selectedDate,
    calendarViewMode,
    visibleEvents,
    tasks,
    setSelectedDate,
    setCalendarViewMode,
    eventSearch,
    setEventSearch,
    onSelectTask,
    onSelectEvent,
    openCalendarComposer
  } = props;
  const currentDate = root.querySelector('#currentDate');
  if (currentDate) currentDate.textContent = formatDateLabel(selectedDate);
  root.querySelector('#btnToday')?.addEventListener('click', () => setSelectedDate(new Date().toISOString().slice(0, 10)));
  root.querySelector('#btnPrev')?.addEventListener('click', () => setSelectedDate(addDays(selectedDate, calendarViewMode === 'week' ? -7 : -30)));
  root.querySelector('#btnNext')?.addEventListener('click', () => setSelectedDate(addDays(selectedDate, calendarViewMode === 'week' ? 7 : 30)));
  root.querySelector('#btnSearch')?.addEventListener('click', () => setDisplay(root.querySelector('#searchBar'), true));
  root.querySelector('#searchClose')?.addEventListener('click', () => setDisplay(root.querySelector('#searchBar'), false));
  const searchInput = root.querySelector('#searchInput');
  if (searchInput) {
    searchInput.value = eventSearch;
    searchInput.addEventListener('input', event => setEventSearch(event.target.value));
  }
  root.querySelector('#viewSelector')?.addEventListener('click', () => {
    const dropdown = root.querySelector('#viewDropdown');
    setDisplay(dropdown, dropdown?.style.display === 'none');
  });
  root.querySelectorAll('#viewDropdown [data-view]').forEach(item => {
    item.addEventListener('click', () => setCalendarViewMode(item.dataset.view));
  });
  const label = root.querySelector('#currentViewLabel');
  if (label) label.textContent = calendarViewMode === 'month' ? '月' : '周';
  setDisplay(root.querySelector('#weekView'), calendarViewMode === 'week');
  setDisplay(root.querySelector('#monthView'), calendarViewMode === 'month');

  const days = getDateRange(selectedDate, 7);
  const weekHeader = root.querySelector('#weekDaysHeader');
  if (weekHeader) {
    weekHeader.innerHTML = days.map(day => `<div class="day-header"><span>${escapeHtml(formatDateLabel(day))}</span></div>`).join('');
  }
  const timeAxis = root.querySelector('#timeAxis');
  if (timeAxis) timeAxis.innerHTML = Array.from({ length: 16 }, (_, index) => `<div class="time-label">${String(index + 7).padStart(2, '0')}:00</div>`).join('');
  const gridLines = root.querySelector('#gridLines');
  if (gridLines) gridLines.innerHTML = Array.from({ length: 16 }, () => '<div class="grid-line"></div>').join('');
  const weekColumns = root.querySelector('#weekColumns');
  if (weekColumns) {
    weekColumns.innerHTML = days.map(day => {
      const dayEvents = visibleEvents.filter(event => event.date === day);
      const dayTasks = tasks.filter(task => taskDate(task) === day);
      return `<div class="day-column" data-date="${escapeHtml(day)}">
        ${[...dayEvents.map(event => calendarEventHtml(event)), ...dayTasks.map(task => calendarTaskHtml(task))].join('')}
      </div>`;
    }).join('');
  }
  const allday = root.querySelector('#weekAlldayGrid');
  if (allday) {
    allday.innerHTML = days.map(day => `<div class="allday-cell">${escapeHtml(day)}</div>`).join('');
  }
  const monthGrid = root.querySelector('#monthGrid');
  if (monthGrid) {
    const monthDays = getMonthGrid(selectedDate);
    monthGrid.innerHTML = monthDays.map(day => {
      const dayEvents = visibleEvents.filter(event => event.date === day);
      const dayTasks = tasks.filter(task => taskDate(task) === day);
      return `<div class="month-cell" data-date="${escapeHtml(day)}">
        <div class="month-cell-date">${escapeHtml(day.slice(-2))}</div>
        ${[...dayEvents.slice(0, 2).map(event => `<div class="month-event" data-event-id="${escapeHtml(event.id)}">${escapeHtml(event.title)}</div>`), ...dayTasks.slice(0, 2).map(task => `<div class="month-task" data-task-id="${escapeHtml(task.id)}">${escapeHtml(task.title)}</div>`)].join('')}
      </div>`;
    }).join('');
  }
  root.querySelectorAll('[data-event-id]').forEach(element => element.addEventListener('click', () => onSelectEvent(element.dataset.eventId)));
  root.querySelectorAll('[data-task-id]').forEach(element => element.addEventListener('click', () => onSelectTask(element.dataset.taskId)));
  root.querySelector('.calendar-container')?.addEventListener('dblclick', () => openCalendarComposer());
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
    navigateToView
  } = props;
  const assignValue = (selector, value) => {
    const element = root.querySelector(selector);
    if (element) element.value = value ?? '';
  };
  assignValue('#theme', settingsDraft.theme || 'light');
  assignValue('#weekStartsOn', settingsDraft.week_start ?? 1);
  assignValue('#tomatoDuration', settingsDraft.tomato_duration || settingsDraft.default_duration || 25);
  assignValue('#defaultDuration', settingsDraft.default_duration || 45);
  assignValue('#defaultPriority', settingsDraft.default_priority || 'medium');
  root.querySelector('#saveBtn')?.addEventListener('click', saveSettings);
  root.querySelectorAll('select,input').forEach(input => {
    input.addEventListener('change', event => {
      const key = event.target.id;
      if (!key) return;
      setSettingsDraft(current => ({ ...current, [key]: event.target.value }));
    });
  });
  root.querySelector('#importCalendarBtn')?.addEventListener('click', () => setDisplay(root.querySelector('#importArea'), true));
  root.querySelector('#manageContainersBtn')?.addEventListener('click', () => setDisplay(root.querySelector('#containerManageArea'), true));
  root.querySelector('.empty-state-link')?.addEventListener('click', () => navigateToView('settings'));

  const containerList = root.querySelector('#settingsContainerList');
  if (containerList) {
    containerList.innerHTML = listItemsHtml(containers, '暂无时间容器', container => `
      <div class="container-item">
        <div><strong>${escapeHtml(container.name)}</strong><span>${escapeHtml(`${container.time_start || ''} - ${container.time_end || ''}`)}</span></div>
      </div>
    `);
  }
  const emptyState = root.querySelector('#containerEmptyState');
  if (emptyState) emptyState.style.display = containers.length ? 'none' : '';

  const cloudSection = root.querySelector('.content');
  if (cloudSection && !root.querySelector('#webdevCloudSection')) {
    cloudSection.insertAdjacentHTML('beforeend', `
      <section class="section" id="webdevCloudSection">
        <h2 class="section-title"><span class="material-symbols-outlined">cloud</span> 账户 / Cloud</h2>
        <div class="settings-group google-sync-group">
          <div class="google-sync-card">
            <div class="google-sync-card-header">
              <span class="setting-label">${escapeHtml(hasSession ? `已连接：${accountName}` : 'Google SSO 未连接')}</span>
              <span class="google-sync-status" data-status="${hasSession ? 'connected' : 'disconnected'}">${escapeHtml(hasSession ? 'connected' : 'not connected')}</span>
            </div>
            ${hasSession ? '' : '<div id="googleSsoButtonMount" class="google-sso-button-mount"></div>'}
            <div class="google-sync-meta-line">
              <span>${escapeHtml(accountProfileName)}</span>
              <span>${escapeHtml(syncStateLabel)}</span>
              <span>${escapeHtml(cloudSessionStatus)}</span>
              <span>Read cache cursor: ${escapeHtml(props.syncCursor ?? 0)}</span>
              <span>${escapeHtml(props.syncIncrementalStatus || "Not loaded")}</span>
            </div>
            <div class="google-sync-card-actions">
              <button class="action-btn" id="legacyRefreshCloudBtn" type="button">刷新 session</button>
              <button class="action-btn" id="legacyRefreshChangesBtn" type="button">刷新变更</button>
              <button class="action-btn" id="legacyRunMigrationBtn" type="button">运行迁移预览</button>
              <button class="action-btn danger" id="legacySignOutBtn" type="button">断开本机 session</button>
            </div>
          </div>
          <div class="google-sync-card">
            <div class="google-sync-card-header"><span class="setting-label">结构概览</span></div>
            <div class="google-sync-meta-line">
              <span>Plans ${plans.length}</span><span>Buckets ${buckets.length}</span><span>Labels ${labels.length}</span><span>Containers ${containers.length}</span>
            </div>
          </div>
          ${migrationResult ? `<pre class="google-sync-debug-block">${escapeHtml(JSON.stringify(migrationResult, null, 2))}</pre>` : ''}
        </div>
      </section>
    `);
    root.querySelector('#legacyRefreshCloudBtn')?.addEventListener('click', onRefreshCloud);
    root.querySelector('#legacyRefreshChangesBtn')?.addEventListener('click', onRefreshChanges);
    root.querySelector('#legacyRunMigrationBtn')?.addEventListener('click', onRunMigration);
    root.querySelector('#legacySignOutBtn')?.addEventListener('click', onSignOut);
  }
  if (googleButtonRef) {
    googleButtonRef.current = root.querySelector('#googleSsoButtonMount');
  }
}

export function LegacyPageShell(props) {
  const rootRef = useRef(null);
  const definition = pageDefinitions[props.activeView] || pageDefinitions.dashboard;
  const html = useMemo(() => sanitizeLegacyHtml(definition.html), [definition.html]);
  const css = useMemo(() => rewriteLegacyCss(`${sharedLegacyCss}\n\n${definition.css}`), [definition.css]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
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
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
