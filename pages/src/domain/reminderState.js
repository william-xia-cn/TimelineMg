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

function minutesLater(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

function sameTaskSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const left = [...a].map(String).sort();
  const right = [...b].map(String).sort();
  return left.every((value, index) => value === right[index]);
}

function baseSession(reminderState, now) {
  const taskIds = (reminderState.items || []).map(item => item.id).filter(Boolean);
  return {
    session_id: `work-reminder-${now.getTime()}`,
    status: 'notification_due',
    created_at: now.toISOString(),
    last_notified_at: null,
    notification_closed_at: null,
    handled_at: null,
    execution_check_at: null,
    task_ids: taskIds,
    items: reminderState.items || [],
    total_count: reminderState.total || 0,
    cooldown_until: null
  };
}

export function advanceReminderSession({ previousSession = null, reminderState, now = new Date(), event = null } = {}) {
  if (!reminderState || reminderState.status !== 'due') {
    return {
      ...(previousSession || {}),
      status: reminderState?.status === 'disabled' ? 'disabled' : 'idle',
      task_ids: [],
      items: [],
      total_count: 0,
      ended_at: now.toISOString()
    };
  }

  const taskIds = (reminderState.items || []).map(item => item.id).filter(Boolean);
  const workChanged = !previousSession || !sameTaskSet(previousSession.task_ids || [], taskIds);
  let session = workChanged || previousSession.status === 'stopped'
    ? baseSession(reminderState, now)
    : { ...previousSession, task_ids: taskIds, items: reminderState.items || [], total_count: reminderState.total || 0 };

  if (event?.type === 'notification_sent') {
    return {
      ...session,
      status: 'notification_visible',
      last_notified_at: event.at || now.toISOString(),
      notification_closed_at: null,
      cooldown_until: null
    };
  }

  if (event?.type === 'notification_closed') {
    return {
      ...session,
      status: 'notification_closed',
      notification_closed_at: event.at || now.toISOString(),
      cooldown_until: minutesLater(now, 1)
    };
  }

  if (event?.type === 'notification_clicked') {
    return {
      ...session,
      status: 'execution_check_scheduled',
      handled_at: event.at || now.toISOString(),
      execution_check_at: minutesLater(now, 30),
      cooldown_until: null
    };
  }

  if (event?.type === 'stop_session') {
    return {
      ...session,
      status: 'stopped',
      handled_at: event.at || now.toISOString(),
      cooldown_until: null
    };
  }

  if (session.status === 'notification_closed' && session.cooldown_until && new Date(session.cooldown_until).getTime() <= now.getTime()) {
    return { ...session, status: 'notification_due', cooldown_until: null };
  }

  if (session.status === 'execution_check_scheduled' && session.execution_check_at && new Date(session.execution_check_at).getTime() <= now.getTime()) {
    return { ...session, status: 'execution_check_due', cooldown_until: null };
  }

  return session;
}
