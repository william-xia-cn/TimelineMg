let currentView = 'week';
let currentDate = new Date();
const TIME_RANGE = { startHour: 6, endHour: 22, pxPerHour: 40 };

function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    await initApp();
    runCalendarArrangeCheck();
    runGoogleSyncCheck();
    setupCalendar();
    checkInitMode();

    // 从其他页面（如设置页面导入）切换回来时重新渲染
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            render();
        }
    });
});

function runGoogleSyncCheck() {
    if (typeof TimeWhereGoogleSync === 'undefined' || typeof TimeWhereDB === 'undefined') return;
    TimeWhereGoogleSync.runPageAutoSync(TimeWhereDB).catch(error => {
        console.warn('Google auto sync check failed:', error);
    });
}

async function runCalendarArrangeCheck() {
    if (!window.TimeWhereTaskArrangeAuto?.runTaskArrangeAutoReview || !window.TimeWhereDB) return;
    try {
        const result = await TimeWhereTaskArrangeAuto.runTaskArrangeAutoReview(TimeWhereDB, { source: 'calendar_auto' });
        if (result?.ran && !result.no_changes) await render();
    } catch (error) {
        console.warn('[Calendar] Arrange check skipped:', error);
    }
}

// ========== Calendar Diagnostics ==========

function sanitizeCalendarTask(task) {
    if (!task) return null;
    return {
        id: task.id || null,
        title: task.title || '',
        progress: task.progress || null,
        status: task.status || null,
        priority: task.priority || null,
        plan_id: task.plan_id ?? null,
        bucket_id: task.bucket_id ?? null,
        start_date: task.start_date || null,
        due_date: task.due_date || task.deadline || null,
        schedule_time: task.schedule_time || null,
        duration: task.duration ?? null,
        source: task.source || task.source_type || null,
        subject: task.subject || null,
        subject_in_matrixview: task.subject_in_matrixview || null,
        managebac_subject: task.managebac_subject || null,
        readonly: task.readonly === true,
        has_source_url: Boolean(task.source_url),
        checklist_count: Array.isArray(task.checklist) ? task.checklist.length : 0,
        checklist_checked_count: Array.isArray(task.checklist)
            ? task.checklist.filter(item => item && item.checked === true).length
            : 0,
        recurrence_series_id: task.recurrence_series_id || null,
        recurrence_index: task.recurrence_index || null,
        recurrence_count: task.recurrence_count || null,
        recurrence_frequency: task.recurrence_frequency || null
    };
}

function sanitizeCalendarPlan(plan) {
    if (!plan) return null;
    return {
        id: plan.id ?? null,
        name: plan.name || '',
        subject: plan.subject || null,
        subject_in_matrixview: plan.subject_in_matrixview || null,
        subject_active: plan.subject ? plan.subject_active !== false : null,
        matrixview_managed: plan.matrixview_managed === true,
        source: plan.source || null
    };
}

function sanitizeCalendarContainer(container) {
    if (!container) return null;
    return {
        id: container.id || null,
        name: container.name || '',
        type: container.type || null,
        layer: container.layer ?? null,
        enabled: container.enabled !== false,
        date: container.date || null,
        repeat: container.repeat || null,
        repeat_days: Array.isArray(container.repeat_days) ? container.repeat_days : null,
        time_start: container.time_start || null,
        time_end: container.time_end || null,
        color: container.color || null
    };
}

function sanitizeCalendarEvent(event) {
    if (!event) return null;
    return {
        id: event.id || null,
        title: event.title || event.name || '',
        source: event.source || null,
        type: event.type || null,
        date: event.date || null,
        time_start: event.time_start || null,
        time_end: event.time_end || null,
        all_day: event.all_day === true,
        subject: event.subject || null,
        subject_in_matrixview: event.subject_in_matrixview || null,
        repeat: event.repeat || null,
        repeat_days: Array.isArray(event.repeat_days) ? event.repeat_days : null,
        container_id: event.container_id || null,
        color: event.color || null
    };
}

function sanitizeCalendarArrangeChange(change) {
    if (!change) return null;
    const task = change.task || {};
    return {
        task_id: change.task_id || null,
        title: change.title || task.title || '',
        source: change.source || task.source || task.source_type || null,
        old_start_date: change.old_start_date || task.start_date || null,
        new_start_date: change.new_start_date || change.start_date || null,
        old_priority: change.old_priority || task.priority || null,
        new_priority: change.new_priority || change.priority || null,
        updates: {
            start_date: change.updates?.start_date || null,
            priority: change.updates?.priority || null
        }
    };
}

function sanitizeCalendarSettings(settings = {}) {
    const matrixMappings = Array.isArray(settings.matrixview_subject_mappings)
        ? settings.matrixview_subject_mappings.map(mapping => ({
            plan_name: mapping.plan_name || null,
            subject: mapping.subject || null,
            subject_in_matrixview: mapping.subject_in_matrixview || null,
            source: mapping.source || null,
            updated_at: mapping.updated_at || null
        }))
        : [];
    return {
        calendar_view: settings.calendar_view || null,
        task_arrange_dirty_at: settings.task_arrange_dirty_at || null,
        task_arrange_last_checked_at: settings.task_arrange_last_checked_at || null,
        task_arrange_last_run_at: settings.task_arrange_last_run_at || null,
        matrixview_subject_mappings: matrixMappings,
        managebac_pending_event_count: Array.isArray(settings.managebac_pending_event_mappings)
            ? settings.managebac_pending_event_mappings.length
            : 0
    };
}

