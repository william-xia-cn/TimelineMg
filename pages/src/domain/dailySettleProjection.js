function minutesFromTime(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return Math.max(0, Math.min(24 * 60 - 1, hour * 60 + minute));
}

function priorityRank(priority) {
  const normalized = String(priority || 'medium').toLowerCase();
  if (normalized === 'urgent' || normalized === 'p1') return 0;
  if (normalized === 'important' || normalized === 'p2') return 1;
  if (normalized === 'medium' || normalized === 'p3') return 2;
  return 3;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function weekdayKind(date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return 'weekend';
  return 'weekday';
}

function isCompleted(task) {
  return task?.progress === 'completed' || task?.status === 'completed';
}

function taskAppliesToday(task, today) {
  if (!task || isCompleted(task)) return false;
  if (task.start_date && task.start_date > today) return false;
  return true;
}

function containerAppliesNow(container, now) {
  if (!container || container.enabled === false) return false;
  const today = localDateKey(now);
  if (container.active_start_date && container.active_start_date > today) return false;
  if (container.active_end_date && container.active_end_date < today) return false;
  const repeat = container.repeat || 'daily';
  if (repeat === 'weekday' && weekdayKind(now) !== 'weekday') return false;
  if (repeat === 'weekend' && weekdayKind(now) !== 'weekend') return false;
  const start = minutesFromTime(container.time_start);
  const end = minutesFromTime(container.time_end);
  if (start === null || end === null) return true;
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= start && current < end;
}

function compareTasks(a, b) {
  const aScheduled = minutesFromTime(a.schedule_time);
  const bScheduled = minutesFromTime(b.schedule_time);
  if (aScheduled !== null && bScheduled !== null && aScheduled !== bScheduled) return aScheduled - bScheduled;
  if (aScheduled !== null && bScheduled === null) return -1;
  if (aScheduled === null && bScheduled !== null) return 1;
  if ((a.due_date || '') !== (b.due_date || '')) return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
  return priorityRank(a.priority) - priorityRank(b.priority);
}

export function computeDashboardProjection({ tasks = [], containers = [], now = new Date() } = {}) {
  const today = localDateKey(now);
  const taskPool = tasks.filter(task => taskAppliesToday(task, today)).sort(compareTasks);
  const activeContainer = containers.find(container => containerAppliesNow(container, now)) || null;
  const currentTasks = taskPool.slice(0, 5);
  return {
    today,
    activeContainer,
    currentTasks,
    pendingCount: taskPool.length,
    hasActiveContainer: Boolean(activeContainer)
  };
}
