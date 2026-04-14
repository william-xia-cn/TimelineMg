console.log('[Calendar] script.js loaded');

let currentView = 'week';
let currentDate = new Date();
const TIME_RANGE = { startHour: 6, endHour: 22, pxPerHour: 40 };

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Calendar] DOMContentLoaded fired');
    
    // Debug: Query database in DOMContentLoaded
    if (typeof TimeWhereDB !== 'undefined') {
        console.log('[DEBUG] === DATABASE CONTENTS ===');
        
        const allContainers = await TimeWhereDB.getContainers({});
        console.log('[DEBUG] Containers (all):', allContainers.slice(0, 20));
        
        const enabledContainers = await TimeWhereDB.getContainers({ enabled: true });
        console.log('[DEBUG] Containers (enabled only):', enabledContainers.slice(0, 20));
        
        const allEvents = await TimeWhereDB.db.events.toArray();
        console.log('[DEBUG] Events (first 20):', allEvents.slice(0, 20));
        
        console.log('[DEBUG] === END DATABASE ===');
        
        // DEBUG: Seed test data if no data
        if (allContainers.length === 0 && allEvents.length === 0) {
            console.log('[DEBUG] Seeding test data...');
            await TimeWhereDB.addContainer({
                name: '早自习',
                color: '#4A90D9',
                time_start: '07:00',
                time_end: '08:00',
                repeat: 'daily',
                enabled: true
            });
            await TimeWhereDB.addContainer({
                name: '数学课',
                color: '#E74C3C',
                time_start: '09:00',
                time_end: '10:30',
                repeat: 'weekday',
                enabled: true
            });
            const today = new Date().toISOString().split('T')[0];
            await TimeWhereDB.addEvent({
                title: '会议A',
                date: today,
                time_start: '14:00',
                time_end: '15:00',
                color: '#27AE60'
            });
            await TimeWhereDB.addEvent({
                title: '会议B',
                date: today,
                time_start: '14:30',
                time_end: '15:30',
                color: '#F39C12'
            });
            console.log('[DEBUG] Test data seeded. Please refresh.');
        }
    } else {
        console.log('[DEBUG] TimeWhereDB not defined!');
    }
    
    await initApp();
    setupCalendar();
    checkInitMode();

    // 从其他页面（如设置页面导入）切换回来时重新渲染
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            render();
        }
    });
});

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