function getCalendarVisibleRange() {
    if (currentView === 'week') {
        const start = getStartOfWeek(currentDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return {
            start: formatDateISO(start),
            end: formatDateISO(end)
        };
    }
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    return {
        start: formatDateISO(start),
        end: formatDateISO(end)
    };
}

function getCalendarDomSnapshot() {
    const eventCards = Array.from(document.querySelectorAll('.gcal-event, .month-event')).slice(0, 40).map(card => ({
        id: card.dataset.id || null,
        type: card.dataset.type || null,
        source: card.dataset.source || null,
        layer: card.dataset.layer || null,
        date: card.dataset.date || null,
        class_name: card.className || '',
        text: (card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
    }));
    const taskItems = Array.from(document.querySelectorAll('.container-task-item, .month-task-item')).slice(0, 40).map(item => ({
        task_id: item.dataset.taskId || null,
        class_name: item.className || '',
        text: (item.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    }));
    return {
        current_date_label: document.getElementById('currentDate')?.textContent?.trim() || '',
        view_panel: currentView,
        visible_events: eventCards,
        visible_task_items: taskItems
    };
}

async function buildCalendarDebugSnapshot() {
    const now = new Date();
    const [allTasks, plans, containers, events, settings] = await Promise.all([
        typeof TimeWhereDB.getAllTasks === 'function' ? TimeWhereDB.getAllTasks() : Promise.resolve([]),
        typeof TimeWhereDB.getPlans === 'function' ? TimeWhereDB.getPlans() : Promise.resolve([]),
        typeof TimeWhereDB.getContainers === 'function' ? TimeWhereDB.getContainers({ enabled: true }) : Promise.resolve([]),
        typeof TimeWhereDB.getEvents === 'function' ? TimeWhereDB.getEvents() : Promise.resolve([]),
        typeof TimeWhereDB.getSettings === 'function' ? TimeWhereDB.getSettings() : Promise.resolve({})
    ]);
    const range = getCalendarVisibleRange();
    const visibleEvents = expandEventsForDateRange(events || [], range.start, range.end);
    const visibleTasks = (allTasks || []).filter(task => {
        const due = task.due_date || task.deadline;
        const start = task.start_date;
        return (start && start >= range.start && start <= range.end)
            || (due && due >= range.start && due <= range.end);
    });

    let arrangePreview = null;
    if (window.TimeWhereScheduling?.arrangeTasks) {
        try {
            const preview = await TimeWhereScheduling.arrangeTasks(TimeWhereDB, now, { apply: false });
            arrangePreview = {
                proposed: preview.proposed || 0,
                summary: preview.summary || null,
                changes: (preview.changes || []).map(sanitizeCalendarArrangeChange)
            };
        } catch (error) {
            arrangePreview = { error: error.message || String(error) };
        }
    }

    return {
        schema: 'timewhere-calendar-debug-v1',
        generated_at: now.toISOString(),
        page: {
            url: window.location.href,
            title: document.title,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            today: formatDateISO(now),
            now_local: now.toString()
        },
        state: {
            current_view: currentView,
            current_date: formatDateISO(currentDate),
            visible_range: range
        },
        counts: {
            all_tasks: allTasks.length,
            visible_tasks: visibleTasks.length,
            plans: plans.length,
            enabled_containers: containers.length,
            events: events.length,
            timetable_events: events.filter(event => event.source === 'timetable').length,
            visible_events: visibleEvents.length
        },
        plans: plans.map(sanitizeCalendarPlan),
        containers: containers.map(sanitizeCalendarContainer),
        visible_tasks: visibleTasks.map(sanitizeCalendarTask),
        all_tasks: allTasks.map(sanitizeCalendarTask),
        visible_events: visibleEvents.map(sanitizeCalendarEvent),
        events: events.map(sanitizeCalendarEvent),
        settings: sanitizeCalendarSettings(settings),
        arrange_preview: arrangePreview,
        dom: getCalendarDomSnapshot()
    };
}

async function copyCalendarDebugSnapshot(button = null) {
    try {
        if (button) button.disabled = true;
        const snapshot = await buildCalendarDebugSnapshot();
        const text = JSON.stringify(snapshot, null, 2);
        await navigator.clipboard.writeText(text);
        showToast('Calendar 诊断快照已复制，可直接粘贴给我', 'success');
    } catch (error) {
        console.error('[Calendar] debug snapshot failed:', error);
        showToast(`复制诊断快照失败：${error.message}`, 'error');
    } finally {
        if (button) button.disabled = false;
    }
}

async function initApp() {
    if (typeof TimeWhereDB !== 'undefined') {
        await TimeWhereDB.initDefaultSettings();
        const savedView = await TimeWhereDB.getSetting('calendar_view');
        if (savedView === 'week' || savedView === 'month') {
            currentView = savedView;
            document.getElementById('currentViewLabel').textContent = savedView === 'week' ? '周' : '月';
        }
    }
    render();
}

async function render() {
    updateCurrentDateDisplay();
    if (currentView === 'week') {
        renderWeekView();
    } else {
        renderMonthView();
    }
    await checkCalendarEmptyState();
}

async function checkCalendarEmptyState() {
    const emptyEl = document.getElementById('calendarEmptyState');
    const weekView = document.getElementById('weekView');
    const monthView = document.getElementById('monthView');
    if (!emptyEl) return;

    // Empty guide should not intercept blank-grid creation clicks.
    emptyEl.onclick = null;
    emptyEl.style.cursor = 'default';

    const containers = await TimeWhereDB.getContainers({ enabled: true });
    const events = await TimeWhereDB.db.events.count();
    const hasData = (containers && containers.length > 0) || events > 0;

    if (hasData) {
        emptyEl.style.display = 'none';
        if (weekView) weekView.style.opacity = '1';
        if (monthView) monthView.style.opacity = '1';
    } else {
        emptyEl.style.display = 'flex';
        if (weekView) weekView.style.opacity = '0.15';
        if (monthView) monthView.style.opacity = '0.15';
    }
}

function updateCurrentDateDisplay() {
    const el = document.getElementById('currentDate');
    if (!el) return;
    
    if (currentView === 'week') {
        const start = getStartOfWeek(currentDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        
        if (start.getMonth() === end.getMonth()) {
            el.textContent = `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 - ${end.getDate()}日`;
        } else {
            el.textContent = `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日`;
        }
    } else {
        el.textContent = `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
    }
}

function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

async function renderAlldayRow(dates) {
    const grid = document.getElementById('weekAlldayGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const weekStart = formatDateISO(dates[0]);
    const weekEnd   = formatDateISO(dates[dates.length - 1]);
    const allDbEvents = (await TimeWhereDB.getEvents()) || [];
    const dbEvents  = expandEventsForDateRange(allDbEvents, weekStart, weekEnd);

    dates.forEach(date => {
        const wrapper = document.createElement('div');
        wrapper.className = 'allday-wrapper';
        const dateStr = formatDateISO(date);

        const alldayEvents = dbEvents.filter(e =>
            e.date === dateStr && (!e.time_start && !e.time_end)
        );

        alldayEvents.forEach(ev => {
            const el = document.createElement('div');
            el.className = 'allday-event';
            el.style.backgroundColor = ev.color || '#5c6bc0';
            el.textContent = ev.title;
            el.dataset.type = 'event';
            el.dataset.id = String(ev.id);
            wrapper.appendChild(el);
        });

        grid.appendChild(wrapper);
    });
}

function renderWeekView() {
    document.getElementById('weekView').style.display = 'flex';
    document.getElementById('monthView').style.display = 'none';
    
    const startOfWeek = getStartOfWeek(currentDate);
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(date.getDate() + i);
        weekDates.push(date);
    }
    
    renderWeekHeader(weekDates);
    renderAlldayRow(weekDates);
    renderWeekColumns(weekDates);
    renderTimeAxis();
}

function renderWeekHeader(dates) {
    const wrapper = document.getElementById('weekDaysHeader');
    if (!wrapper) return;
    
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    wrapper.innerHTML = dates.map((date, i) => {
        const isToday = date.toDateString() === new Date().toDateString();
        return `<div class="day-header ${isToday ? 'active' : ''}">
            <div class="day-name">${dayNames[i]}</div>
            <div class="day-num">${date.getDate()}</div>
        </div>`;
    }).join('');
}

function renderTimeAxis() {
    const axis = document.getElementById('timeAxis');
    const lines = document.getElementById('gridLines');
    if (!axis || !lines) return;
    
    const hours = [];
    for (let h = TIME_RANGE.startHour; h <= TIME_RANGE.endHour; h++) {
        let label;
        if (h < 12) label = `上午${h}点`;
        else if (h === 12) label = `下午12点`;
        else label = `下午${h - 12}点`;
        hours.push(label);
    }
    
    axis.innerHTML = hours.map(h => `<div class="time-slot-label"><span>${h}</span></div>`).join('');
    lines.innerHTML = hours.map(() => `<div class="grid-line" style="height: ${TIME_RANGE.pxPerHour}px;"></div>`).join('');
}

function getWeekDateFromIndex(index) {
    const startOfWeek = getStartOfWeek(currentDate);
    const date = new Date(startOfWeek);
    date.setDate(date.getDate() + index);
    return formatDateISO(date);
}

function getCreateSlotFromPointer(clientY, columnEl) {
    if (!columnEl) return null;
    const rect = columnEl.getBoundingClientRect();
    const body = columnEl.closest('.calendar-body');
    const clickY = clientY - rect.top + (body?.scrollTop || 0);
    const hour = TIME_RANGE.startHour + Math.floor(clickY / TIME_RANGE.pxPerHour);
    const minute = Math.round(((clickY % TIME_RANGE.pxPerHour) / TIME_RANGE.pxPerHour) * 60 / 15) * 15;

    if (hour < TIME_RANGE.startHour || hour > TIME_RANGE.endHour) return null;

    const normalizedMinute = Math.min(Math.max(minute, 0), 45);
    const timeStart = `${String(Math.min(hour, TIME_RANGE.endHour)).padStart(2, '0')}:${String(normalizedMinute).padStart(2, '0')}`;
    const endHour = normalizedMinute + 60 >= 60 ? hour + 1 : hour;
    const endMin  = (normalizedMinute + 60) % 60;
    const timeEnd = `${String(Math.min(endHour, 23)).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
    return { timeStart, timeEnd };
}

function getWeekColumnFromPointer(clientX) {
    const columns = [...document.querySelectorAll('#weekColumns .day-col')];
    if (!columns.length) return null;
    const direct = columns.find(col => {
        const rect = col.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right;
    });
    if (direct) return direct;

    const layer = document.getElementById('weekColumns');
    const rect = layer?.getBoundingClientRect();
    if (!rect || clientX < rect.left || clientX > rect.right) return null;
    const index = Math.min(columns.length - 1, Math.max(0, Math.floor((clientX - rect.left) / (rect.width / columns.length))));
    return columns[index] || null;
}

function openCreateModalFromWeekPointer(clientX, clientY, preferredColumn = null) {
    const col = preferredColumn || getWeekColumnFromPointer(clientX);
    if (!col?.dataset?.date) return false;
    const slot = getCreateSlotFromPointer(clientY, col);
    if (!slot) return false;
    openCreateModal(col.dataset.date, slot.timeStart, slot.timeEnd);
    return true;
}

// 调度相关函数从 shared/js/scheduling.js 导入
const { containerAppliesToDate, _nthWeekdayOfMonth,
        getContainerLayer, priorityLabel, priorityClass,
        escapeHTML, escapeAttribute } = window.TimeWhereScheduling;

function getCalendarTasksForDate(tasks, dateStr) {
    const items = [];
    (tasks || []).forEach(task => {
        if (!task || task.progress === 'completed' || task.status === 'completed') return;
        const dueDate = task.due_date || task.deadline || null;
        if (dueDate === dateStr) {
            items.push({ ...task, calendar_item_type: 'due' });
        } else if (task.start_date === dateStr) {
            items.push({ ...task, calendar_item_type: 'start' });
        }
    });
    return items.sort((a, b) => {
        if (a.calendar_item_type !== b.calendar_item_type) return a.calendar_item_type === 'due' ? -1 : 1;
        return String(a.title || '').localeCompare(String(b.title || ''));
    });
}

function calendarTimeToMinutes(timeStr) {
    const [hour, minute] = String(timeStr || '00:00').split(':').map(Number);
    return (hour || 0) * 60 + (minute || 0);
}

function calendarTaskMatchesContainer(task, container) {
    if (!task?.schedule_time || !container?.time_start || !container?.time_end) return false;
    const taskMin = calendarTimeToMinutes(task.schedule_time);
    const startMin = calendarTimeToMinutes(container.time_start);
    const endMin = calendarTimeToMinutes(container.time_end);
    return taskMin >= startMin && taskMin < endMin;
}

function assignCalendarTasksToContainers(tasks, containers) {
    const sortedContainers = [...(containers || [])].sort((a, b) =>
        String(a.time_start || '').localeCompare(String(b.time_start || ''))
    );
    const assignments = new Map(sortedContainers.map(container => [container.id, []]));
    const firstLayerOne = sortedContainers.find(container => getContainerLayer(container) === 1);
    const fallbackContainer = firstLayerOne || sortedContainers[0] || null;

    (tasks || []).forEach(task => {
        const target = task.schedule_time
            ? sortedContainers.find(container => calendarTaskMatchesContainer(task, container))
            : fallbackContainer;
        if (target && assignments.has(target.id)) {
            assignments.get(target.id).push(task);
        }
    });

    return assignments;
}

function eventAppliesToDate(event, dateObj, dateStr) {
    if (!event) return false;
    if (event.source === 'container_override' || event.source === 'container_skip') {
        return event.date === dateStr;
    }
    const repeat = event.repeat || 'none';
    if (repeat === 'none') return event.date === dateStr;
    if (repeat === 'once') return (event.once_date || event.date) === dateStr;
    if (event.date && dateStr < event.date) return false;

    const dayOfWeek = dateObj.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    return containerAppliesToDate(event, dateObj, dateStr, dayOfWeek, isWeekday, isWeekend);
}

function expandEventsForDateRange(events, startDate, endDate) {
    const expanded = [];
    const cursor = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    while (cursor <= end) {
        const dateStr = formatDateISO(cursor);
        (events || []).forEach(event => {
            if (eventAppliesToDate(event, cursor, dateStr)) {
                expanded.push({
                    ...event,
                    occurrence_date: dateStr,
                    original_date: event.date,
                    date: dateStr
                });
            }
        });
        cursor.setDate(cursor.getDate() + 1);
    }
    return expanded;
}

async function renderWeekColumns(dates) {
    const container = document.getElementById('weekColumns');
    if (!container) return;

    container.innerHTML = '';

    const allContainers = (await TimeWhereDB.getContainers({ enabled: true })) || [];
    const weekStart = formatDateISO(dates[0]);
    const weekEnd = formatDateISO(dates[6]);
    const allDbEvents = (await TimeWhereDB.getEvents()) || [];
    const dbEvents = expandEventsForDateRange(allDbEvents, weekStart, weekEnd);

    // 加载任务，用于展示 Task Arrange 写入的开始日期
    const allTasks = (await TimeWhereDB.getAllTasks()) || [];

    dates.forEach((date, index) => {
        const col = document.createElement('div');
        col.className = 'day-col';
        col.id = `col-${index}`;
        const dateStr = formatDateISO(date);
        col.dataset.date = dateStr;

        const dayOfWeek = date.getDay();
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        // Collect overrides/skips for this date
        const dayOverrides = dbEvents.filter(e => e.date === dateStr && (e.source === 'container_override' || e.source === 'container_skip'));
        const overriddenIds = new Set(dayOverrides.filter(e => e.source === 'container_override').map(e => e.container_id));
        const skippedIds   = new Set(dayOverrides.filter(e => e.source === 'container_skip').map(e => e.container_id));

        // 该日生效的容器
        const dayContainers = allContainers.filter(c => {
            if (skippedIds.has(c.id) || overriddenIds.has(c.id)) return false;
            return containerAppliesToDate(c, date, dateStr, dayOfWeek, isWeekday, isWeekend);
        });

        const dateTasks = getCalendarTasksForDate(allTasks, dateStr);
        const taskAssignments = assignCalendarTasksToContainers(dateTasks, dayContainers);

        const containerEvents = dayContainers.map(c => ({
            title: c.name,
            time_start: c.time_start,
            time_end: c.time_end,
            color: c.color,
            type: 'container',
            id: c.id,
            source: 'container',
            layer: getContainerLayer(c),
            tasks: taskAssignments.get(c.id) || []
        }));

        const dateEvents = dbEvents.filter(e => e.date === dateStr && e.source !== 'container_skip').map(e => ({
            title: e.title,
            time_start: e.time_start,
            time_end: e.time_end,
            color: e.color,
            type: 'event',
            id: e.id,
            source: e.source || 'manual'
        })).filter(e => e.time_start && e.time_end);

        const allItems = [...containerEvents, ...dateEvents].sort((a, b) =>
            a.time_start.localeCompare(b.time_start)
        );

        const layout = calculateEventLayout(allItems);

        layout.forEach(item => {
            const card = createEventCard(item);
            if (card) {
                card.style.left = `${item.left}%`;
                card.style.right = 'auto';
                card.style.width = `calc(${item.width}% - 8px)`;
                col.appendChild(card);
            }
        });

        if (date.toDateString() === new Date().toDateString()) {
            const indicator = createTimeIndicator();
            if (indicator) col.appendChild(indicator);
        }

        container.appendChild(col);
    });
}

function createEventCard(item) {
    const title = escapeHTML(item.title || item.name || '未命名');
    const timeStart = item.time_start;
    const timeEnd = item.time_end;
    const color = item.color || '#4A90D9';
    const type = item.type || 'container';

    if (!timeStart || !timeEnd) return null;

    const [startH, startM] = timeStart.split(':').map(Number);
    const [endH, endM] = timeEnd.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    if (endMinutes <= startMinutes) endMinutes += 24 * 60;
    const duration = endMinutes - startMinutes;

    const baseHour = TIME_RANGE.startHour;
    const pxPerHour = TIME_RANGE.pxPerHour;
    const pxPerMinute = pxPerHour / 60;
    const totalHours = TIME_RANGE.endHour - TIME_RANGE.startHour;
    const maxTop = totalHours * pxPerHour;

    const top = (startMinutes - baseHour * 60) * pxPerMinute;
    const height = duration * pxPerMinute;

    if (top < 0 || top > maxTop) return null;

    const source = item.source || (type === 'event' ? 'manual' : 'container');
    const layer = item.layer ?? 2;

    const event = document.createElement('div');
    event.dataset.type = type;
    event.dataset.id = item.id;
    event.dataset.source = source;
    event.style.top = `${Math.max(top, 0)}px`;
    event.style.height = `${Math.max(Math.min(height, maxTop - top), 20)}px`;

    if (source === 'container') {
        event.dataset.layer = String(layer);
        if (layer === 1) {
            // 学习时间 — 中等蓝色底 + 虚线边框，区别于普通日程事件的实色卡片
            event.className = 'gcal-event layer-1';
            event.style.backgroundColor = color + '40'; // ~25% 透明
            event.style.border = `2px dashed ${darkenColor(color, 0.15)}`;
            event.style.color = darkenColor(color, 0.35);
        } else {
            // 自由时间 — 浅色背景 + 虚线边框
            event.className = 'gcal-event layer-2';
            event.style.backgroundColor = color + '25'; // ~15% 透明
            event.style.border = `2px dashed ${color}`;
            event.style.color = darkenColor(color, 0.35);
        }
    } else if (source === 'manual') {
        event.className = 'gcal-event';
        event.style.backgroundColor = color;
        event.style.borderLeft = `3px solid rgba(255,255,255,0.4)`;
    } else {
        // container_override or ics
        event.className = 'gcal-event';
        event.style.backgroundColor = color;
        event.style.borderLeft = `3px solid ${darkenColor(color, 0.3)}`;
    }

    const startTimeStr = formatTime(timeStart);
    const endTimeStr = formatTime(timeEnd);

    // 容器内任务列表
    const tasks = item.tasks || [];
    let tasksHTML = '';
    if (type === 'container' && tasks.length > 0) {
        tasksHTML = `<div class="container-tasks">` +
            tasks.map(t => {
                const itemType = t.calendar_item_type === 'due' ? 'due' : 'start';
                const itemLabel = itemType === 'due' ? '结束' : '开始';
                return `<div class="container-task-item ${itemType}">
                    <span class="task-item-title">${escapeHTML(t.title || '无标题')}</span>
                    <span class="task-item-type task-item-${itemType}">${itemLabel}</span>
                </div>`;
            }).join('') +
        `</div>`;
    }

    event.innerHTML = `<h4>${title}</h4><span>${escapeHTML(startTimeStr)} - ${escapeHTML(endTimeStr)}</span>${tasksHTML}`;

    return event;
}

function createTimeIndicator() {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const baseHour = TIME_RANGE.startHour;
    const pxPerMinute = TIME_RANGE.pxPerHour / 60;
    const top = (minutes - baseHour * 60) * pxPerMinute;
    
    const indicator = document.createElement('div');
    indicator.className = 'gcal-current-time';
    indicator.style.top = `${top}px`;
    return indicator;
}

function formatTime(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    if (h < 12) return `上午${h}点${m > 0 ? m : ''}`;
    if (h === 12) return `下午12点${m > 0 ? m : ''}`;
    return `下午${h - 12}点${m > 0 ? m : ''}`;
}

function darkenColor(hex, amount) {
    hex = hex.replace('#', '');
    const r = Math.max(0, parseInt(hex.substring(0, 2), 16) * (1 - amount));
    const g = Math.max(0, parseInt(hex.substring(2, 4), 16) * (1 - amount));
    const b = Math.max(0, parseInt(hex.substring(4, 6), 16) * (1 - amount));
    return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
}

function calculateEventLayout(events) {
    if (events.length === 0) return [];
    
    const timeToMin = (t) => {
        const [h, m] = String(t).split(':').map(Number);
        return h * 60 + m;
    };
    
    // Sort by start time
    const sortedEvents = [...events].sort((a, b) => {
        return timeToMin(a.time_start) - timeToMin(b.time_start);
    });
    
    // Assign lanes using first-fit algorithm
    const result = [];
    
    sortedEvents.forEach(event => {
        const eventStart = timeToMin(event.time_start);
        const eventEnd = timeToMin(event.time_end);
        
        // Find first lane where this event doesn't overlap
        let colIndex = 0;
        while (true) {
            const hasOverlap = result.some(item => {
                if (item.col !== colIndex) return false;
                const existingStart = timeToMin(item.time_start);
                const existingEnd = timeToMin(item.time_end);
                return eventStart < existingEnd && eventEnd > existingStart;
            });
            
            if (!hasOverlap) break;
            colIndex++;
        }
        
        result.push({ ...event, col: colIndex });
    });
    
    // For each event, determine if it overlaps with any other event
    // Only events that have overlaps should be split into lanes
    result.forEach(event => {
        const eventStart = timeToMin(event.time_start);
        const eventEnd = timeToMin(event.time_end);
        
        const hasOverlap = result.some(item => {
            if (item === event) return false;
            const otherStart = timeToMin(item.time_start);
            const otherEnd = timeToMin(item.time_end);
            return eventStart < otherEnd && eventEnd > otherStart;
        });
        
        event.hasOverlap = hasOverlap;
    });
    
    // Get max concurrent only among overlapping events
    const overlappingEvents = result.filter(e => e.hasOverlap);
    const maxConcurrent = findMaxConcurrent(overlappingEvents, timeToMin);
    const totalLanes = Math.max(maxConcurrent, 1);
    
    // Apply layout based on whether event has overlaps
    result.forEach(item => {
        if (item.hasOverlap && totalLanes > 1) {
            item.left = (item.col / totalLanes) * 100;
            item.width = 100 / totalLanes;
        } else {
            item.left = 0;
            item.width = 100;
        }
    });
    
    return result;
}

function findMaxConcurrent(events, timeToMin) {
    if (events.length === 0) return 1;
    
    const times = new Set();
    events.forEach(e => {
        times.add(timeToMin(e.time_start));
        times.add(timeToMin(e.time_end));
    });
    
    let max = 1;
    times.forEach(time => {
        const count = events.filter(e => {
            const start = timeToMin(e.time_start);
            const end = timeToMin(e.time_end);
            return time >= start && time < end;
        }).length;
        max = Math.max(max, count);
    });
    
    return max;
}

function renderMonthView() {
    document.getElementById('weekView').style.display = 'none';
    document.getElementById('monthView').style.display = 'flex';
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;
    
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDay);
    
    const totalDays = Math.ceil((lastDay - startDate) / (1000 * 60 * 60 * 24));
    const rows = Math.ceil(totalDays / 7);
    
    const grid = document.getElementById('monthGrid');
    if (!grid) return;
    
    grid.style.gridTemplateRows = `repeat(${rows}, minmax(100px, 1fr))`;
    grid.innerHTML = '';
    
    const today = new Date();
    
    for (let i = 0; i < totalDays; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        
        const cell = document.createElement('div');
        cell.className = 'month-cell';
        cell.dataset.date = formatDateISO(date);
        
        const isCurrentMonth = date.getMonth() === month;
        if (!isCurrentMonth) cell.classList.add('other-month');
        if (date.toDateString() === today.toDateString()) cell.classList.add('today');
        
        cell.innerHTML = `<div class="month-date">${date.getDate()}</div>`;
        
        grid.appendChild(cell);
    }
    
    renderMonthEvents();
}

async function renderMonthEvents() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDay);

    const lastDay = new Date(year, month + 1, 0);
    const totalDays = Math.ceil((lastDay - startDate) / (1000 * 60 * 60 * 24));

    // Use full visible range (including overflow days into adjacent months)
    const visStart = formatDateISO(startDate);
    const visEnd = formatDateISO(new Date(startDate.getTime() + (totalDays - 1) * 86400000));

    const allContainers = (await TimeWhereDB.getContainers({ enabled: true })) || [];
    const allDbEvents = (await TimeWhereDB.getEvents()) || [];
    const dbEvents = expandEventsForDateRange(allDbEvents, visStart, visEnd);
    const cells = document.querySelectorAll('.month-cell');

    for (let i = 0; i < totalDays && i < cells.length; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);

        const dayOfWeek = date.getDay();
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dateStr = formatDateISO(date);

        // Override/skip filtering (same logic as renderWeekColumns)
        const dayOverrides = dbEvents.filter(e => e.date === dateStr &&
            (e.source === 'container_override' || e.source === 'container_skip'));
        const overriddenIds = new Set(dayOverrides.filter(e => e.source === 'container_override').map(e => e.container_id));
        const skippedIds = new Set(dayOverrides.filter(e => e.source === 'container_skip').map(e => e.container_id));

        // Containers that apply today (excluding skipped/overridden)
        const containerItems = allContainers
            .filter(c => !skippedIds.has(c.id) && !overriddenIds.has(c.id))
            .filter(c => containerAppliesToDate(c, date, dateStr, dayOfWeek, isWeekday, isWeekend))
            .map(c => ({
                type: 'container',
                source: 'container',
                id: c.id,
                title: c.name,
                color: c.color,
                time_start: c.time_start,
                time_end: c.time_end,
                layer: getContainerLayer(c)
            }));

        // Override events replace their container on this date
        const overrideItems = dayOverrides
            .filter(e => e.source === 'container_override')
            .map(e => ({ type: 'event', source: 'container_override', id: e.id, title: e.title, color: e.color, time_start: e.time_start, time_end: e.time_end }));

        // Regular manual/timetable events (skip skip/override source events from display)
        const eventItems = dbEvents
            .filter(e => e.date === dateStr && e.source !== 'container_override' && e.source !== 'container_skip')
            .map(e => ({ type: 'event', source: e.source || 'manual', id: e.id, title: e.title, color: e.color, time_start: e.time_start, time_end: e.time_end }));

        const allItems = [...containerItems, ...overrideItems, ...eventItems]
            .sort((a, b) => (a.time_start || '').localeCompare(b.time_start || ''));

        const maxEvents = 3;
        const displayItems = allItems.slice(0, maxEvents);
        const remaining = allItems.length - maxEvents;

        displayItems.forEach(ev => {
            const eventEl = document.createElement('div');
            eventEl.className = getMonthItemClass(ev);
            eventEl.style.backgroundColor = ev.color || '#4A90D9';
            eventEl.textContent = ev.title;
            eventEl.title = ev.time_start && ev.time_end
                ? `${ev.title} (${ev.time_start} - ${ev.time_end})`
                : ev.title;
            eventEl.dataset.type = ev.type;
            eventEl.dataset.id = String(ev.id);
            if (ev.source) eventEl.dataset.source = ev.source;
            if (ev.type === 'container') eventEl.dataset.layer = String(ev.layer ?? 2);
            cells[i].appendChild(eventEl);
        });

        if (remaining > 0) {
            const more = document.createElement('div');
            more.className = 'month-more';
            more.textContent = `+${remaining} 更多`;
            cells[i].appendChild(more);
        }
    }
}

function getMonthItemClass(item) {
    if (item?.type === 'container' && item?.source === 'container') {
        const layer = item.layer ?? 2;
        return `month-event month-container layer-${layer}`;
    }
    return 'month-event';
}

function navigate(direction) {
    if (currentView === 'week') {
        currentDate.setDate(currentDate.getDate() + (direction === 'prev' ? -7 : 7));
    } else {
        currentDate.setMonth(currentDate.getMonth() + (direction === 'prev' ? -1 : 1));
    }
    render();
}

function goToToday() {
    currentDate = new Date();
    render();
}

function switchView(view) {
    currentView = view;
    document.getElementById('currentViewLabel').textContent = view === 'week' ? '周' : '月';
    if (typeof TimeWhereDB !== 'undefined') TimeWhereDB.setSetting('calendar_view', view);
    document.getElementById('viewDropdown').style.display = 'none';
    
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === view);
    });
    
    render();
}

