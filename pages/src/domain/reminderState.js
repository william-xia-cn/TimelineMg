function isCompleted(task) {
  return task?.progress === 'completed' || task?.status === 'completed';
}

function needsAttention(task) {
  if (!task || isCompleted(task)) return false;
  return Boolean(task.schedule_time || task.due_date || task.start_date || task.priority === 'urgent');
}

function priorityRank(priority) {
  const normalized = String(priority || 'medium').toLowerCase();
  if (normalized === 'urgent' || normalized === 'p1') return 0;
  if (normalized === 'important' || normalized === 'p2') return 1;
  if (normalized === 'medium' || normalized === 'p3') return 2;
  return 3;
}

export function computeReminderState({ tasks = [], now = new Date(), remindersEnabled = true } = {}) {
  const candidates = tasks.filter(needsAttention);
  const sorted = candidates.sort((a, b) => {
    if ((a.schedule_time || '') !== (b.schedule_time || '')) return (a.schedule_time || '99:99').localeCompare(b.schedule_time || '99:99');
    if ((a.due_date || '') !== (b.due_date || '')) return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
    return priorityRank(a.priority) - priorityRank(b.priority);
  });
  if (!remindersEnabled) {
    return { status: 'disabled', label: 'Reminders disabled', total: sorted.length, items: sorted.slice(0, 3), generated_at: now.toISOString() };
  }
  if (sorted.length === 0) {
    return { status: 'idle', label: 'No current work reminder needed', total: 0, items: [], generated_at: now.toISOString() };
  }
  return {
    status: 'due',
    label: sorted.length === 1 ? '1 task needs attention' : `${sorted.length} tasks need attention`,
    total: sorted.length,
    items: sorted.slice(0, 3).map(task => ({ id: task.id, title: task.title, due_date: task.due_date, schedule_time: task.schedule_time, priority: task.priority })),
    overflow: Math.max(0, sorted.length - 3),
    generated_at: now.toISOString()
  };
}