function render() {
    updateCurrentDateDisplay();
    if (currentView === 'week') {
        renderWeekView();
    } else {
        renderMonthView();
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

    const weekStart = dates[0].toISOString().split('T')[0];
    const weekEnd   = dates[dates.length - 1].toISOString().split('T')[0];
    const dbEvents  = (await TimeWhereDB.getEventsByDateRange(weekStart, weekEnd)) || [];

    dates.forEach(date => {
        const wrapper = document.createElement('div');
        wrapper.className = 'allday-wrapper';
        const dateStr = date.toISOString().split('T')[0];

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

// 调度相关函数从 shared/js/scheduling.js 导入
const { containerAppliesToDate, _nthWeekdayOfMonth,
        dailySettle, getContainerLayer, priorityLabel, priorityClass } = window.TimeWhereScheduling;

async function renderWeekColumns(dates) {
    const container = document.getElementById('weekColumns');
    if (!container) return;

    container.innerHTML = '';

    const allContainers = (await TimeWhereDB.getContainers({ enabled: true })) || [];
    const weekStart = dates[0].toISOString().split('T')[0];
    const weekEnd = dates[6].toISOString().split('T')[0];
    const dbEvents = (await TimeWhereDB.getEventsByDateRange(weekStart, weekEnd)) || [];

    // 加载任务，用于 Daily Settle
    const allTasks = (await TimeWhereDB.getAllTasks()) || [];

    dates.forEach((date, index) => {
        const col = document.createElement('div');
        col.className = 'day-col';
        col.id = `col-${index}`;
        const dateStr = date.toISOString().split('T')[0];
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

        // 当日任务池（start_date ≤ 该日 且未完成）
        const taskPool = allTasks.filter(t =>
            t.progress !== 'completed' &&
            t.start_date && t.start_date <= dateStr
        );

        // Daily Settle — 用该日正午作为"当前时间"（让所有容器都处于"未来"状态参与分配）
        const dayNoon = new Date(dateStr + 'T12:00:00');
        const settle = dailySettle(taskPool, dayContainers, dayNoon);

        const containerEvents = dayContainers.map(c => ({
            title: c.name,
            time_start: c.time_start,
            time_end: c.time_end,
            color: c.color,
            type: 'container',
            id: c.id,
            source: 'container',
            layer: getContainerLayer(c),
            tasks: settle.result.get(c.id)?.tasks || []
        }));

        const dateEvents = dbEvents.filter(e => e.date === dateStr && e.source !== 'container_skip').map(e => ({
            title: e.title,
            time_start: e.time_start,
            time_end: e.time_end,
            color: e.color,
            type: 'event',
            id: e.id,
            source: e.source || 'manual'
        }));

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
    const title = item.title || item.name || '未命名';
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
        if (layer === 1) {
            // 学习时间 — 实色背景 + 深色左边框
            event.className = 'gcal-event layer-1';
            event.style.backgroundColor = color;
            event.style.borderLeft = `3px solid ${darkenColor(color, 0.3)}`;
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
                const pLabel = priorityLabel(t.priority);
                const pCls = priorityClass(t.priority);
                const timedMark = t.schedule_time ? `<span class="task-timed">${t.schedule_time}</span>` : '';
                return `<div class="container-task-item">
                    <span class="task-priority-dot ${pCls}" title="${pLabel}"></span>
                    <span class="task-item-title">${t.title || '无标题'}</span>
                    <span class="task-item-dur">${t.duration || 45}m</span>
                    ${timedMark}
                </div>`;
            }).join('') +
        `</div>`;
    }

    event.innerHTML = `<h4>${title}</h4><span>${startTimeStr} - ${endTimeStr}</span>${tasksHTML}`;

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
        cell.dataset.date = date.toISOString().split('T')[0];
        
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
    const visStart = startDate.toISOString().split('T')[0];
    const visEnd = new Date(startDate.getTime() + (totalDays - 1) * 86400000).toISOString().split('T')[0];

    const allContainers = (await TimeWhereDB.getContainers({ enabled: true })) || [];
    const dbEvents = (await TimeWhereDB.getEventsByDateRange(visStart, visEnd)) || [];
    const cells = document.querySelectorAll('.month-cell');

    for (let i = 0; i < totalDays && i < cells.length; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);

        const dayOfWeek = date.getDay();
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dateStr = date.toISOString().split('T')[0];

        // Override/skip filtering (same logic as renderWeekColumns)
        const dayOverrides = dbEvents.filter(e => e.date === dateStr &&
            (e.source === 'container_override' || e.source === 'container_skip'));
        const overriddenIds = new Set(dayOverrides.filter(e => e.source === 'container_override').map(e => e.container_id));
        const skippedIds = new Set(dayOverrides.filter(e => e.source === 'container_skip').map(e => e.container_id));

        // Containers that apply today (excluding skipped/overridden)
        const containerItems = allContainers
            .filter(c => !skippedIds.has(c.id) && !overriddenIds.has(c.id))
            .filter(c => containerAppliesToDate(c, date, dateStr, dayOfWeek, isWeekday, isWeekend))
            .map(c => ({ type: 'container', id: c.id, title: c.name, color: c.color, time_start: c.time_start, time_end: c.time_end }));

        // Override events replace their container on this date
        const overrideItems = dayOverrides
            .filter(e => e.source === 'container_override')
            .map(e => ({ type: 'event', id: e.id, title: e.title, color: e.color, time_start: e.time_start, time_end: e.time_end }));

        // Regular manual/timetable events (skip skip/override source events from display)
        const eventItems = dbEvents
            .filter(e => e.date === dateStr && e.source !== 'container_override' && e.source !== 'container_skip')
            .map(e => ({ type: 'event', id: e.id, title: e.title, color: e.color, time_start: e.time_start, time_end: e.time_end }));

        const allItems = [...containerItems, ...overrideItems, ...eventItems]
            .sort((a, b) => (a.time_start || '').localeCompare(b.time_start || ''));

        const maxEvents = 3;
        const displayItems = allItems.slice(0, maxEvents);
        const remaining = allItems.length - maxEvents;

        displayItems.forEach(ev => {
            const eventEl = document.createElement('div');
            eventEl.className = 'month-event';
            eventEl.style.backgroundColor = ev.color || '#4A90D9';
            eventEl.textContent = ev.title;
            eventEl.title = ev.time_start && ev.time_end
                ? `${ev.title} (${ev.time_start} - ${ev.time_end})`
                : ev.title;
            eventEl.dataset.type = ev.type;
            eventEl.dataset.id = String(ev.id);
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
    const dayEvents = (await TimeWhereDB.getEvents({ date })) || [];
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
        if (!col) return;

        const rect = col.getBoundingClientRect();
        const clickY = e.clientY - rect.top + col.closest('.calendar-body').scrollTop;
        const hour = TIME_RANGE.startHour + Math.floor(clickY / TIME_RANGE.pxPerHour);
        const minute = Math.round(((clickY % TIME_RANGE.pxPerHour) / TIME_RANGE.pxPerHour) * 60 / 15) * 15;

        if (hour < TIME_RANGE.startHour || hour > TIME_RANGE.endHour) return;

        const date = col.dataset.date;
        const timeStart = `${String(Math.min(hour, TIME_RANGE.endHour)).padStart(2, '0')}:${String(Math.min(minute, 45)).padStart(2, '0')}`;
        const endHour = minute + 60 >= 60 ? hour + 1 : hour;
        const endMin  = (minute + 60) % 60;
        const timeEnd = `${String(Math.min(endHour, 23)).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;

        openCreateModal(date, timeStart, timeEnd);
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
            ? `<div class="tt-time">${timeStr} · ${_repeatLabel(data)}</div>`
            : `<div class="tt-time">${data.date} ${timeStr}</div>${data.description ? `<div class="tt-desc">${data.description.slice(0, 60)}</div>` : ''}`;
        el.innerHTML = `<div class="tt-title">${title}</div>${extra}`;
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
        const startOfWeek = getStartOfWeek(currentDate);
        const date = new Date(startOfWeek);
        date.setDate(date.getDate() + idx);
        openEditModal(type, id, date.toISOString().split('T')[0]);
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
        await createDefaultContainers();
    }
}

async function createDefaultContainers() {
    const containers = [
        { name: '学习时间', color: '#4A90D9', time_start: '18:30', time_end: '21:30', repeat: 'weekday', task_types: ['homework', 'test', 'notes', 'review'], defense: 'soft', squeezing: 'p1_only' },
        { name: '自由时间', color: '#7B68EE', time_start: '21:30', time_end: '23:00', repeat: 'daily', task_types: ['project', 'other'], defense: 'soft', squeezing: 'p1_p2' },
        { name: '睡前时间', color: '#2E8B57', time_start: '23:00', time_end: '23:30', repeat: 'daily', task_types: ['notes', 'review'], defense: 'hard', squeezing: 'none' }
    ];
    
    if (document.getElementById('enableStudyContainer')?.checked === false) {
        containers.shift();
    }
    if (document.getElementById('enableFreeContainer')?.checked === false) {
        containers.splice(1, 1);
    }
    if (document.getElementById('enableSleepContainer')?.checked === false) {
        containers.pop();
    }
    
    for (const container of containers) {
        await TimeWhereDB.addContainer(container);
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
        await parseICS(icsContent);
    };
    reader.readAsText(file);
}

/**
 * 解析 DTSTART/DTEND 行，返回 { date, time } 对象。
 * 处理 UTC（Z 后缀）→ Asia/Shanghai (UTC+8) 转换。
 */
function parseDTLine(line) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return null;
    const value = line.substring(colonIdx + 1).trim();
    const isUTC = value.endsWith('Z');

    const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
    if (!match) return null;

    let year = parseInt(match[1]);
    let month = parseInt(match[2]);
    let day = parseInt(match[3]);

    if (!match[4]) {
        // 全天事件，无时间部分
        return { date: `${match[1]}-${match[2]}-${match[3]}`, time: null };
    }

    let hour = parseInt(match[4]);
    let minute = parseInt(match[5]);

    if (isUTC) {
        // UTC → UTC+8
        const utc = new Date(Date.UTC(year, month - 1, day, hour, minute));
        const local = new Date(utc.getTime() + 8 * 3600 * 1000);
        year   = local.getUTCFullYear();
        month  = local.getUTCMonth() + 1;
        day    = local.getUTCDate();
        hour   = local.getUTCHours();
        minute = local.getUTCMinutes();
    }

    return {
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    };
}

/**
 * 将 ICS 文本解析为事件对象数组（纯函数，不写 DB）。
 * 修复：1) 展开 RFC 5545 折行  2) UTC→+8 转换  3) 解转义 SUMMARY
 */
function parseICSToEvents(content) {
    // RFC 5545 §3.1: 续行以 CRLF + 空格/Tab 开头，展开后去掉该前缀
    const unfolded = content.replace(/\r?\n[ \t]/g, '');
    const lines = unfolded.split(/\r?\n/);

    const events = [];
    let cur = null;

    for (const line of lines) {
        if (line === 'BEGIN:VEVENT') {
            cur = {};
        } else if (line === 'END:VEVENT' && cur) {
            events.push(cur);
            cur = null;
        } else if (cur) {
            if (line.startsWith('SUMMARY:')) {
                // ICS 转义: \, → ,  \n → 空格  \\ → \
                cur.summary = line.substring(8)
                    .replace(/\\,/g, ',')
                    .replace(/\\n/g, ' ')
                    .replace(/\\\\/g, '\\');
            } else if (line.startsWith('DTSTART')) {
                const parsed = parseDTLine(line);
                if (parsed) { cur.startDate = parsed.date; cur.startTime = parsed.time; }
            } else if (line.startsWith('DTEND')) {
                const parsed = parseDTLine(line);
                if (parsed) { cur.endDate = parsed.date; cur.endTime = parsed.time; }
            }
        }
    }

    return events;
}

async function parseICS(content) {
    const events = parseICSToEvents(content);
    showToast(`解析到 ${events.length} 个事件`, 'info');

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
            <button class="type-btn ${!isContainer ? 'active' : ''}" data-type="event">单次事件</button>
        </div>` : '';

    const colorSwatches = MODAL_COLORS.map(c => {
        const cur = data?.color || '#4A90D9';
        return `<div class="color-swatch${c === cur ? ' active' : ''}" data-color="${c}" style="background:${c}"></div>`;
    }).join('');

    let bodyHTML = typeToggle;

    if (isContainer) {
        const refDate = _modal.date || date || new Date().toISOString().split('T')[0];
        const repeat = data?.repeat || 'weekday';
        const repeatDays = data?.repeat_days || [];
        const customDisplay = repeat === 'custom' ? '' : 'display:none';
        const dayLabels = ['日','一','二','三','四','五','六'];
        const dayBtns = [0,1,2,3,4,5,6].map(d =>
            `<button class="day-btn${repeatDays.includes(d) ? ' active' : ''}" data-day="${d}">${dayLabels[d]}</button>`
        ).join('');
        const repeatOpts = buildRepeatOptions(refDate, data || { repeat: 'weekday' });

        bodyHTML += `
            <div class="form-group">
                <label>名称</label>
                <input type="text" id="modalName" value="${data?.name || ''}" placeholder="输入容器名称">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>开始</label>
                    <input type="time" id="modalStart" value="${data?.time_start || timeStart || '09:00'}">
                </div>
                <div class="form-group">
                    <label>结束</label>
                    <input type="time" id="modalEnd" value="${data?.time_end || timeEnd || '10:00'}">
                </div>
            </div>
            <div class="form-group">
                <label>重复</label>
                <select id="modalRepeat">${repeatOpts}</select>
                <div class="custom-days" id="customDays" style="${customDisplay}">${dayBtns}</div>
            </div>
            <div class="form-group">
                <label>颜色</label>
                <div class="color-picker" id="modalColorPicker">${colorSwatches}</div>
            </div>
            <div class="form-group">
                <label>类型</label>
                <div class="layer-toggle" id="layerToggle">
                    <button class="layer-btn${(data?.layer ?? 1) === 1 ? ' active' : ''}" data-layer="1">学习时间</button>
                    <button class="layer-btn${(data?.layer ?? 1) === 2 ? ' active' : ''}" data-layer="2">自由时间</button>
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
        bodyHTML += `
            <div class="form-group">
                <label>标题</label>
                <input type="text" id="modalName" value="${data?.title || ''}" placeholder="输入事件标题">
            </div>
            <div class="form-group">
                <label>日期</label>
                <input type="date" id="modalDate" value="${data?.date || date || ''}">
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
                    <input type="time" id="modalStart" value="${data?.time_start || timeStart || '09:00'}">
                </div>
                <div class="form-group">
                    <label>结束</label>
                    <input type="time" id="modalEnd" value="${data?.time_end || timeEnd || '10:00'}">
                </div>
            </div>
            <div class="form-group">
                <label>颜色</label>
                <div class="color-picker" id="modalColorPicker">${colorSwatches}</div>
            </div>`;
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
    // Returns the repeat-related fields to persist in the container
    switch (v.repeat) {
        case 'weekly':
            return { repeat: 'weekly', repeat_days: [isNaN(v.weeklyDay) ? 1 : v.weeklyDay],
                     monthly_week: null, monthly_dow: null, yearly_month: null, yearly_dom: null };
        case 'monthly_nth':
            return { repeat: 'monthly_nth', repeat_days: null,
                     monthly_week: isNaN(v.monthlyNth) ? 1 : v.monthlyNth,
                     monthly_dow: isNaN(v.monthlyDow) ? 0 : v.monthlyDow,
                     yearly_month: null, yearly_dom: null };
        case 'yearly':
            return { repeat: 'yearly', repeat_days: null, monthly_week: null, monthly_dow: null,
                     yearly_month: isNaN(v.yearlyMonth) ? 1 : v.yearlyMonth,
                     yearly_dom: isNaN(v.yearlyDom) ? 1 : v.yearlyDom };
        case 'custom':
            return { repeat: 'custom', repeat_days: v.repeatDays,
                     monthly_week: null, monthly_dow: null, yearly_month: null, yearly_dom: null };
        default:
            return { repeat: v.repeat, repeat_days: null,
                     monthly_week: null, monthly_dow: null, yearly_month: null, yearly_dom: null };
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
                color: v.color, source: 'manual'
            });
            showToast('事件已创建', 'success');
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
                color: v.color
            });
            showToast('事件已更新', 'success');
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
    if (!confirm('确定要删除这个事件吗？')) return;
    await TimeWhereDB.deleteEvent(_modal.id);
    closeCalModal();
    render();
    showToast('事件已删除', 'success');
}

function closeCalModal() {
    document.getElementById('calModal').style.display = 'none';
}

function getRepeatLabel(repeat) {
    const map = { daily: '每天', weekday: '工作日', weekend: '周末', custom: '指定星期', once: '仅一次' };
    return map[repeat] || repeat;
}