async function _checkOverlap(date, timeStart, timeEnd, excludeId) {
    if (!date || !timeStart || !timeEnd) return [];
    const conflicts = [];

    // Check DB events
    const allEvents = (await TimeWhereDB.getEvents()) || [];
    const dayEvents = expandEventsForDateRange(allEvents, date, date);
    for (const e of dayEvents) {
        if (String(e.id) === String(excludeId)) continue;
        if (!e.time_start || !e.time_end) continue;
        if (e.source === 'container_skip') continue;
        if (timeStart < e.time_end && timeEnd > e.time_start) {
            conflicts.push(`${e.title} (${e.time_start}–${e.time_end})`);
        }
    }

    // Check containers
    const dateObj = new Date(date + 'T00:00:00');
    const dayOfWeek = dateObj.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const allContainers = (await TimeWhereDB.getContainers({ enabled: true })) || [];
    const dayOverrides = dayEvents.filter(e => e.source === 'container_override' || e.source === 'container_skip');
    const overriddenIds = new Set(dayOverrides.filter(e => e.source === 'container_override').map(e => e.container_id));
    const skippedIds = new Set(dayOverrides.filter(e => e.source === 'container_skip').map(e => e.container_id));

    for (const c of allContainers) {
        if (String(c.id) === String(excludeId)) continue;
        if (skippedIds.has(c.id) || overriddenIds.has(c.id)) continue;
        if (!containerAppliesToDate(c, dateObj, date, dayOfWeek, isWeekday, isWeekend)) continue;
        if (timeStart < c.time_end && timeEnd > c.time_start) {
            conflicts.push(`${c.name} (${c.time_start}–${c.time_end})`);
        }
    }

    return conflicts;
}

