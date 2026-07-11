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

function repeatDays(source) {
  if (Array.isArray(source?.repeat_days)) return source.repeat_days;
  if (Array.isArray(source?.days)) return source.days;
  if (typeof source?.repeat_days === 'string') {
    try {
      const parsed = JSON.parse(source.repeat_days);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isInsideActiveRange(source, dateKey) {
  const start = source.active_start_date || (source.repeat && source.repeat !== 'none' ? source.date : null);
  if (start && start > dateKey) return false;
  if (source.active_end_date && source.active_end_date < dateKey) return false;
  return true;
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
  if (!isInsideActiveRange(container, dateKey)) return false;
  const repeat = container.repeat || 'daily';
  const date = dateFromKey(dateKey);
  if (repeat === 'none') return false;
  if (repeat === 'weekday') return weekdayKind(date) === 'weekday';
  if (repeat === 'weekend') return weekdayKind(date) === 'weekend';
  if (repeat === 'once') return (container.once_date || container.date || container.active_start_date) === dateKey;
  if (repeat === 'weekly' || repeat === 'custom') return repeatDays(container).includes(date.getDay());
  return true;
}

function eventAppliesToDate(event, dateKey) {
  if (!event) return false;
  const repeat = event.repeat || 'none';
  const date = dateFromKey(dateKey);
  if (repeat === 'none') return event.date === dateKey;
  if (repeat === 'once') return (event.once_date || event.date) === dateKey;
  if (!isInsideActiveRange(event, dateKey)) return false;
  if (repeat === 'daily') return true;
  if (repeat === 'weekday') return weekdayKind(date) === 'weekday';
  if (repeat === 'weekend') return weekdayKind(date) === 'weekend';
  if (repeat === 'weekly' || repeat === 'custom') return repeatDays(event).includes(date.getDay());
  return event.date === dateKey;
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
    .filter(event => eventAppliesToDate(event, dateKey))
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
