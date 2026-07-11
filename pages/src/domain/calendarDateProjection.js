function minutesFromTime(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return Math.max(0, Math.min(24 * 60 - 1, hour * 60 + minute));
}

function dateFromKey(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function weekdayKind(date) {
  const day = date.getDay();
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

function isCompleted(task) {
  return task?.progress === 'completed' || task?.status === 'completed';
}

function priorityRank(priority) {
  const normalized = String(priority || 'medium').toLowerCase();
  if (normalized === 'urgent' || normalized === 'p1') return 0;
  if (normalized === 'important' || normalized === 'p2') return 1;
  if (normalized === 'medium' || normalized === 'p3') return 2;
  return 3;
}

function compareTimeThenPriority(a, b) {
  const at = minutesFromTime(a.schedule_time || a.time_start);
  const bt = minutesFromTime(b.schedule_time || b.time_start);
  if (at !== null && bt !== null && at !== bt) return at - bt;
  if (at !== null && bt === null) return -1;
  if (at === null && bt !== null) return 1;
  return priorityRank(a.priority) - priorityRank(b.priority);
}

function containerAppliesToDate(container, dateKey) {
  if (!container || container.enabled === false) return false;
  if (container.active_start_date && container.active_start_date > dateKey) return false;
  if (container.active_end_date && container.active_end_date < dateKey) return false;
  const repeat = container.repeat || 'daily';
  const date = dateFromKey(dateKey);
  if (repeat === 'weekday') return weekdayKind(date) === 'weekday';
  if (repeat === 'weekend') return weekdayKind(date) === 'weekend';
  if (repeat === 'once') return container.date === dateKey || container.active_start_date === dateKey;
  if (repeat === 'weekly' && Array.isArray(container.days)) return container.days.includes(date.getDay());
  return true;
}

function taskAppliesToDate(task, dateKey) {
  if (!task || isCompleted(task)) return false;
  if (task.start_date && task.start_date > dateKey) return false;
  if (task.due_date && task.due_date < dateKey) return true;
  if (task.due_date === dateKey) return true;
  if (task.schedule_time && (!task.due_date || task.due_date >= dateKey)) return true;
  return !task.due_date && !task.start_date;
}

export function computeCalendarDateProjection({ date, tasks = [], events = [], containers = [] } = {}) {
  const dateKey = date || new Date().toISOString().slice(0, 10);
  const dayContainers = containers
    .filter(container => containerAppliesToDate(container, dateKey))
    .sort((a, b) => (minutesFromTime(a.time_start) ?? 9999) - (minutesFromTime(b.time_start) ?? 9999));
  const dayEvents = events
    .filter(event => event.date === dateKey || (event.active_start_date && event.active_start_date <= dateKey && (!event.active_end_date || event.active_end_date >= dateKey)))
    .sort(compareTimeThenPriority);
  const dayTasks = tasks
    .filter(task => taskAppliesToDate(task, dateKey))
    .sort(compareTimeThenPriority);
  const timedItems = [
    ...dayContainers.map(container => ({ kind: 'container', id: container.id, title: container.name, time_start: container.time_start, time_end: container.time_end, source: container })),
    ...dayEvents.map(event => ({ kind: 'event', id: event.id, title: event.title, time_start: event.time_start, time_end: event.time_end, source: event })),
    ...dayTasks.filter(task => task.schedule_time).map(task => ({ kind: 'task', id: task.id, title: task.title, time_start: task.schedule_time, duration: task.duration, source: task }))
  ].sort((a, b) => (minutesFromTime(a.time_start) ?? 9999) - (minutesFromTime(b.time_start) ?? 9999));
  return {
    date: dateKey,
    containers: dayContainers,
    events: dayEvents,
    tasks: dayTasks,
    timedItems,
    counts: {
      containers: dayContainers.length,
      events: dayEvents.length,
      tasks: dayTasks.length,
      timed: timedItems.length
    }
  };
}