function _filterEvents(query) {
    const cards = document.querySelectorAll('.gcal-event, .month-event, .allday-event');
    cards.forEach(card => {
        if (!query) {
            card.style.opacity = '';
            card.style.pointerEvents = '';
        } else {
            const title = (card.querySelector('h4')?.textContent || card.textContent || '').toLowerCase();
            const match = title.includes(query);
            card.style.opacity = match ? '' : '0.2';
            card.style.pointerEvents = match ? '' : 'none';
        }
    });
}

function setupCalendar() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const href = item.getAttribute('href');
            if (href === '#' || href === '' || href === null) {
                e.preventDefault();
            }
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });

    document.getElementById('btnPrev')?.addEventListener('click', () => navigate('prev'));
    document.getElementById('btnNext')?.addEventListener('click', () => navigate('next'));
    document.getElementById('btnToday')?.addEventListener('click', goToToday);
    
    document.getElementById('viewSelector')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = document.getElementById('viewDropdown');
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });
    
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            switchView(item.dataset.view);
        });
    });
    
    document.addEventListener('click', () => {
        document.getElementById('viewDropdown').style.display = 'none';
    });
    
    setInterval(() => {
        if (currentView === 'week') {
            const indicator = document.querySelector('.gcal-current-time');
            if (indicator) {
                const now = new Date();
                const minutes = now.getHours() * 60 + now.getMinutes();
                const top = (minutes - 6 * 60) * (40 / 60);
                indicator.style.top = `${top}px`;
            }
        }
    }, 60000);

    document.getElementById('weekColumns')?.addEventListener('click', (e) => {
        const card = e.target.closest('.gcal-event');
        if (card) {
            e.stopPropagation();
            const type = card.dataset.type;
            const id = card.dataset.id;
            const date = card.closest('.day-col')?.dataset.date;
            openEditModal(type, id, date);
            return;
        }

        const col = e.target.closest('.day-col');
        if (openCreateModalFromWeekPointer(e.clientX, e.clientY, col)) {
            e.stopPropagation();
        }
    });

    document.querySelector('#weekView .calendar-body')?.addEventListener('click', (e) => {
        if (e.target.closest('.gcal-event') || e.target.closest('#weekColumns')) return;
        if (openCreateModalFromWeekPointer(e.clientX, e.clientY)) {
            e.stopPropagation();
        }
    });

    // Hover tooltip
    let _tooltipEl = null;
    let _tooltipTimer = null;
    async function _showTooltip(e, cardEl) {
        _hideTooltip();
        const type = cardEl.dataset.type;
        const id = cardEl.dataset.id;
        if (!type || !id) return;
        let data = type === 'container'
            ? await TimeWhereDB.getContainerById(id)
            : await TimeWhereDB.getEventById(id);
        if (!data) return;

        const el = document.createElement('div');
        el.className = 'event-tooltip';
        const title = type === 'container' ? data.name : data.title;
        const timeStr = data.time_start && data.time_end ? `${data.time_start} – ${data.time_end}` : '全天';
        const extra = type === 'container'
            ? `<div class="tt-time">${escapeHTML(timeStr)} · ${escapeHTML(_repeatLabel(data))}</div>`
            : `<div class="tt-time">${escapeHTML(data.date)} ${escapeHTML(timeStr)}</div>${data.description ? `<div class="tt-desc">${escapeHTML(data.description.slice(0, 60))}</div>` : ''}`;
        el.innerHTML = `<div class="tt-title">${escapeHTML(title)}</div>${extra}`;
        el.style.borderLeftColor = data.color || 'var(--primary)';
        document.body.appendChild(el);
        _tooltipEl = el;

        const x = Math.min(e.clientX + 12, window.innerWidth - 260);
        const y = Math.min(e.clientY + 12, window.innerHeight - 120);
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
    }
    function _hideTooltip() {
        if (_tooltipEl) { _tooltipEl.remove(); _tooltipEl = null; }
        clearTimeout(_tooltipTimer);
    }

    ['weekColumns', 'weekAlldayGrid', 'monthGrid'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('mouseover', e => {
            const card = e.target.closest('.gcal-event, .month-event, .allday-event');
            if (!card) { _hideTooltip(); return; }
            clearTimeout(_tooltipTimer);
            _tooltipTimer = setTimeout(() => _showTooltip(e, card), 300);
        });
        el.addEventListener('mouseout', e => {
            const card = e.target.closest('.gcal-event, .month-event, .allday-event');
            if (card) _hideTooltip();
        });
        el.addEventListener('mousemove', e => {
            if (_tooltipEl) {
                const x = Math.min(e.clientX + 12, window.innerWidth - 260);
                const y = Math.min(e.clientY + 12, window.innerHeight - 120);
                _tooltipEl.style.left = `${x}px`;
                _tooltipEl.style.top  = `${y}px`;
            }
        });
    });

    // Search
    document.getElementById('btnSearch')?.addEventListener('click', () => {
        const bar = document.getElementById('searchBar');
        if (!bar) return;
        const isHidden = bar.style.display === 'none' || bar.style.display === '';
        bar.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) document.getElementById('searchInput')?.focus();
        else { document.getElementById('searchInput').value = ''; _filterEvents(''); }
    });
    document.getElementById('searchClose')?.addEventListener('click', () => {
        document.getElementById('searchBar').style.display = 'none';
        document.getElementById('searchInput').value = '';
        _filterEvents('');
    });
    document.getElementById('searchInput')?.addEventListener('input', e => {
        _filterEvents(e.target.value.trim().toLowerCase());
    });

    const debugSnapshotBtn = document.getElementById('btnCopyCalendarDebugSnapshot');
    debugSnapshotBtn?.addEventListener('click', () => {
        copyCalendarDebugSnapshot(debugSnapshotBtn);
    });

    document.getElementById('calModalClose')?.addEventListener('click', closeCalModal);
    document.getElementById('calModalBackdrop')?.addEventListener('click', closeCalModal);

    document.getElementById('weekAlldayGrid')?.addEventListener('click', (e) => {
        const el = e.target.closest('.allday-event');
        if (!el) return;
        e.stopPropagation();
        const id = el.dataset.id;
        const type = el.dataset.type;
        const wrapper = el.closest('.allday-wrapper');
        const grid = wrapper?.parentElement;
        if (!grid) return;
        const idx = [...grid.children].indexOf(wrapper);
        openEditModal(type, id, getWeekDateFromIndex(idx));
    });

    document.getElementById('monthGrid')?.addEventListener('click', (e) => {
        const eventEl = e.target.closest('.month-event');
        if (eventEl) {
            e.stopPropagation();
            const type = eventEl.dataset.type;
            const id = eventEl.dataset.id;
            const date = eventEl.closest('.month-cell')?.dataset.date;
            if (type && id && date) openEditModal(type, id, date);
            return;
        }
        const cell = e.target.closest('.month-cell');
        if (cell?.dataset.date) openCreateModal(cell.dataset.date, '09:00', '10:00');
    });
}

function checkInitMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const isInitMode = urlParams.get('init') === 'true';
    
    if (isInitMode) {
        const initPanel = document.getElementById('initPanel');
        if (initPanel) {
            initPanel.style.display = 'block';
        }
        setupInitEvents();
    }
}

function setupInitEvents() {
    const initContainer = localStorage.getItem('wizard_init_container') === 'true';
    const initTimetable = localStorage.getItem('wizard_init_timetable') === 'true';
    
    const containerSection = document.getElementById('initContainerSection');
    const timetableSection = document.getElementById('initTimetableSection');
    
    if (containerSection) {
        containerSection.style.display = initContainer ? 'block' : 'none';
    }
    if (timetableSection) {
        timetableSection.style.display = initTimetable ? 'block' : 'none';
    }
    
    document.getElementById('closeInitPanel')?.addEventListener('click', () => {
        completeInit();
    });
    
    document.getElementById('initSkipBtn')?.addEventListener('click', () => {
        completeInit();
    });
    
    document.getElementById('initCompleteBtn')?.addEventListener('click', async () => {
        await saveInitData();
        completeInit();
    });
    
    document.getElementById('icsUploadArea')?.addEventListener('click', () => {
        document.getElementById('icsFileInput')?.click();
    });
    
    document.getElementById('icsFileInput')?.addEventListener('change', handleICSUpload);
}

