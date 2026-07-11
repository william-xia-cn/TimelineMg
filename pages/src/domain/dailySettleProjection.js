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

function repeatDays(container) {
  if (Array.isArray(container?.repeat_days)) return container.repeat_days;
  if (Array.isArray(container?.days)) return container.days;
  return [];
}

function isCompleted(task) {
  return task?.progress === 'completed' || task?.status === 'completed';
}

function taskAppliesToday(task, today) {
  if (!task || isCompleted(task)) return false;
  if (task.start_date && task.start_date > today) return false;
  return true;
}

function containerAppliesToday(container, now) {
  if (!container || container.enabled === false) return false;
  const today = localDateKey(now);
  if (container.active_start_date && container.active_start_date > today) return false;
  if (container.active_end_date && container.active_end_date < today) return false;
  const repeat = container.repeat || 'daily';
  const day = now.getDay();
  if (repeat === 'none') return false;
  if (repeat === 'weekday') return weekdayKind(now) === 'weekday';
  if (repeat === 'weekend') return weekdayKind(now) === 'weekend';
  if (repeat === 'once') return (container.once_date || container.date || container.active_start_date) === today;
  if (repeat === 'weekly' || repeat === 'custom') return repeatDays(container).includes(day);
  return true;
}

function isActiveContainer(container, now) {
  const start = minutesFromTime(container.time_start);
  const end = minutesFromTime(container.time_end);
  if (start === null || end === null) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= start && current < end;
}

function getLayer(container) {
  if (Number.isFinite(Number(container?.layer))) return Number(container.layer);
  return String(container?.name || '').includes('学习') ? 1 : 2;
}

function capacityMinutes(container) {
  const start = minutesFromTime(container.time_start);
  const end = minutesFromTime(container.time_end);
  if (start === null || end === null || end <= start) return 0;
  return end - start;
}

function durationMinutes(task) {
  const value = Number(task?.duration || 45);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 45;
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

function compareContainers(a, b) {
  const layerDelta = getLayer(a) - getLayer(b);
  if (layerDelta !== 0) return layerDelta;
  return (minutesFromTime(a.time_start) ?? 9999) - (minutesFromTime(b.time_start) ?? 9999);
}

function taskFitsContainer(task, container) {
  const scheduled = minutesFromTime(task.schedule_time);
  if (scheduled === null) return true;
  const start = minutesFromTime(container.time_start);
  const end = minutesFromTime(container.time_end);
  if (start === null || end === null) return true;
  return scheduled >= start && scheduled < end;
}

function assignTasksToContainers(taskPool, dayContainers, now) {
  const containerInfo = dayContainers
    .slice()
    .sort(compareContainers)
    .map(container => ({
      container,
      tasks: [],
      used: 0,
      capacity: capacityMinutes(container),
      layer: getLayer(container),
      active: isActiveContainer(container, now)
    }));
  const unassigned = [];

  for (const task of taskPool) {
    const duration = durationMinutes(task);
    const candidates = containerInfo.filter(info => taskFitsContainer(task, info.container));
    const target = candidates.find(info => info.capacity === 0 || info.used + duration <= info.capacity || info.tasks.length === 0);
    if (!target) {
      unassigned.push({ ...task, calendar_assignment: 'unassigned' });
      continue;
    }
    target.tasks.push({
      ...task,
      calendar_assignment: target.active ? 'current' : 'assigned',
      assignment_container_id: target.container.id
    });
    target.used += duration;
  }

  return { containerInfo, unassigned };
}

export function computeDashboardProjection({ tasks = [], containers = [], now = new Date() } = {}) {
  const today = localDateKey(now);
  const taskPool = tasks.filter(task => taskAppliesToday(task, today)).sort(compareTasks);
  const dayContainers = containers.filter(container => containerAppliesToday(container, now));
  const activeContainer = dayContainers.find(container => isActiveContainer(container, now)) || null;
  const { containerInfo, unassigned } = assignTasksToContainers(taskPool, dayContainers, now);
  const currentContainerInfo = containerInfo.find(info => info.active && info.tasks.length > 0)
    || containerInfo.find(info => !info.active && info.tasks.length > 0 && (minutesFromTime(info.container.time_end) ?? 0) > (now.getHours() * 60 + now.getMinutes()))
    || null;
  const currentTasks = currentContainerInfo ? currentContainerInfo.tasks : taskPool.slice(0, 5);
  const assignedTasks = containerInfo.flatMap(info => info.tasks.map(task => ({
    ...task,
    assignment_status: info.active ? 'current' : 'upcoming',
    assignment_container_id: info.container.id
  })));
  const assignedIds = new Set(assignedTasks.map(task => String(task.id)));
  const displayTasks = [
    ...assignedTasks,
    ...unassigned,
    ...taskPool.filter(task => !assignedIds.has(String(task.id)) && !unassigned.some(item => String(item.id) === String(task.id)))
  ];

  return {
    today,
    activeContainer,
    currentContainerInfo,
    currentTasks,
    displayTasks,
    assignedContainers: containerInfo,
    unassigned,
    pendingCount: taskPool.length,
    hasActiveContainer: Boolean(activeContainer)
  };
}