async function saveInitData() {
    if (localStorage.getItem('wizard_init_container') === 'true') {
        await TimeWhereScheduling.initDefaultContainers(TimeWhereDB);
    }
}

function handleICSUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileNameEl = document.getElementById('icsFileName');
    if (fileNameEl) {
        fileNameEl.textContent = file.name;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const icsContent = e.target.result;
        await importICS(icsContent);
    };
    reader.readAsText(file);
}

async function importICS(content) {
    const events = TimeWhereICS.parseICSToEvents(content);
    showToast(`解析到 ${events.length} 个日程事件`, 'info');

    let imported = 0;
    for (const ev of events) {
        // 跳过全天事件（无时间信息）
        if (!ev.startDate || !ev.startTime || !ev.endTime) continue;
        await TimeWhereDB.addEvent({
            title: ev.summary || '课程',
            date: ev.startDate,
            time_start: ev.startTime,
            time_end: ev.endTime,
            color: '#4A90D9',
            source: 'timetable'
        });
        imported++;
    }

    showToast(`成功导入 ${imported} 个课程`, 'success');
    render();
}

function completeInit() {
    localStorage.removeItem('wizard_init_container');
    localStorage.removeItem('wizard_init_timetable');
    window.location.href = '../settings/settings.html?backfrom=init';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ── Unified Calendar Modal ──────────────────────────────────────────────────

const MODAL_COLORS = ['#4A90D9','#E91E63','#FF9800','#4CAF50','#9C27B0','#E74C3C','#1ABC9C','#F39C12'];

const DAY_NAMES_CN  = ['周日','周一','周二','周三','周四','周五','周六'];
const MONTH_NAMES_CN = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];
const WEEK_ORD_CN    = ['第一个','第二个','第三个','第四个','最后一个'];

/**
 * 根据点击日期动态构造 Google Calendar 风格的重复选项。
 * @param {string} dateStr  'YYYY-MM-DD'
 * @param {object} current  容器现有 repeat 配置（编辑时传入）
 * @returns {string} <option> HTML 列表
 */
function buildRepeatOptions(dateStr, current = {}) {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay();
    const dom = d.getDate();
    const month = d.getMonth() + 1;
    const { nth } = _nthWeekdayOfMonth(dateStr);

    const cur = current.repeat || 'none';

    const opts = [
        { value: 'none',    label: '不重复' },
        { value: 'daily',   label: '每天' },
        {
            value: 'weekly',
            label: `每周${DAY_NAMES_CN[dow]}`,
            data: `data-weekly-day="${dow}"`
        },
        {
            value: 'monthly_nth',
            label: `每月${WEEK_ORD_CN[nth - 1]}${DAY_NAMES_CN[dow]}`,
            data: `data-monthly-nth="${nth}" data-monthly-dow="${dow}"`
        },
        {
            value: 'yearly',
            label: `每年在 ${month}月${dom}日`,
            data: `data-yearly-month="${month}" data-yearly-dom="${dom}"`
        },
        { value: 'weekday', label: '每个工作日（周一至周五）' },
        { value: 'weekend', label: '每个周末（周六、周日）' },
        { value: 'custom',  label: '自定义...' },
    ];

    return opts.map(o => {
        const sel = o.value === cur ? ' selected' : '';
        return `<option value="${o.value}"${sel} ${o.data || ''}>${o.label}</option>`;
    }).join('');
}

/** 将 container 的 repeat 字段翻译成可读文本 */
function _repeatLabel(c) {
    const map = {
        none: '不重复', daily: '每天', weekday: '每个工作日',
        weekly: `每周${DAY_NAMES_CN[c.repeat_days?.[0] ?? 0]}`,
        monthly_nth: `每月${WEEK_ORD_CN[(c.monthly_week ?? 1) - 1]}${DAY_NAMES_CN[c.monthly_dow ?? 0]}`,
        yearly: `每年 ${c.yearly_month ?? 1}月${c.yearly_dom ?? 1}日`,
        custom: '自定义星期',
    };
    return map[c.repeat] || c.repeat;
}

function buildRepeatControlHTML(refDate, current = {}, fallbackRepeat = 'none') {
    const repeat = current?.repeat || fallbackRepeat;
    const repeatDays = current?.repeat_days || [];
    const customDisplay = repeat === 'custom' ? '' : 'display:none';
    const dayLabels = ['日','一','二','三','四','五','六'];
    const dayBtns = [0,1,2,3,4,5,6].map(d =>
        `<button class="day-btn${repeatDays.includes(d) ? ' active' : ''}" data-day="${d}">${dayLabels[d]}</button>`
    ).join('');
    const repeatOpts = buildRepeatOptions(refDate, { ...current, repeat });
    return `
        <div class="form-group">
            <label>重复</label>
            <select id="modalRepeat">${repeatOpts}</select>
            <div class="custom-days" id="customDays" style="${customDisplay}">${dayBtns}</div>
        </div>`;
}

let _modal = { mode: null, type: 'container', id: null, date: null };

function openCreateModal(date, timeStart, timeEnd) {
    _modal = { mode: 'create', type: 'container', id: null, date };
    _renderModal({ date, timeStart, timeEnd });
}

async function openEditModal(type, id, date) {
    _modal = { mode: 'edit', type, id, date };
    _renderModal({});
}

async function _renderModal({ date, timeStart, timeEnd }) {
    let data = null;
    if (_modal.mode === 'edit' && _modal.id) {
        data = _modal.type === 'container'
            ? await TimeWhereDB.getContainerById(_modal.id)
            : await TimeWhereDB.getEventById(_modal.id);
        if (!data) return;
    }

    const isCreate = _modal.mode === 'create';
    const isContainer = _modal.type === 'container';

    document.getElementById('calModalTitle').textContent = isCreate ? '创建日程' : '编辑日程';

    // ── Body ─────────────────────────────────────────────────────────────────
    const typeToggle = isCreate ? `
        <div class="type-toggle" id="modalTypeToggle">
            <button class="type-btn ${isContainer ? 'active' : ''}" data-type="container">时间容器</button>
            <button class="type-btn ${!isContainer ? 'active' : ''}" data-type="event">日程事件</button>
        </div>` : `
        <div class="type-readonly" id="modalTypeReadonly">
            类型：${isContainer ? '时间容器' : '日程事件'}
        </div>`;

    const colorSwatches = MODAL_COLORS.map(c => {
        const cur = data?.color || '#4A90D9';
        return `<div class="color-swatch${c === cur ? ' active' : ''}" data-color="${c}" style="background:${c}"></div>`;
    }).join('');

    let bodyHTML = typeToggle;

    if (isContainer) {
        const refDate = _modal.date || date || formatDateISO(new Date());
        const repeatControls = buildRepeatControlHTML(refDate, data || {}, 'weekday');
        const selectedLayer = data ? getContainerLayer(data) : 1;

        bodyHTML += `
            <div class="form-group">
                <label>名称</label>
                <input type="text" id="modalName" value="${escapeAttribute(data?.name || '')}" placeholder="输入容器名称">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>开始</label>
                    <input type="time" id="modalStart" value="${escapeAttribute(data?.time_start || timeStart || '09:00')}">
                </div>
                <div class="form-group">
                    <label>结束</label>
                    <input type="time" id="modalEnd" value="${escapeAttribute(data?.time_end || timeEnd || '10:00')}">
                </div>
            </div>
            ${repeatControls}
            <div class="form-group">
                <label>颜色</label>
                <div class="color-picker" id="modalColorPicker">${colorSwatches}</div>
            </div>
            <div class="form-group">
                <label>类型</label>
                <div class="layer-toggle" id="layerToggle">
                    <button class="layer-btn${selectedLayer === 1 ? ' active' : ''}" data-layer="1">学习时间</button>
                    <button class="layer-btn${selectedLayer === 2 ? ' active' : ''}" data-layer="2">自由时间</button>
                </div>
            </div>
            ${!isCreate ? `
            <div class="scope-row" id="scopeRow">
                <label>修改范围</label>
                <div class="scope-toggle">
                    <button class="scope-btn active" data-scope="all">修改全部</button>
                    <button class="scope-btn" data-scope="once">仅修改此次</button>
                </div>
            </div>` : ''}`;
    } else {
        const isAllDay = data ? (!data.time_start && !data.time_end) : false;
        const timeRowDisplay = isAllDay ? 'display:none' : '';
        const refDate = data?.date || date || _modal.date || formatDateISO(new Date());
        const repeatControls = buildRepeatControlHTML(refDate, data || {}, 'none');
        bodyHTML += `
            <div class="form-group">
                <label>标题</label>
                <input type="text" id="modalName" value="${escapeAttribute(data?.title || '')}" placeholder="输入日程事件标题">
            </div>
            <div class="form-group">
                <label>日期</label>
                <input type="date" id="modalDate" value="${escapeAttribute(data?.date || date || '')}">
            </div>
            <div class="form-group allday-toggle-row">
                <label class="allday-label">
                    <input type="checkbox" id="modalAllDay"${isAllDay ? ' checked' : ''}>
                    <span>全天事件</span>
                </label>
            </div>
            <div class="form-row" id="modalTimeRow" style="${timeRowDisplay}">
                <div class="form-group">
                    <label>开始</label>
                    <input type="time" id="modalStart" value="${escapeAttribute(data?.time_start || timeStart || '09:00')}">
                </div>
                <div class="form-group">
                    <label>结束</label>
                    <input type="time" id="modalEnd" value="${escapeAttribute(data?.time_end || timeEnd || '10:00')}">
                </div>
            </div>
            ${repeatControls}
            <div class="form-group">
                <label>颜色</label>
                <div class="color-picker" id="modalColorPicker">${colorSwatches}</div>
            </div>
            ${!isCreate ? `
            <div class="scope-row" id="scopeRow">
                <label>修改范围</label>
                <div class="scope-toggle">
                    <button class="scope-btn active" data-scope="all">修改全部</button>
                    <button class="scope-btn" data-scope="once" disabled title="日程事件暂不支持仅修改此次">仅修改此次</button>
                </div>
                <p class="scope-hint">日程事件当前仅支持修改全部。</p>
            </div>` : ''}`;
    }

    document.getElementById('calModalBody').innerHTML = bodyHTML;

    // ── Footer ────────────────────────────────────────────────────────────────
    let footerHTML = '';
    if (isCreate) {
        footerHTML = `<button class="btn-cancel" id="modalCancel">取消</button>
                      <button class="btn-save" id="modalSave">保存</button>`;
    } else if (isContainer) {
        footerHTML = `
            <div class="btn-delete-group" id="deleteGroup">
                <div class="btn-delete-split">
                    <button class="btn-delete-main" id="modalDeleteMain">删除</button>
                    <button class="btn-delete-arrow" id="modalDeleteArrow">▾</button>
                </div>
                <div class="delete-menu" id="deleteMenu" style="display:none">
                    <div class="delete-menu-item" id="deleteOnce">删除此次</div>
                    <div class="delete-menu-item danger" id="deleteAll">删除全部</div>
                </div>
            </div>
            <button class="btn-cancel" id="modalCancel">取消</button>
            <button class="btn-save" id="modalSave">保存</button>`;
    } else {
        footerHTML = `<button class="btn-delete" id="modalDelete">删除</button>
                      <button class="btn-cancel" id="modalCancel">取消</button>
                      <button class="btn-save" id="modalSave">保存</button>`;
    }
    document.getElementById('calModalFooter').innerHTML = footerHTML;

    _bindModalEvents();
    document.getElementById('calModal').style.display = 'flex';
    document.getElementById('modalName')?.focus();
}

function _bindModalEvents() {
    // Close / Cancel
    document.getElementById('modalCancel')?.addEventListener('click', closeCalModal);

    // Type toggle (create only)
    document.getElementById('modalTypeToggle')?.addEventListener('click', e => {
        const btn = e.target.closest('.type-btn');
        if (!btn) return;
        if (_modal.mode === 'edit' || btn.disabled) return;
        _modal.type = btn.dataset.type;
        _renderModal({
            date: _modal.date,
            timeStart: document.getElementById('modalStart')?.value,
            timeEnd:   document.getElementById('modalEnd')?.value
        });
    });

    // Color swatches
    document.getElementById('modalColorPicker')?.addEventListener('click', e => {
        const sw = e.target.closest('.color-swatch');
        if (!sw) return;
        document.querySelectorAll('#modalColorPicker .color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
    });

    // Repeat select → show/hide custom day picker
    document.getElementById('modalRepeat')?.addEventListener('change', e => {
        const cd = document.getElementById('customDays');
        if (cd) cd.style.display = e.target.value === 'custom' ? '' : 'none';
    });

    // Day buttons (custom days)
    document.getElementById('customDays')?.addEventListener('click', e => {
        const btn = e.target.closest('.day-btn');
        if (btn) btn.classList.toggle('active');
    });

    // All-day toggle (event only)
    document.getElementById('modalAllDay')?.addEventListener('change', e => {
        const timeRow = document.getElementById('modalTimeRow');
        if (timeRow) timeRow.style.display = e.target.checked ? 'none' : '';
    });

    // Layer toggle (container only)
    document.getElementById('layerToggle')?.addEventListener('click', e => {
        const btn = e.target.closest('.layer-btn');
        if (!btn) return;
        document.querySelectorAll('#layerToggle .layer-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });

    // Scope toggle (edit container only)
    document.getElementById('scopeRow')?.addEventListener('click', e => {
        const btn = e.target.closest('.scope-btn');
        if (!btn) return;
        document.querySelectorAll('.scope-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });

    // Delete menu toggle
    document.getElementById('modalDeleteArrow')?.addEventListener('click', e => {
        e.stopPropagation();
        const menu = document.getElementById('deleteMenu');
        menu.style.display = menu.style.display === 'none' ? '' : 'none';
    });
    document.getElementById('modalDeleteMain')?.addEventListener('click', () => {
        const menu = document.getElementById('deleteMenu');
        menu.style.display = menu.style.display === 'none' ? '' : 'none';
    });
    document.getElementById('deleteOnce')?.addEventListener('click', () => _deleteContainerOnce());
    document.getElementById('deleteAll')?.addEventListener('click', () => _deleteContainerAll());
    document.getElementById('modalDelete')?.addEventListener('click', () => _deleteEvent());

    // Save
    document.getElementById('modalSave')?.addEventListener('click', () => _saveModal());
}

function _getModalValues() {
    const name   = document.getElementById('modalName')?.value.trim();
    const start  = document.getElementById('modalStart')?.value;
    const end    = document.getElementById('modalEnd')?.value;
    const color  = document.querySelector('#modalColorPicker .color-swatch.active')?.dataset.color || '#4A90D9';
    const date   = document.getElementById('modalDate')?.value;
    const scope  = document.querySelector('.scope-btn.active')?.dataset.scope || 'all';

    // Read repeat and its embedded data attributes
    const sel = document.getElementById('modalRepeat');
    const repeat = sel?.value || 'none';
    const selOpt = sel?.options[sel.selectedIndex];

    const repeatDays = [...document.querySelectorAll('.day-btn.active')].map(b => parseInt(b.dataset.day));

    // For weekly, the selected option carries data-weekly-day
    const weeklyDay   = selOpt ? parseInt(selOpt.dataset.weeklyDay ?? NaN) : NaN;
    const monthlyNth  = selOpt ? parseInt(selOpt.dataset.monthlyNth ?? NaN) : NaN;
    const monthlyDow  = selOpt ? parseInt(selOpt.dataset.monthlyDow ?? NaN) : NaN;
    const yearlyMonth = selOpt ? parseInt(selOpt.dataset.yearlyMonth ?? NaN) : NaN;
    const yearlyDom   = selOpt ? parseInt(selOpt.dataset.yearlyDom  ?? NaN) : NaN;

    const allDay = document.getElementById('modalAllDay')?.checked || false;
    const layer = parseInt(document.querySelector('#layerToggle .layer-btn.active')?.dataset.layer || '1');

    return { name, start, end, color, date, repeat, scope, repeatDays,
             weeklyDay, monthlyNth, monthlyDow, yearlyMonth, yearlyDom, allDay, layer };
}

function _repeatPayload(v) {
    // Returns the repeat-related fields to persist in containers and schedule events.
    switch (v.repeat) {
        case 'weekly':
            return { repeat: 'weekly', repeat_days: [isNaN(v.weeklyDay) ? 1 : v.weeklyDay],
                     monthly_week: null, monthly_dow: null, yearly_month: null, yearly_dom: null, once_date: null };
        case 'monthly_nth':
            return { repeat: 'monthly_nth', repeat_days: null,
                     monthly_week: isNaN(v.monthlyNth) ? 1 : v.monthlyNth,
                     monthly_dow: isNaN(v.monthlyDow) ? 0 : v.monthlyDow,
                     yearly_month: null, yearly_dom: null, once_date: null };
        case 'yearly':
            return { repeat: 'yearly', repeat_days: null, monthly_week: null, monthly_dow: null,
                     yearly_month: isNaN(v.yearlyMonth) ? 1 : v.yearlyMonth,
                     yearly_dom: isNaN(v.yearlyDom) ? 1 : v.yearlyDom, once_date: null };
        case 'custom':
            return { repeat: 'custom', repeat_days: v.repeatDays,
                     monthly_week: null, monthly_dow: null, yearly_month: null, yearly_dom: null, once_date: null };
        case 'once':
            return { repeat: 'once', repeat_days: null,
                     monthly_week: null, monthly_dow: null, yearly_month: null, yearly_dom: null,
                     once_date: v.date || _modal.date || null };
        default:
            return { repeat: v.repeat, repeat_days: null,
                     monthly_week: null, monthly_dow: null, yearly_month: null, yearly_dom: null, once_date: null };
    }
}

async function _saveModal() {
    const v = _getModalValues();
    if (!v.name) { showToast('请输入名称', 'error'); return; }
    if (!v.allDay && (!v.start || !v.end)) { showToast('请设置时间', 'error'); return; }
    if (!v.allDay && v.start && v.end && v.start >= v.end) { showToast('结束时间必须晚于开始时间', 'error'); return; }

    // Overlap check (skip for all-day events and container 'all' scope edits)
    if (!v.allDay && v.start && v.end) {
        const checkDate = v.date || _modal.date;
        const excludeId = _modal.mode === 'edit' ? _modal.id : null;
        if (checkDate && !(_modal.type === 'container' && v.scope === 'all')) {
            const conflicts = await _checkOverlap(checkDate, v.start, v.end, excludeId);
            if (conflicts.length > 0) {
                const msg = `与以下日程时间冲突：\n- ${conflicts.join('\n- ')}\n\n是否继续保存？`;
                if (!confirm(msg)) return;
            }
        }
    }

    if (_modal.mode === 'create') {
        if (_modal.type === 'container') {
            await TimeWhereDB.addContainer({
                name: v.name, color: v.color,
                time_start: v.start, time_end: v.end,
                layer: v.layer,
                ..._repeatPayload(v)
            });
            showToast('时间容器已创建', 'success');
        } else {
            if (!v.date) { showToast('请选择日期', 'error'); return; }
            await TimeWhereDB.addEvent({
                title: v.name, date: v.date,
                time_start: v.allDay ? null : v.start,
                time_end:   v.allDay ? null : v.end,
                color: v.color, source: 'manual',
                ..._repeatPayload(v)
            });
            showToast('日程事件已创建', 'success');
        }
    } else {
        if (_modal.type === 'container') {
            if (v.scope === 'once') {
                await TimeWhereDB.addEvent({
                    title: v.name, date: _modal.date,
                    time_start: v.start, time_end: v.end,
                    color: v.color, source: 'container_override',
                    container_id: _modal.id
                });
                showToast('此次已修改', 'success');
            } else {
                await TimeWhereDB.updateContainer(_modal.id, {
                    name: v.name, color: v.color,
                    time_start: v.start, time_end: v.end,
                    layer: v.layer,
                    ..._repeatPayload(v)
                });
                showToast('时间容器已更新', 'success');
            }
        } else {
            await TimeWhereDB.updateEvent(_modal.id, {
                title: v.name, date: v.date || _modal.date,
                time_start: v.allDay ? null : v.start,
                time_end:   v.allDay ? null : v.end,
                color: v.color,
                ..._repeatPayload(v)
            });
            showToast('日程事件已更新', 'success');
        }
    }
    closeCalModal();
    render();
}

async function _deleteContainerOnce() {
    await TimeWhereDB.addEvent({
        title: '', date: _modal.date,
        time_start: '00:00', time_end: '00:00',
        color: '#000', source: 'container_skip',
        container_id: _modal.id
    });
    closeCalModal();
    render();
    showToast('此次已删除', 'success');
}

async function _deleteContainerAll() {
    if (!confirm('确定删除整个时间容器及所有此容器的覆盖记录吗？')) return;
    await TimeWhereDB.deleteContainer(_modal.id);
    // Clean up overrides / skips for this container
    await TimeWhereDB.db.events.filter(e => e.container_id === _modal.id).delete();
    closeCalModal();
    render();
    showToast('时间容器已删除', 'success');
}

async function _deleteEvent() {
    if (!confirm('确定要删除这个日程事件吗？')) return;
    await TimeWhereDB.deleteEvent(_modal.id);
    closeCalModal();
    render();
    showToast('日程事件已删除', 'success');
}

function closeCalModal() {
    document.getElementById('calModal').style.display = 'none';
}

function getRepeatLabel(repeat) {
    const map = { daily: '每天', weekday: '工作日', weekend: '周末', custom: '指定星期', once: '仅一次' };
    return map[repeat] || repeat;
}

if (typeof window !== 'undefined') {
    window.TimeWhereCalendarTest = {
        eventAppliesToDate,
        expandEventsForDateRange,
        getCalendarTasksForDate,
        assignCalendarTasksToContainers,
        buildRepeatOptions,
        buildRepeatControlHTML,
        getMonthItemClass,
        _repeatPayload,
        _repeatLabel
    };
}
