import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Circle,
  Cloud,
  Database,
  LayoutDashboard,
  ListChecks,
  Pencil,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  Settings,
  Trash2,
  User,
  WifiOff
} from 'lucide-react';
import { apiClient, ApiError } from './api/client.js';
import { createTaskRepository, OfflineWriteBlockedError } from './repositories/taskRepository.js';
import { createCalendarRepository, OfflineCalendarWriteBlockedError } from './repositories/calendarRepository.js';
import { createStructureRepository, OfflineStructureWriteBlockedError } from './repositories/structureRepository.js';
import { createSettingsRepository, OfflineSettingsWriteBlockedError } from './repositories/settingsRepository.js';
import { createMigrationRepository } from './repositories/migrationRepository.js';
import { createBrowserPlatform } from './platform/browserPlatform.js';
import { createLegacyUiAdapter } from './legacyUiAdapter.js';
import { computeDashboardProjection } from './domain/dailySettleProjection.js';
import { computeCalendarDateProjection } from './domain/calendarDateProjection.js';
import { advanceReminderSession, computeReminderState } from './domain/reminderState.js';
import { buildLegacyIndexedDbSnapshot } from './migration/legacyIndexedDbSnapshotAdapter.js';
import { disableGoogleAutoSelect, GOOGLE_SSO_CLIENT_ID, renderGoogleSsoButton } from './auth/googleSso.js';
import { LegacyPageShell } from './LegacyPageShell.jsx';

const SYNC_CURSOR_KEY = 'timewhere.web.sync.cursor.v1';

const seedTasks = [
  { id: 'local-preview-1', title: 'Review WebDev architecture contracts', progress: 'not_started', priority: 'important', due_date: '2026-07-10', source: 'preview' },
  { id: 'local-preview-2', title: 'Prepare Cloudflare schema review', progress: 'not_started', priority: 'medium', due_date: '2026-07-11', source: 'preview' },
  { id: 'local-preview-3', title: 'Confirm automatic migration acceptance cases', progress: 'completed', priority: 'medium', due_date: '2026-07-10', source: 'preview' }
];

const seedEvents = [
  { id: 'local-event-preview-1', title: 'Architecture review block', date: '2026-07-10', time_start: '09:00', time_end: '10:00', source: 'preview' },
  { id: 'local-event-preview-2', title: 'Migration planning focus', date: '2026-07-11', time_start: '14:00', time_end: '15:30', source: 'preview' }
];

const seedPlans = [
  { id: 'local-plan-preview-1', name: 'School', color: '#2364aa', icon_char: 'S', subject: 'School', sort_order: 1, source: 'preview' },
  { id: 'local-plan-preview-2', name: 'Personal', color: '#68d391', icon_char: 'P', subject: 'Personal', sort_order: 2, source: 'preview' }
];

const seedBuckets = [
  { id: 'local-bucket-preview-1', name: 'Focus Work', color: '#2364aa', sort_order: 1, source: 'preview' },
  { id: 'local-bucket-preview-2', name: 'Admin', color: '#68d391', sort_order: 2, source: 'preview' }
];

const seedLabels = [
  { id: 'local-label-preview-1', name: 'Deep Work', color: '#2364aa', source: 'preview' },
  { id: 'local-label-preview-2', name: 'Quick', color: '#68d391', source: 'preview' }
];

const seedContainers = [
  { id: 'local-container-preview-1', name: 'Morning focus', time_start: '09:00', time_end: '11:00', repeat: 'weekday', enabled: true, source: 'preview' },
  { id: 'local-container-preview-2', name: 'Afternoon review', time_start: '14:00', time_end: '15:30', repeat: 'weekday', enabled: true, source: 'preview' }
];

const emptyTaskDraft = {
  title: '',
  due_date: '',
  schedule_time: '',
  duration: 45,
  priority: 'medium',
  recurrence_frequency: 'none',
  recurrence_count: 1,
  notes: ''
};

const emptyEventDraft = {
  title: '',
  date: '',
  time_start: '',
  time_end: '',
  repeat: 'none',
  repeat_days_text: '',
  active_start_date: '',
  active_end_date: ''
};

const emptyPlanDraft = {
  name: '',
  color: '#2364aa',
  icon_char: ''
};

const emptyBucketDraft = {
  name: '',
  color: '#2364aa'
};

const emptyLabelDraft = {
  name: '',
  color: '#2364aa'
};

const emptyContainerDraft = {
  name: '',
  time_start: '',
  time_end: '',
  repeat: 'weekday'
};

const defaultSettingsDraft = {
  default_duration: 45,
  default_priority: 'medium',
  default_task_duration: 45,
  default_task_priority: 'medium',
  notification_enabled: true,
  reminders_enabled: true,
  reminder_before: 15,
  start_week_on: 1,
  theme: 'light',
  appearance_background: 'calm',
  appearance_avatar: 'default',
  arrange_trigger: 'manual',
  defensive_threshold: 24,
  heal_time: '23:00'
};

function normalizeSettingsDraft(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const defaultDuration = source.default_duration ?? source.default_task_duration ?? defaultSettingsDraft.default_duration;
  const defaultPriority = source.default_priority ?? source.default_task_priority ?? defaultSettingsDraft.default_priority;
  const notificationEnabled = source.notification_enabled ?? source.reminders_enabled ?? defaultSettingsDraft.notification_enabled;
  return {
    ...defaultSettingsDraft,
    ...source,
    default_duration: defaultDuration,
    default_priority: defaultPriority,
    default_task_duration: defaultDuration,
    default_task_priority: defaultPriority,
    notification_enabled: Boolean(notificationEnabled),
    reminders_enabled: Boolean(notificationEnabled)
  };
}

const webAppViews = new Set(['dashboard', 'tasks', 'calendar', 'settings']);

function normalizeView(value) {
  const next = String(value || '').replace(/^#\/?/, '').replace(/^\/+/, '').trim().toLowerCase();
  return webAppViews.has(next) ? next : 'dashboard';
}

function getInitialActiveView() {
  const hashView = typeof window !== 'undefined' ? window.location.hash : '';
  if (hashView) return normalizeView(hashView);
  if (typeof window !== 'undefined') {
    const queryView = new URLSearchParams(window.location.search).get('view');
    if (queryView) return normalizeView(queryView);
  }
  return 'dashboard';
}

function formatStatus(error) {
  if (!error) return 'Cloud API ready';
  if (error instanceof OfflineWriteBlockedError) return error.message;
  if (error instanceof OfflineCalendarWriteBlockedError) return error.message;
  if (error instanceof OfflineStructureWriteBlockedError) return error.message;
  if (error instanceof OfflineSettingsWriteBlockedError) return error.message;
  if (error instanceof ApiError) return `${error.code}: ${error.message}`;
  return error.message || 'Unknown error';
}

function isCompleted(task) {
  return task.progress === 'completed' || task.status === 'completed';
}

function isManageBacSourceTask(task) {
  return Boolean(task && (task.source === 'managebac' || task.source_type === 'managebac_ics' || task.readonly === true && task.managebac_subject));
}

function formatTaskMeta(task) {
  const parts = [];
  if (task.due_date) parts.push(`Due ${task.due_date}`);
  if (task.schedule_time) parts.push(task.schedule_time);
  if (task.duration) parts.push(`${task.duration}m`);
  parts.push(task.priority || 'medium');
  return parts.join(' · ');
}

function formatEventMeta(event) {
  const parts = [];
  if (event.date) parts.push(event.date);
  if (event.time_start || event.time_end) parts.push(`${event.time_start || '--:--'}-${event.time_end || '--:--'}`);
  const repeat = event.repeat || event.payload?.repeat || 'none';
  if (repeat && repeat !== 'none') parts.push(`repeat ${repeat}`);
  if (event.source) parts.push(event.source);
  return parts.join(' · ');
}

function parseRepeatDaysText(value) {
  const seen = new Set();
  return String(value || '')
    .split(/[,\s]+/)
    .map(part => Number(part.trim()))
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6 && !seen.has(day) && seen.add(day));
}

function formatRepeatDaysText(days) {
  return Array.isArray(days) ? days.join(',') : '';
}

function formatContainerMeta(container) {
  const parts = [];
  if (container.time_start || container.time_end) parts.push(`${container.time_start || '--:--'}-${container.time_end || '--:--'}`);
  if (container.repeat) parts.push(container.repeat);
  parts.push(container.enabled === false ? 'disabled' : 'enabled');
  return parts.join(' · ');
}

function replaceById(items, item) {
  return items.map(current => current.id === item.id ? item : current);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysToKey(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return localDateKey(date);
}

function startOfWeekKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return localDateKey(date);
}

function monthKey(dateKey) {
  return String(dateKey || '').slice(0, 7);
}

function sortTasksByGroup(tasks, groupBy) {
  const priorityOrder = { urgent: 0, important: 1, medium: 2, low: 3 };
  const getDate = task => task.due_date || task.deadline || task.start_date || '9999-12-31';
  return [...tasks].sort((a, b) => {
    if (groupBy === 'priority') {
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
    }
    if (groupBy === 'plan') {
      const planCompare = String(a.plan_id || '').localeCompare(String(b.plan_id || ''));
      if (planCompare) return planCompare;
    }
    const dateCompare = getDate(a).localeCompare(getDate(b));
    if (dateCompare) return dateCompare;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

function buildReplayReadinessPreviewBody(tasks) {
  const task = tasks.find(item => item && !isCompleted(item)) || tasks[0];
  if (!task) {
    return { mutations: [] };
  }
  const baseNotes = task.notes || task.description || null;
  return {
    mutations: [{
      mutation_id: `readiness-preview-${task.id || 'task'}`,
      entity_type: 'task',
      entity_id: task.id,
      operation: 'update',
      base_values: {
        notes: baseNotes,
        priority: task.priority || 'medium'
      },
      cloud_values: {
        notes: baseNotes,
        priority: task.priority || 'medium'
      },
      patch: {
        notes: baseNotes || 'Readiness preview note'
      }
    }]
  };
}

function buildReplayEnablementSimulationPreviewBody(tasks) {
  const task = tasks.find(item => item && !isCompleted(item)) || tasks[0];
  if (!task) {
    return { mutations: [] };
  }
  const baseNotes = task.notes || task.description || null;
  return {
    policy: {
      task_only_scope_locked: true,
      managebac_source_fields_blocked: true,
      same_field_conflicts_create_records: true,
      delete_update_conflicts_blocked: true,
      rejected_mutations_stop_retrying: true,
      private_data_excluded_from_conflicts: true,
      offline_write_mode: 'queued_pending',
      cloud_success_after_worker_confirm: true,
      pending_edits_visible: true,
      failed_replay_has_user_path: true
    },
    evidence: {
      required_tests: ['npm run webdev:verify', 'npm test', 'sensitive scan']
    },
    mutations: [{
      mutation_id: `enablement-preview-${task.id || 'task'}`,
      entity_type: 'task',
      entity_id: task.id,
      operation: 'update',
      base_values: {
        notes: baseNotes,
        priority: task.priority || 'medium'
      },
      cloud_values: {
        notes: baseNotes,
        priority: task.priority || 'medium'
      },
      patch: {
        notes: baseNotes || 'Enablement simulation note'
      }
    }, {
      mutation_id: `enablement-preview-conflict-${task.id || 'task'}`,
      entity_type: 'task',
      entity_id: task.id,
      operation: 'update',
      base_values: {
        notes: baseNotes || 'Base conflict note'
      },
      cloud_values: {
        notes: 'Cloud simulation conflict note'
      },
      patch: {
        notes: 'Local simulation conflict note'
      }
    }]
  };
}

function replayInputFromQueuedMutation(mutation) {
  return {
    mutation_id: mutation.mutation_id,
    entity_type: mutation.entity_type,
    entity_id: mutation.entity_id,
    operation: mutation.operation,
    base_values: mutation.base_values || {},
    cloud_values: mutation.cloud_values || null,
    patch: mutation.patch || {},
    field_paths: Array.isArray(mutation.field_paths) ? mutation.field_paths : Object.keys(mutation.patch || {})
  };
}

function readStoredSyncCursor() {
  const value = Number(window.localStorage?.getItem(SYNC_CURSOR_KEY) || 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function writeStoredSyncCursor(cursor) {
  const value = Number(cursor || 0);
  const normalized = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  window.localStorage?.setItem(SYNC_CURSOR_KEY, String(normalized));
  return normalized;
}

export function App() {
  const platform = useMemo(() => createBrowserPlatform(), []);
  const googleButtonRef = useRef(null);
  const [googleSsoMountTick, setGoogleSsoMountTick] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [session, setSession] = useState(() => apiClient.getSession());
  const [account, setAccount] = useState(() => apiClient.getSession()?.account || null);
  const [accountProfile, setAccountProfile] = useState(() => apiClient.getSession()?.profile || null);
  const [accountStatus, setAccountStatus] = useState(null);
  const [profileDraft, setProfileDraft] = useState(() => apiClient.getSession()?.profile?.name || 'Personal Workspace');
  const [ssoState, setSsoState] = useState({ phase: GOOGLE_SSO_CLIENT_ID ? 'idle' : 'not_configured', message: GOOGLE_SSO_CLIENT_ID ? 'Google SSO ready.' : 'Set VITE_GOOGLE_OIDC_CLIENT_ID to enable Google SSO.' });
  const [cloudSessionStatus, setCloudSessionStatus] = useState('Cloud session not checked.');
  const taskRepository = useMemo(() => createTaskRepository(apiClient, { isOnline: () => navigator.onLine }), []);
  const calendarRepository = useMemo(() => createCalendarRepository(apiClient, { isOnline: () => navigator.onLine }), []);
  const structureRepository = useMemo(() => createStructureRepository(apiClient, { isOnline: () => navigator.onLine }), []);
  const settingsRepository = useMemo(() => createSettingsRepository(apiClient, { isOnline: () => navigator.onLine }), []);
  const migrationRepository = useMemo(() => createMigrationRepository(apiClient), []);
  const legacyUiAdapter = useMemo(() => createLegacyUiAdapter({ taskRepository, calendarRepository, structureRepository, settingsRepository }), [taskRepository, calendarRepository, structureRepository, settingsRepository]);
  const [activeView, setActiveView] = useState(getInitialActiveView);
  const [tasks, setTasks] = useState(() => taskRepository.getCachedTasks().length ? taskRepository.getCachedTasks() : seedTasks);
  const [events, setEvents] = useState(() => calendarRepository.getCachedEvents().length ? calendarRepository.getCachedEvents() : seedEvents);
  const [plans, setPlans] = useState(() => structureRepository.getCachedStructure().plans.length ? structureRepository.getCachedStructure().plans : seedPlans);
  const [buckets, setBuckets] = useState(() => structureRepository.getCachedStructure().buckets.length ? structureRepository.getCachedStructure().buckets : seedBuckets);
  const [labels, setLabels] = useState(() => structureRepository.getCachedStructure().labels.length ? structureRepository.getCachedStructure().labels : seedLabels);
  const [containers, setContainers] = useState(() => structureRepository.getCachedStructure().containers.length ? structureRepository.getCachedStructure().containers : seedContainers);
  const [status, setStatus] = useState({ phase: 'checking', message: 'Checking Cloud API...' });
  const [draft, setDraft] = useState(emptyTaskDraft);
  const [eventDraft, setEventDraft] = useState(emptyEventDraft);
  const [planDraft, setPlanDraft] = useState(emptyPlanDraft);
  const [bucketDraft, setBucketDraft] = useState(emptyBucketDraft);
  const [labelDraft, setLabelDraft] = useState(emptyLabelDraft);
  const [containerDraft, setContainerDraft] = useState(emptyContainerDraft);
  const [settingsDraft, setSettingsDraft] = useState(() => normalizeSettingsDraft(settingsRepository.getCachedSettings()));
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [taskViewMode, setTaskViewMode] = useState('board');
  const [taskScope, setTaskScope] = useState('my_day');
  const [taskGroupBy, setTaskGroupBy] = useState('due_date');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('all');
  const [taskFilterOpen, setTaskFilterOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [calendarViewMode, setCalendarViewMode] = useState('week');
  const [calendarSearchOpen, setCalendarSearchOpen] = useState(false);
  const [calendarComposerOpen, setCalendarComposerOpen] = useState(false);
  const [structureSearch, setStructureSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => localDateKey());
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [selectedStructure, setSelectedStructure] = useState(null);
  const [migrationResult, setMigrationResult] = useState(null);
  const [migrationConflicts, setMigrationConflicts] = useState([]);
  const [migrationConflictStatus, setMigrationConflictStatus] = useState('Not loaded');
  const [syncReplayOutcomes, setSyncReplayOutcomes] = useState([]);
  const [syncReplayDetail, setSyncReplayDetail] = useState(null);
  const [syncReplayStatus, setSyncReplayStatus] = useState('Not loaded');
  const [syncReadinessSummary, setSyncReadinessSummary] = useState(null);
  const [syncReadinessStatus, setSyncReadinessStatus] = useState('Not loaded');
  const [syncEnablementSimulation, setSyncEnablementSimulation] = useState(null);
  const [syncEnablementStatus, setSyncEnablementStatus] = useState('Not loaded');
  const [syncReplaySafety, setSyncReplaySafety] = useState(null);
  const [syncReplaySafetyStatus, setSyncReplaySafetyStatus] = useState('Not loaded');
  const [pendingTaskPreview, setPendingTaskPreview] = useState(null);
  const [pendingTaskQueueStatus, setPendingTaskQueueStatus] = useState('Not loaded');
  const [syncConflictRecords, setSyncConflictRecords] = useState([]);
  const [syncConflictDetail, setSyncConflictDetail] = useState(null);
  const [syncConflictStatus, setSyncConflictStatus] = useState('Not loaded');
  const [syncCursor, setSyncCursor] = useState(readStoredSyncCursor);
  const [syncIncrementalStatus, setSyncIncrementalStatus] = useState('Not loaded');
  const [reminderSession, setReminderSession] = useState(null);

  useEffect(() => platform.onNetworkChange(setOnline), [platform]);

  useEffect(() => {
    function handleRouteChange() {
      setActiveView(getInitialActiveView());
    }
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  function navigateToView(view) {
    const nextView = normalizeView(view);
    setActiveView(nextView);
    const nextHash = `#${nextView}`;
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }

  useEffect(() => {
    let disposed = false;
    async function refreshAccount() {
      if (!online || !session?.token) return;
      try {
        const data = await apiClient.getAccountStatus();
        if (disposed) return;
        const nextAccount = data.account ? {
          id: data.account.id,
          email: data.account.email || null,
          name: data.account.display_name || data.account.name || null,
          picture: data.account.picture_url || data.account.picture || null
        } : session.account || null;
        const nextProfile = data.profile || session.profile || null;
        setAccount(nextAccount);
        setAccountProfile(nextProfile);
        setAccountStatus(data.runtime || null);
        setProfileDraft(nextProfile?.name || 'Personal Workspace');
        apiClient.setSession({ ...apiClient.getSession(), account: nextAccount, profile: nextProfile });
        setCloudSessionStatus(`Cloud account active: ${nextAccount?.name || nextAccount?.email || 'Google account'} · ${nextProfile?.name || 'Personal Workspace'}`);
      } catch (error) {
        if (disposed) return;
        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          apiClient.logoutLocal();
          setSession(null);
          setAccount(null);
          setAccountProfile(null);
          setAccountStatus(null);
          setStatus({ phase: 'blocked', message: 'Google SSO session expired. Sign in again to edit Cloud data.' });
          setCloudSessionStatus('Cloud session expired or invalid.');
        }
      }
    }
    refreshAccount();
    return () => { disposed = true; };
  }, [online, session?.token]);

  useEffect(() => {
    let disposed = false;
    if (activeView !== 'settings' || !online || session?.token) return undefined;
    const buttonElement = googleButtonRef.current;
    if (!buttonElement) return undefined;
    setSsoState({ phase: 'loading', message: 'Loading Google SSO...' });
    renderGoogleSsoButton({
      buttonElement,
      onCredential: handleGoogleCredential,
      onError: error => setSsoState({ phase: 'error', message: formatStatus(error) })
    }).then(result => {
      if (disposed) return;
      if (result.status === 'not_configured') {
        setSsoState({ phase: 'not_configured', message: 'Set VITE_GOOGLE_OIDC_CLIENT_ID to enable Google SSO.' });
      } else {
        setSsoState({ phase: 'ready', message: 'Google SSO button is ready.' });
      }
    }).catch(error => {
      if (!disposed) setSsoState({ phase: 'error', message: formatStatus(error) });
    });
    return () => { disposed = true; };
  }, [activeView, online, session?.token, googleSsoMountTick]);

  function hasCloudSession() {
    return Boolean(session?.token);
  }

  async function refreshTasks() {
    if (!online) {
      const cachedTasks = taskRepository.getCachedTasks();
      if (cachedTasks.length) setTasks(cachedTasks);
      setStatus({ phase: 'offline', message: 'Offline read cache active. Editing is disabled until reconnecting.' });
      return;
    }
    try {
      const health = await apiClient.health();
      const session = apiClient.getSession();
      if (session?.token) {
        const cloudTasks = await taskRepository.listTasks({ includeCompleted: true, search });
        setTasks(cloudTasks);
        setStatus({ phase: 'ready', message: `${health.service} / ${health.env} · Cloud tasks loaded` });
      } else {
        const cachedTasks = taskRepository.getCachedTasks();
        setTasks(cachedTasks.length ? cachedTasks : seedTasks);
        setStatus({ phase: 'preview', message: `${health.service} / ${health.env} · Google SSO required for writes` });
      }
    } catch (error) {
      const cachedTasks = taskRepository.getCachedTasks();
      if (cachedTasks.length) setTasks(cachedTasks);
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function refreshEvents() {
    if (!online) {
      const cachedEvents = calendarRepository.getCachedEvents();
      if (cachedEvents.length) setEvents(cachedEvents);
      return;
    }
    try {
      const session = apiClient.getSession();
      if (session?.token) {
        const cloudEvents = await calendarRepository.listEvents({ search: eventSearch });
        setEvents(cloudEvents);
      } else {
        const cachedEvents = calendarRepository.getCachedEvents();
        setEvents(cachedEvents.length ? cachedEvents : seedEvents);
      }
    } catch (error) {
      const cachedEvents = calendarRepository.getCachedEvents();
      if (cachedEvents.length) setEvents(cachedEvents);
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function refreshStructure() {
    if (!online) {
      const cached = structureRepository.getCachedStructure();
      if (cached.plans.length) setPlans(cached.plans);
      if (cached.buckets.length) setBuckets(cached.buckets);
      if (cached.labels.length) setLabels(cached.labels);
      if (cached.containers.length) setContainers(cached.containers);
      return;
    }
    try {
      const session = apiClient.getSession();
      if (session?.token) {
        const cloudStructure = await structureRepository.listStructure({ search: structureSearch });
        setPlans(cloudStructure.plans);
        setBuckets(cloudStructure.buckets);
        setLabels(cloudStructure.labels);
        setContainers(cloudStructure.containers);
      } else {
        const cached = structureRepository.getCachedStructure();
        setPlans(cached.plans.length ? cached.plans : seedPlans);
        setBuckets(cached.buckets.length ? cached.buckets : seedBuckets);
        setLabels(cached.labels.length ? cached.labels : seedLabels);
        setContainers(cached.containers.length ? cached.containers : seedContainers);
      }
    } catch (error) {
      const cached = structureRepository.getCachedStructure();
      if (cached.plans.length) setPlans(cached.plans);
      if (cached.buckets.length) setBuckets(cached.buckets);
      if (cached.labels.length) setLabels(cached.labels);
      if (cached.containers.length) setContainers(cached.containers);
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function refreshSettings() {
    if (!online) {
      setSettingsDraft(normalizeSettingsDraft(settingsRepository.getCachedSettings()));
      return;
    }
    try {
      const session = apiClient.getSession();
      if (session?.token) {
        setSettingsDraft(normalizeSettingsDraft(await settingsRepository.getSettings()));
      } else {
        setSettingsDraft(normalizeSettingsDraft(settingsRepository.getCachedSettings()));
      }
    } catch (error) {
      setSettingsDraft(normalizeSettingsDraft(settingsRepository.getCachedSettings()));
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function refreshFromBootstrap() {
    if (!online || !apiClient.getSession()?.token) return false;
    try {
      const bootstrap = await apiClient.getSyncBootstrap();
      if (bootstrap?.account) {
        const nextAccount = {
          id: bootstrap.account.id,
          email: bootstrap.account.email || null,
          name: bootstrap.account.display_name || bootstrap.account.name || null,
          picture: bootstrap.account.picture_url || bootstrap.account.picture || null
        };
        setAccount(nextAccount);
        setAccountProfile(bootstrap.profile || null);
        setProfileDraft(bootstrap.profile?.name || 'Personal Workspace');
        apiClient.setSession({ ...apiClient.getSession(), account: nextAccount, profile: bootstrap.profile || null });
      }
      const entities = bootstrap?.entities || {};
      const nextTasks = taskRepository.hydrateCache(entities.tasks || []);
      const nextEvents = calendarRepository.hydrateCache(entities.calendar_events || []);
      const nextStructure = structureRepository.hydrateCache({
        plans: entities.plans || [],
        buckets: entities.buckets || [],
        labels: entities.labels || [],
        containers: entities.containers || []
      });
      const nextSettings = settingsRepository.hydrateCache(entities.settings || {});
      setTasks(nextTasks);
      setEvents(nextEvents);
      setPlans(nextStructure.plans);
      setBuckets(nextStructure.buckets);
      setLabels(nextStructure.labels);
      setContainers(nextStructure.containers);
      setSettingsDraft(normalizeSettingsDraft(nextSettings));
      const nextCursor = writeStoredSyncCursor(bootstrap?.cursor || 0);
      setSyncCursor(nextCursor);
      setStatus({ phase: 'ready', message: `Cloud bootstrap loaded · cursor ${bootstrap?.cursor ?? 0}` });
      setCloudSessionStatus(`${bootstrap?.authority || 'cloud_d1_canonical'} · ${bootstrap?.offline_write_policy || 'blocked_v1'} · cursor ${bootstrap?.cursor ?? 0}`);
      setSyncIncrementalStatus(`Bootstrap cache ready at cursor ${nextCursor}.`);
      return true;
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
      return false;
    }
  }

  async function refreshWorkspace() {
    if (await refreshFromBootstrap()) return;
    await Promise.all([refreshTasks(), refreshEvents(), refreshStructure(), refreshSettings()]);
  }

  async function applyReadOnlyCloudChange(change) {
    const type = change?.entity_type;
    const id = change?.entity_id;
    const operation = change?.operation;
    if (!type || !id) return 'skipped';
    if (operation === 'deleted') {
      if (type === 'task') taskRepository.removeCloudTask(id);
      else if (type === 'calendar_event') calendarRepository.removeCloudEvent(id);
      else if (['plan', 'bucket', 'label', 'container'].includes(type)) structureRepository.removeCloudItem(type, id);
      return 'deleted';
    }
    try {
      if (type === 'task') {
        const data = await apiClient.request(`/tasks/${encodeURIComponent(id)}`, { method: 'GET' });
        taskRepository.applyCloudTask(data.task);
        return 'updated';
      }
      if (type === 'calendar_event') {
        const data = await apiClient.request(`/calendar/events/${encodeURIComponent(id)}`, { method: 'GET' });
        calendarRepository.applyCloudEvent(data.event);
        return 'updated';
      }
      if (type === 'plan') {
        const data = await apiClient.request(`/plans/${encodeURIComponent(id)}`, { method: 'GET' });
        structureRepository.applyCloudItem('plan', data.plan);
        return 'updated';
      }
      if (type === 'bucket') {
        const data = await apiClient.request(`/buckets/${encodeURIComponent(id)}`, { method: 'GET' });
        structureRepository.applyCloudItem('bucket', data.bucket);
        return 'updated';
      }
      if (type === 'label') {
        const data = await apiClient.request(`/labels/${encodeURIComponent(id)}`, { method: 'GET' });
        structureRepository.applyCloudItem('label', data.label);
        return 'updated';
      }
      if (type === 'container') {
        const data = await apiClient.request(`/containers/${encodeURIComponent(id)}`, { method: 'GET' });
        structureRepository.applyCloudItem('container', data.container);
        return 'updated';
      }
      if (type === 'product_setting') {
        const settings = await settingsRepository.getSettings();
        setSettingsDraft(normalizeSettingsDraft(settings));
        return 'updated';
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        if (type === 'task') taskRepository.removeCloudTask(id);
        else if (type === 'calendar_event') calendarRepository.removeCloudEvent(id);
        else if (['plan', 'bucket', 'label', 'container'].includes(type)) structureRepository.removeCloudItem(type, id);
        return 'deleted';
      }
      throw error;
    }
    return 'skipped';
  }

  async function refreshIncrementalChanges() {
    if (!online) {
      setSyncIncrementalStatus('Offline: cached data remains readable; reconnect before pulling Cloud changes.');
      return;
    }
    if (!apiClient.getSession()?.token) {
      setSyncIncrementalStatus('Google SSO session required before pulling Cloud changes.');
      return;
    }
    const cursor = readStoredSyncCursor();
    setSyncIncrementalStatus(`Pulling Cloud changes after cursor ${cursor}...`);
    try {
      const result = await apiClient.listSyncChanges({ cursor, limit: 100 });
      let updated = 0;
      let deleted = 0;
      let skipped = 0;
      for (const change of result.changes || []) {
        const status = await applyReadOnlyCloudChange(change);
        if (status === 'updated') updated += 1;
        else if (status === 'deleted') deleted += 1;
        else skipped += 1;
      }
      const nextCursor = writeStoredSyncCursor(result.next_cursor ?? cursor);
      setSyncCursor(nextCursor);
      setTasks(taskRepository.getCachedTasks());
      setEvents(calendarRepository.getCachedEvents());
      const structure = structureRepository.getCachedStructure();
      setPlans(structure.plans);
      setBuckets(structure.buckets);
      setLabels(structure.labels);
      setContainers(structure.containers);
      setSettingsDraft(normalizeSettingsDraft(settingsRepository.getCachedSettings()));
      setSyncIncrementalStatus(`Applied ${updated} updated, ${deleted} deleted, ${skipped} skipped Cloud changes · cursor ${nextCursor}.`);
      setStatus({ phase: 'ready', message: `Cloud change cursor refreshed · cursor ${nextCursor}` });
    } catch (error) {
      setSyncIncrementalStatus(formatStatus(error));
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function refreshCloudSessionStatus() {
    if (!online) {
      setCloudSessionStatus('Offline: cached data is readable, Cloud session cannot be checked.');
      return;
    }
    if (!apiClient.getSession()?.token) {
      setCloudSessionStatus('No active TimeWhere Cloud session. Connect with Google SSO.');
      return;
    }
    try {
      const [accountData, syncData] = await Promise.all([apiClient.getAccountStatus(), apiClient.getSyncStatus()]);
      const nextAccount = accountData.account ? {
        id: accountData.account.id,
        email: accountData.account.email || null,
        name: accountData.account.display_name || accountData.account.name || null,
        picture: accountData.account.picture_url || accountData.account.picture || null
      } : account;
      setAccount(nextAccount);
      setAccountProfile(accountData.profile || null);
      setAccountStatus(accountData.runtime || null);
      setProfileDraft(accountData.profile?.name || 'Personal Workspace');
      apiClient.setSession({ ...apiClient.getSession(), account: nextAccount, profile: accountData.profile || null });
      const displayName = nextAccount?.name || nextAccount?.email || 'Google account';
      const profileName = accountData.profile?.name || 'Personal Workspace';
      const taskReplay = accountData.runtime?.gates?.task_replay_writes_enabled ? 'Task replay writes on' : 'Task replay writes off';
      setCloudSessionStatus(`${displayName} · ${profileName} · ${syncData.mode} · ${syncData.offline_writes} · ${taskReplay}`);
    } catch (error) {
      setCloudSessionStatus(formatStatus(error));
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function handleGoogleCredential(idToken) {
    setSsoState({ phase: 'signing_in', message: 'Creating TimeWhere Cloud session...' });
    try {
      const data = await apiClient.loginWithGoogleIdToken(idToken);
      const nextSession = apiClient.getSession();
      setSession(nextSession);
      setAccount(data.account || nextSession?.account || null);
      setAccountProfile(data.profile || nextSession?.profile || null);
      setProfileDraft((data.profile || nextSession?.profile)?.name || 'Personal Workspace');
      setStatus({ phase: 'ready', message: 'Google SSO connected. Cloud writes are enabled.' });
      setSsoState({ phase: 'connected', message: 'Google SSO connected.' });
      await refreshCloudSessionStatus();
      await refreshWorkspace();
    } catch (error) {
      setSsoState({ phase: 'error', message: formatStatus(error) });
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function disconnectGoogleSession() {
    setSsoState({ phase: 'disconnecting', message: 'Disconnecting local Cloud session...' });
    try {
      await apiClient.logout();
      disableGoogleAutoSelect();
      setSession(null);
      setAccount(null);
      setAccountProfile(null);
      setAccountStatus(null);
      setProfileDraft('Personal Workspace');
      setStatus({ phase: 'preview', message: 'Google SSO disconnected. Preview/cache remains available.' });
      setCloudSessionStatus('No active TimeWhere Cloud session. Connect with Google SSO.');
      setSsoState({ phase: GOOGLE_SSO_CLIENT_ID ? 'idle' : 'not_configured', message: GOOGLE_SSO_CLIENT_ID ? 'Google SSO ready.' : 'Set VITE_GOOGLE_OIDC_CLIENT_ID to enable Google SSO.' });
      await refreshWorkspace();
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
      setSsoState({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function refreshTimeWhereSession() {
    if (!online) {
      setCloudSessionStatus('Offline: reconnect before refreshing the TimeWhere Cloud session.');
      return;
    }
    if (!apiClient.getSession()?.token) {
      setCloudSessionStatus('No active TimeWhere Cloud session. Connect with Google SSO.');
      return;
    }
    setSsoState({ phase: 'refreshing', message: 'Refreshing TimeWhere Cloud session...' });
    try {
      const data = await apiClient.refreshSession();
      const nextSession = apiClient.getSession();
      setSession(nextSession);
      setAccount(data.account || nextSession?.account || null);
      setAccountProfile(data.profile || nextSession?.profile || null);
      setProfileDraft((data.profile || nextSession?.profile)?.name || 'Personal Workspace');
      const expiresAt = nextSession?.expires_at ? new Date(nextSession.expires_at).toLocaleString() : 'unknown';
      setCloudSessionStatus(`Session refreshed. Expires ${expiresAt}.`);
      setStatus({ phase: 'ready', message: 'TimeWhere Cloud session refreshed.' });
      setSsoState({ phase: 'connected', message: 'Google SSO connected.' });
    } catch (error) {
      setCloudSessionStatus(formatStatus(error));
      setStatus({ phase: 'error', message: formatStatus(error) });
      setSsoState({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function saveAccountProfile(event) {
    event.preventDefault();
    if (!hasCloudSession()) {
      setCloudSessionStatus('Google SSO session required before saving workspace profile.');
      return;
    }
    try {
      const data = await apiClient.updateAccountProfile({ name: profileDraft });
      setAccountProfile(data.profile);
      apiClient.setSession({ ...apiClient.getSession(), profile: data.profile });
      setStatus({ phase: 'ready', message: 'Workspace profile saved to Cloud account.' });
      await refreshCloudSessionStatus();
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
      setCloudSessionStatus(formatStatus(error));
    }
  }

  useEffect(() => {
    refreshWorkspace();
  }, [online]);

  useEffect(() => {
    if (session?.token) refreshMigrationConflicts();
  }, [session?.token, online]);

  async function addTask(event) {
    event.preventDefault();
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before creating or queueing tasks.' });
      return;
    }
    if (!draft.title.trim()) return;
    try {
      const created = await legacyUiAdapter.tasks.create({
        title: draft.title.trim(),
        due_date: draft.due_date || null,
        schedule_time: draft.schedule_time || null,
        duration: Number(draft.duration || 45),
        recurrence_frequency: draft.recurrence_frequency === 'none' ? null : draft.recurrence_frequency,
        recurrence_count: draft.recurrence_frequency === 'none' ? null : Number(draft.recurrence_count || 1),
        priority: draft.priority,
        notes: draft.notes || null
      });
      setTasks(current => [created, ...current.filter(task => task.id !== created.id)]);
      setDraft(emptyTaskDraft);
      setStatus(online ? { phase: 'ready', message: 'Task saved to Cloud canonical store.' } : { phase: 'offline', message: 'Task queued locally and marked pending sync.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function updateTaskState(task, nextPatch) {
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before editing or queueing tasks.' });
      return;
    }
    try {
      const updated = await legacyUiAdapter.tasks.update(task.id, nextPatch);
      setTasks(current => current.map(item => item.id === updated.id ? updated : item));
      setStatus(online ? { phase: 'ready', message: 'Task updated in Cloud canonical store.' } : { phase: 'offline', message: 'Task update queued locally and marked pending sync.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function deleteTask(task) {
    if (!online) {
      setStatus({ phase: 'offline', message: 'offline_write_blocked: reconnect before editing current data.' });
      return;
    }
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before deleting Cloud tasks.' });
      return;
    }
    try {
      await legacyUiAdapter.tasks.delete(task.id);
      setTasks(current => current.filter(item => item.id !== task.id));
      setStatus({ phase: 'ready', message: 'Task deleted from Cloud canonical store.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function addEvent(event) {
    event.preventDefault();
    if (!online) {
      setStatus({ phase: 'offline', message: 'offline_write_blocked: reconnect before editing current calendar data.' });
      return;
    }
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before creating Cloud calendar events.' });
      return;
    }
    if (!eventDraft.title.trim()) return;
    try {
      const repeat = eventDraft.repeat || 'none';
      const repeatDays = parseRepeatDaysText(eventDraft.repeat_days_text);
      const created = await legacyUiAdapter.calendar.create({
        title: eventDraft.title.trim(),
        date: eventDraft.date || null,
        time_start: eventDraft.time_start || null,
        time_end: eventDraft.time_end || null,
        active_start_date: repeat === 'none' ? null : eventDraft.active_start_date || eventDraft.date || null,
        active_end_date: repeat === 'none' ? null : eventDraft.active_end_date || null,
        source: 'web_app',
        payload: {
          repeat,
          repeat_days: repeat === 'weekly' || repeat === 'custom' ? repeatDays : []
        }
      });
      setEvents(current => [created, ...current.filter(item => item.id !== created.id)]);
      setEventDraft(emptyEventDraft);
      setStatus({ phase: 'ready', message: 'Calendar event saved to Cloud canonical store.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function deleteEvent(event) {
    if (!online) {
      setStatus({ phase: 'offline', message: 'offline_write_blocked: reconnect before editing current calendar data.' });
      return;
    }
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before deleting Cloud calendar events.' });
      return;
    }
    try {
      await legacyUiAdapter.calendar.delete(event.id);
      setEvents(current => current.filter(item => item.id !== event.id));
      setSelectedEventId(current => current === event.id ? null : current);
      setStatus({ phase: 'ready', message: 'Calendar event deleted from Cloud canonical store.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function updateEventState(event, nextPatch) {
    if (!online) {
      setStatus({ phase: 'offline', message: 'offline_write_blocked: reconnect before editing current calendar data.' });
      return;
    }
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before editing Cloud calendar events.' });
      return;
    }
    try {
      const updated = await legacyUiAdapter.calendar.update(event.id, nextPatch);
      setEvents(current => current.map(item => item.id === updated.id ? updated : item));
      setSelectedEventId(updated.id);
      setStatus({ phase: 'ready', message: 'Calendar event updated in Cloud canonical store.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function addPlan(event) {
    event.preventDefault();
    if (!online) {
      setStatus({ phase: 'offline', message: 'offline_write_blocked: reconnect before editing structure data.' });
      return;
    }
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before creating Cloud plans.' });
      return;
    }
    if (!planDraft.name.trim()) return;
    try {
      const created = await structureRepository.createPlan({
        name: planDraft.name.trim(),
        color: planDraft.color || null,
        icon_char: planDraft.icon_char || null,
        subject: planDraft.name.trim()
      });
      setPlans(current => [created, ...current.filter(item => item.id !== created.id)]);
      setPlanDraft(emptyPlanDraft);
      setStatus({ phase: 'ready', message: 'Plan saved to Cloud canonical store.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function deletePlan(plan) {
    if (!online) {
      setStatus({ phase: 'offline', message: 'offline_write_blocked: reconnect before editing structure data.' });
      return;
    }
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before deleting Cloud plans.' });
      return;
    }
    try {
      await structureRepository.deletePlan(plan.id);
      setPlans(current => current.filter(item => item.id !== plan.id));
      setSelectedStructure(current => current?.type === 'plan' && current.id === plan.id ? null : current);
      setStatus({ phase: 'ready', message: 'Plan deleted from Cloud canonical store.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function addBucket(event) {
    event.preventDefault();
    if (!online) {
      setStatus({ phase: 'offline', message: 'offline_write_blocked: reconnect before editing structure data.' });
      return;
    }
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before creating Cloud buckets.' });
      return;
    }
    if (!bucketDraft.name.trim()) return;
    try {
      const created = await structureRepository.createBucket({
        name: bucketDraft.name.trim(),
        color: bucketDraft.color || null
      });
      setBuckets(current => [created, ...current.filter(item => item.id !== created.id)]);
      setBucketDraft(emptyBucketDraft);
      setStatus({ phase: 'ready', message: 'Bucket saved to Cloud canonical store.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function deleteBucket(bucket) {
    if (!online) {
      setStatus({ phase: 'offline', message: 'offline_write_blocked: reconnect before editing structure data.' });
      return;
    }
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before deleting Cloud buckets.' });
      return;
    }
    try {
      await structureRepository.deleteBucket(bucket.id);
      setBuckets(current => current.filter(item => item.id !== bucket.id));
      setSelectedStructure(current => current?.type === 'bucket' && current.id === bucket.id ? null : current);
      setStatus({ phase: 'ready', message: 'Bucket deleted from Cloud canonical store.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function addLabel(event) {
    event.preventDefault();
    if (!online) {
      setStatus({ phase: 'offline', message: 'offline_write_blocked: reconnect before editing structure data.' });
      return;
    }
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before creating Cloud labels.' });
      return;
    }
    if (!labelDraft.name.trim()) return;
    try {
      const created = await structureRepository.createLabel({
        name: labelDraft.name.trim(),
        color: labelDraft.color || null
      });
      setLabels(current => [created, ...current.filter(item => item.id !== created.id)]);
      setLabelDraft(emptyLabelDraft);
      setStatus({ phase: 'ready', message: 'Label saved to Cloud canonical store.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function deleteLabel(label) {
    if (!online) {
      setStatus({ phase: 'offline', message: 'offline_write_blocked: reconnect before editing structure data.' });
      return;
    }
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before deleting Cloud labels.' });
      return;
    }
    try {
      await structureRepository.deleteLabel(label.id);
      setLabels(current => current.filter(item => item.id !== label.id));
      setSelectedStructure(current => current?.type === 'label' && current.id === label.id ? null : current);
      setStatus({ phase: 'ready', message: 'Label deleted from Cloud canonical store.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function addContainer(event) {
    event.preventDefault();
    if (!online) {
      setStatus({ phase: 'offline', message: 'offline_write_blocked: reconnect before editing structure data.' });
      return;
    }
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before creating Cloud containers.' });
      return;
    }
    if (!containerDraft.name.trim()) return;
    try {
      const created = await structureRepository.createContainer({
        name: containerDraft.name.trim(),
        time_start: containerDraft.time_start || null,
        time_end: containerDraft.time_end || null,
        repeat: containerDraft.repeat || null,
        enabled: true
      });
      setContainers(current => [created, ...current.filter(item => item.id !== created.id)]);
      setContainerDraft(emptyContainerDraft);
      setStatus({ phase: 'ready', message: 'Container saved to Cloud canonical store.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function deleteContainer(container) {
    if (!online) {
      setStatus({ phase: 'offline', message: 'offline_write_blocked: reconnect before editing structure data.' });
      return;
    }
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before deleting Cloud containers.' });
      return;
    }
    try {
      await structureRepository.deleteContainer(container.id);
      setContainers(current => current.filter(item => item.id !== container.id));
      setSelectedStructure(current => current?.type === 'container' && current.id === container.id ? null : current);
      setStatus({ phase: 'ready', message: 'Container deleted from Cloud canonical store.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function updateStructureItem(type, item, patch) {
    if (!online) {
      setStatus({ phase: 'offline', message: 'offline_write_blocked: reconnect before editing structure data.' });
      return;
    }
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: `Google SSO session required before editing Cloud ${type}s.` });
      return;
    }
    try {
      let updated;
      if (type === 'plan') {
        updated = await structureRepository.updatePlan(item.id, patch);
        setPlans(current => replaceById(current, updated));
      } else if (type === 'bucket') {
        updated = await structureRepository.updateBucket(item.id, patch);
        setBuckets(current => replaceById(current, updated));
      } else if (type === 'label') {
        updated = await structureRepository.updateLabel(item.id, patch);
        setLabels(current => replaceById(current, updated));
      } else if (type === 'container') {
        updated = await structureRepository.updateContainer(item.id, patch);
        setContainers(current => replaceById(current, updated));
      }
      if (updated?.id) setSelectedStructure({ type, id: updated.id });
      setStatus({ phase: 'ready', message: `${type} updated in Cloud canonical store.` });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (!online) {
      setStatus({ phase: 'offline', message: 'offline_write_blocked: reconnect before editing settings.' });
      return;
    }
    if (!hasCloudSession()) {
      setStatus({ phase: 'blocked', message: 'Google SSO session required before saving Cloud settings.' });
      return;
    }
    try {
      const defaultDuration = Number(settingsDraft.default_duration || settingsDraft.default_task_duration || 45);
      const defaultPriority = settingsDraft.default_priority || settingsDraft.default_task_priority || 'medium';
      const notificationEnabled = Boolean(settingsDraft.notification_enabled);
      const saved = await settingsRepository.updateSettings({
        default_duration: defaultDuration,
        default_priority: defaultPriority,
        default_task_duration: defaultDuration,
        default_task_priority: defaultPriority,
        notification_enabled: notificationEnabled,
        reminders_enabled: notificationEnabled,
        reminder_before: Number(settingsDraft.reminder_before || 15),
        start_week_on: Number(settingsDraft.start_week_on ?? 1),
        theme: settingsDraft.theme || 'light',
        appearance_background: settingsDraft.appearance_background || 'calm',
        appearance_avatar: settingsDraft.appearance_avatar || 'default',
        arrange_trigger: settingsDraft.arrange_trigger || 'manual',
        defensive_threshold: Number(settingsDraft.defensive_threshold || 24),
        heal_time: settingsDraft.heal_time || '23:00'
      });
      setSettingsDraft(normalizeSettingsDraft(saved));
      setStatus({ phase: 'ready', message: 'Settings saved to Cloud canonical store.' });
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function refreshMigrationConflicts() {
    if (!online || !hasCloudSession()) {
      setMigrationConflicts([]);
      setMigrationConflictStatus('Google SSO required before loading migration conflicts.');
      return;
    }
    try {
      const conflicts = await migrationRepository.listConflicts('open');
      setMigrationConflicts(conflicts);
      setMigrationConflictStatus(conflicts.length ? `${conflicts.length} open migration conflicts` : 'No open migration conflicts.');
    } catch (error) {
      setMigrationConflictStatus(formatStatus(error));
    }
  }

  async function resolveMigrationConflict(conflict, resolution) {
    if (!conflict?.id) return;
    try {
      await migrationRepository.resolveConflict(conflict.id, resolution);
      await refreshMigrationConflicts();
      setStatus({ phase: 'ready', message: 'Migration conflict review updated.' });
    } catch (error) {
      setMigrationConflictStatus(formatStatus(error));
    }
  }

  async function refreshSyncReplayDiagnostics() {
    if (!apiClient.getSession()?.token) {
      setSyncReplayOutcomes([]);
      setSyncReplayDetail(null);
      setSyncReplayStatus('Google SSO session required before loading replay diagnostics.');
      return;
    }
    try {
      const data = await apiClient.listSyncMutationOutcomes({ status: 'rejected', limit: 20 });
      setSyncReplayOutcomes(data.outcomes || []);
      setSyncReplayDetail(null);
      setSyncReplayStatus(data.count ? `${data.count} replay outcomes loaded.` : 'No replay outcomes recorded.');
    } catch (error) {
      setSyncReplayStatus(formatStatus(error));
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function refreshSyncReplayReadiness() {
    if (!apiClient.getSession()?.token) {
      setSyncReadinessSummary(null);
      setSyncReadinessStatus('Google SSO session required before loading replay readiness.');
      return;
    }
    try {
      const body = buildReplayReadinessPreviewBody(tasks);
      if (!body.mutations.length) {
        setSyncReadinessSummary(null);
        setSyncReadinessStatus('Create or migrate at least one task before previewing replay readiness.');
        return;
      }
      const data = await apiClient.getSyncReplayReadinessSummary(body);
      setSyncReadinessSummary(data);
      const counts = data.readiness?.candidate_counts || {};
      setSyncReadinessStatus(`Readiness preview loaded: apply ${counts.apply || 0}, conflict ${counts.conflict || 0}, rejected ${counts.reject || 0}.`);
    } catch (error) {
      setSyncReadinessStatus(formatStatus(error));
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function refreshSyncReplayEnablementSimulation() {
    if (!apiClient.getSession()?.token) {
      setSyncEnablementSimulation(null);
      setSyncEnablementStatus('Google SSO session required before loading replay enablement simulation.');
      return;
    }
    try {
      const body = buildReplayEnablementSimulationPreviewBody(tasks);
      if (!body.mutations.length) {
        setSyncEnablementSimulation(null);
        setSyncEnablementStatus('Create or migrate at least one task before previewing replay enablement.');
        return;
      }
      const data = await apiClient.getSyncReplayEnablementSimulation(body);
      setSyncEnablementSimulation(data);
      const passed = Array.isArray(data.gates) ? data.gates.filter(gate => gate.passed).length : 0;
      const total = Array.isArray(data.gates) ? data.gates.length : 0;
      setSyncEnablementStatus(`Simulation loaded: ${passed}/${total} gates pass; replay remains disabled.`);
    } catch (error) {
      setSyncEnablementStatus(formatStatus(error));
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function refreshSyncReplaySafety() {
    if (!apiClient.getSession()?.token) {
      setSyncReplaySafety(null);
      setSyncReplaySafetyStatus('Google SSO session required before loading replay safety gate.');
      return;
    }
    try {
      const data = await apiClient.getSyncReplaySafety();
      setSyncReplaySafety(data.safety || null);
      const blockers = Array.isArray(data.safety?.blockers) ? data.safety.blockers.length : 0;
      setSyncReplaySafetyStatus(`Replay safety loaded: ${blockers} blocker${blockers === 1 ? '' : 's'}; writes remain disabled.`);
    } catch (error) {
      setSyncReplaySafetyStatus(formatStatus(error));
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function previewPendingTaskRetry(entityId = null) {
    if (!apiClient.getSession()?.token) {
      setPendingTaskPreview(null);
      setPendingTaskQueueStatus('Google SSO session required before previewing pending Task retry.');
      return;
    }
    if (!online) {
      setPendingTaskPreview(null);
      setPendingTaskQueueStatus('Reconnect before previewing pending Task retry.');
      return;
    }
    const queued = taskRepository.listPendingTaskMutations()
      .filter(mutation => !entityId || mutation.entity_id === entityId);
    if (!queued.length) {
      setPendingTaskPreview(null);
      setPendingTaskQueueStatus('No pending Task mutations to preview.');
      return;
    }
    try {
      const data = await apiClient.getSyncReplayReadinessSummary({
        mutations: queued.map(replayInputFromQueuedMutation)
      });
      setPendingTaskPreview(data);
      const counts = data.readiness?.candidate_counts || {};
      setPendingTaskQueueStatus(`Retry preview loaded: apply ${counts.apply || 0}, conflict ${counts.conflict || 0}, rejected ${counts.reject || 0}; writes remain disabled.`);
    } catch (error) {
      setPendingTaskPreview(null);
      setPendingTaskQueueStatus(formatStatus(error));
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  function discardPendingTask(entityId) {
    const result = taskRepository.discardPendingTaskMutations(entityId);
    setTasks(taskRepository.getCachedTasks());
    setPendingTaskPreview(null);
    setPendingTaskQueueStatus(`Discarded ${result.removed_count || 0} local pending mutation${result.removed_count === 1 ? '' : 's'} for ${entityId}.`);
    setStatus({ phase: 'ready', message: 'Local pending Task changes discarded. Cloud data was not changed.' });
  }

  function openPendingTaskQueue() {
    navigateToView('settings');
    setPendingTaskQueueStatus('Review local pending Task edits. Retry preview is dry-run only; discard does not change Cloud data.');
  }

  async function inspectSyncReplayOutcome(outcome) {
    if (!outcome?.mutation_id) return;
    try {
      const data = await apiClient.getSyncMutationOutcome(outcome.mutation_id);
      setSyncReplayDetail(data.outcome || null);
    } catch (error) {
      setSyncReplayStatus(formatStatus(error));
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function refreshSyncConflictDiagnostics() {
    if (!apiClient.getSession()?.token) {
      setSyncConflictRecords([]);
      setSyncConflictDetail(null);
      setSyncConflictStatus('Google SSO session required before loading sync conflict diagnostics.');
      return;
    }
    try {
      const data = await apiClient.listSyncConflicts({ status: 'open', limit: 20 });
      setSyncConflictRecords(data.conflicts || []);
      setSyncConflictDetail(null);
      setSyncConflictStatus(data.count ? `${data.count} sync conflicts loaded.` : 'No open sync conflicts recorded.');
    } catch (error) {
      setSyncConflictStatus(formatStatus(error));
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function inspectSyncConflict(conflict) {
    if (!conflict?.id) return;
    try {
      const data = await apiClient.getSyncConflict(conflict.id);
      setSyncConflictDetail(data.conflict || null);
    } catch (error) {
      setSyncConflictStatus(formatStatus(error));
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function resolveSyncConflictAction(conflict, resolution) {
    if (!conflict?.id) return;
    if (!online) {
      setSyncConflictStatus('Reconnect before resolving Task sync conflicts.');
      return;
    }
    if (!apiClient.getSession()?.token) {
      setSyncConflictStatus('Google SSO session required before resolving Task sync conflicts.');
      return;
    }
    try {
      const data = await apiClient.resolveSyncConflict(conflict.id, resolution);
      setSyncConflictDetail(data.conflict || null);
      if (resolution === 'later') {
        setSyncConflictStatus('Conflict kept open for later review.');
      } else {
        setSyncConflictStatus(`Task sync conflict resolved with ${resolution.replace('_', ' ')}; Cloud task data was not overwritten.`);
        await refreshSyncConflictDiagnostics();
      }
    } catch (error) {
      setSyncConflictStatus(formatStatus(error));
      setStatus({ phase: 'error', message: formatStatus(error) });
    }
  }

  async function runPreviewMigration() {
    if (!online) {
      setStatus({ phase: 'offline', message: 'Migration requires a network connection.' });
      return;
    }
    const session = apiClient.getSession();
    if (!session?.token) {
      setMigrationResult({ status: 'not_connected', message: 'Google SSO session required before automatic migration.' });
      return;
    }
    try {
      const snapshot = await buildLegacyIndexedDbSnapshot({
        tasks,
        plans,
        buckets,
        labels,
        containers,
        events,
        settings: settingsDraft
      }, { deviceId: 'web-preview' });
      setMigrationResult(await migrationRepository.createMigrationRun(snapshot, 'web_preview'));
      await refreshMigrationConflicts();
    } catch (error) {
      setMigrationResult({ status: 'error', message: formatStatus(error) });
    }
  }

  const visibleTasks = sortTasksByGroup(tasks.filter(task => {
    const today = localDateKey();
    if (taskScope === 'my_day') {
      const start = task.start_date || null;
      const due = task.due_date || task.deadline || null;
      const scheduledToday = Boolean(task.schedule_time && (start === today || due === today));
      const activeToday = Boolean(start && start <= today) || Boolean(due && due <= today);
      if (!isCompleted(task) && !scheduledToday && !activeToday) return false;
    } else if (taskScope === 'my_managebac') {
      if (!isManageBacSourceTask(task)) return false;
    } else if (taskScope?.startsWith('plan:')) {
      if (task.plan_id !== taskScope.slice(5)) return false;
    }
    if (filter === 'pending' && isCompleted(task)) return false;
    if (filter === 'completed' && !isCompleted(task)) return false;
    if (taskPriorityFilter !== 'all' && task.priority !== taskPriorityFilter) return false;
    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;
    return `${task.title || ''} ${task.notes || ''} ${task.description || ''} ${task.subject || ''}`.toLowerCase().includes(keyword);
  }), taskGroupBy);
  const visibleEvents = events.filter(event => {
    const keyword = eventSearch.trim().toLowerCase();
    if (!keyword) return true;
    return `${event.title || ''} ${event.source || ''} ${event.subject_in_matrixview || ''}`.toLowerCase().includes(keyword);
  });
  const dashboardProjection = useMemo(() => computeDashboardProjection({ tasks, containers }), [tasks, containers]);
  const calendarProjection = useMemo(() => computeCalendarDateProjection({ date: selectedDate, tasks, events, containers }), [selectedDate, tasks, events, containers]);
  const todayKey = localDateKey();
  const tomorrowKey = localDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const todayProjection = useMemo(() => computeCalendarDateProjection({ date: todayKey, tasks, events, containers }), [todayKey, tasks, events, containers]);
  const tomorrowProjection = useMemo(() => computeCalendarDateProjection({ date: tomorrowKey, tasks, events, containers }), [tomorrowKey, tasks, events, containers]);
  const reminderState = useMemo(() => computeReminderState({ tasks, remindersEnabled: settingsDraft.notification_enabled !== false && settingsDraft.reminders_enabled !== false }), [tasks, settingsDraft.notification_enabled, settingsDraft.reminders_enabled]);
  const pendingTaskMutations = useMemo(() => taskRepository.listPendingTaskMutations(), [tasks]);

  useEffect(() => {
    setReminderSession(current => advanceReminderSession({ previousSession: current, reminderState }));
  }, [reminderState.status, reminderState.total, reminderState.items?.map(item => item.id).join('|')]);

  function updateReminderSession(event) {
    setReminderSession(current => advanceReminderSession({ previousSession: current, reminderState, event }));
  }
  const pendingCount = tasks.filter(task => !isCompleted(task)).length;
  const completedCount = tasks.filter(isCompleted).length;
  const selectedTask = tasks.find(task => task.id === selectedTaskId) || null;
  const selectedEvent = events.find(event => event.id === selectedEventId) || null;
  const selectedStructureItem = selectedStructure?.type === 'plan'
    ? plans.find(item => item.id === selectedStructure.id) || null
    : selectedStructure?.type === 'bucket'
      ? buckets.find(item => item.id === selectedStructure.id) || null
      : selectedStructure?.type === 'label'
        ? labels.find(item => item.id === selectedStructure.id) || null
        : selectedStructure?.type === 'container'
          ? containers.find(item => item.id === selectedStructure.id) || null
          : null;
  const accountName = account?.name || account?.display_name || account?.email || 'Google account';
  const accountPicture = account?.picture || account?.picture_url || null;
  const accountProfileName = accountProfile?.name || 'Personal Workspace';
  const hasSession = hasCloudSession();
  const canWrite = online && hasSession;
  const taskCanWrite = hasSession;
  const taskDeleteAllowed = online && hasSession;
  const accountInitial = (accountName || 'G').slice(0, 1).toUpperCase();
  const syncStateClass = !online ? 'offline' : !hasSession ? 'disconnected' : status.phase || 'ready';
  const syncStateLabel = !online ? '离线缓存' : !hasSession ? 'Google 未连接' : status.message || 'Cloud ready';
  const taskGroups = [
    { key: 'not_started', title: 'Not started', tasks: visibleTasks.filter(task => !isCompleted(task) && (task.progress || task.status || 'not_started') !== 'in_progress') },
    { key: 'in_progress', title: 'In progress', tasks: visibleTasks.filter(task => !isCompleted(task) && (task.progress === 'in_progress' || task.status === 'in_progress')) },
    { key: 'completed', title: 'Completed', tasks: visibleTasks.filter(isCompleted) }
  ];

  return (
    <LegacyPageShell
      activeView={activeView}
      navigateToView={navigateToView}
      online={online}
      status={status}
      tasks={tasks}
      visibleTasks={visibleTasks}
      events={events}
      visibleEvents={visibleEvents}
      plans={plans}
      buckets={buckets}
      labels={labels}
      containers={containers}
      settingsDraft={settingsDraft}
      setSettingsDraft={setSettingsDraft}
      dashboardProjection={dashboardProjection}
      todayProjection={todayProjection}
      tomorrowProjection={tomorrowProjection}
      calendarProjection={calendarProjection}
      reminderState={reminderState}
      reminderSession={reminderSession}
      pendingTaskMutations={pendingTaskMutations}
      pendingCount={pendingCount}
      completedCount={completedCount}
      selectedDate={selectedDate}
      setSelectedDate={setSelectedDate}
      taskGroups={taskGroups}
      taskViewMode={taskViewMode}
      setTaskViewMode={setTaskViewMode}
      taskScope={taskScope}
      setTaskScope={setTaskScope}
      taskGroupBy={taskGroupBy}
      setTaskGroupBy={setTaskGroupBy}
      taskPriorityFilter={taskPriorityFilter}
      setTaskPriorityFilter={setTaskPriorityFilter}
      filter={filter}
      setFilter={setFilter}
      search={search}
      setSearch={setSearch}
      eventSearch={eventSearch}
      setEventSearch={setEventSearch}
      calendarViewMode={calendarViewMode}
      setCalendarViewMode={setCalendarViewMode}
      selectedTask={selectedTask}
      selectedEvent={selectedEvent}
      selectedStructure={selectedStructure}
      selectedStructureItem={selectedStructureItem}
      canWrite={canWrite}
      taskCanWrite={taskCanWrite}
      taskDeleteAllowed={taskDeleteAllowed}
      accountName={accountName}
      accountPicture={accountPicture}
      accountProfileName={accountProfileName}
      ssoState={ssoState}
      googleButtonRef={googleButtonRef}
      onGoogleSsoMount={() => setGoogleSsoMountTick(value => value + 1)}
      hasSession={hasSession}
      syncStateClass={syncStateClass}
      syncStateLabel={syncStateLabel}
      cloudSessionStatus={cloudSessionStatus}
      accountStatus={accountStatus}
      syncCursor={syncCursor}
      syncIncrementalStatus={syncIncrementalStatus}
      migrationResult={migrationResult}
      migrationConflicts={migrationConflicts}
      migrationConflictStatus={migrationConflictStatus}
      syncReplayOutcomes={syncReplayOutcomes}
      syncReplayDetail={syncReplayDetail}
      syncReplayStatus={syncReplayStatus}
      syncReadinessSummary={syncReadinessSummary}
      syncReadinessStatus={syncReadinessStatus}
      syncEnablementSimulation={syncEnablementSimulation}
      syncEnablementStatus={syncEnablementStatus}
      syncReplaySafety={syncReplaySafety}
      syncReplaySafetyStatus={syncReplaySafetyStatus}
      pendingTaskPreview={pendingTaskPreview}
      pendingTaskQueueStatus={pendingTaskQueueStatus}
      syncConflictRecords={syncConflictRecords}
      syncConflictDetail={syncConflictDetail}
      syncConflictStatus={syncConflictStatus}
      onSelectTask={id => setSelectedTaskId(id)}
      onSelectEvent={id => setSelectedEventId(id)}
      onPatchTask={updateTaskState}
      onDeleteTask={deleteTask}
      openCalendarComposer={() => setCalendarComposerOpen(true)}
      refreshWorkspace={refreshWorkspace}
      refreshTasks={refreshTasks}
      refreshEvents={refreshEvents}
      refreshStructure={refreshStructure}
      refreshSettings={refreshSettings}
      saveSettings={saveSettings}
      onRefreshCloud={refreshCloudSessionStatus}
      onRefreshChanges={refreshIncrementalChanges}
      onRunMigration={runPreviewMigration}
      onSignOut={disconnectGoogleSession}
      updateReminderSession={updateReminderSession}
    />
  );
}

function TaskBoardView({ groups, canWrite, canDelete, onPatch, onDelete, onSelect }) {
  return (
    <section id="kanbanBoard" className="kanban-board custom-scrollbar">
      {groups.map(group => (
        <div className="kanban-column planner-column" key={group.key}>
          <div className="kanban-column-header planner-column-header"><h3>{group.title}</h3><span>{group.tasks.length}</span></div>
          {group.tasks.length === 0 && <p className="empty-column">No tasks</p>}
          {group.tasks.map(task => <TaskCard key={task.id} task={task} canWrite={canWrite} canDelete={canDelete} onPatch={onPatch} onDelete={onDelete} onSelect={onSelect} />)}
        </div>
      ))}
    </section>
  );
}

function TaskCard({ task, canWrite, canDelete, onPatch, onDelete, onSelect }) {
  const completed = isCompleted(task);
  const pending = task.__sync_status === 'pending';
  const labels = Array.isArray(task.labels) ? task.labels : [];
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const checkedCount = checklist.filter(item => item.checked || item.completed).length;
  return (
    <article className={`task-card kanban-task-card ${completed ? 'progress-done completed' : ''} ${pending ? 'pending-sync' : ''}`} onClick={() => onSelect(task)} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') onSelect(task); }}>
      <div className="task-card-header">
        <strong className="task-title">{task.title}</strong>
        <button className="task-card-menu-btn" type="button" onClick={event => { event.stopPropagation(); onSelect(task); }}>⋯</button>
      </div>
      {labels.length > 0 && <div className="task-card-labels">{labels.slice(0, 3).map(label => <span key={label}>{label}</span>)}</div>}
      <div className="task-card-footer">
        <span className="task-card-meta">{formatTaskMeta(task)}</span>
        <div className="task-status-badges">
          {task.start_date && <span className="task-start-badge">Start {task.start_date}</span>}
          {(task.due_date || task.deadline) && <span className="task-due-badge">Due {task.due_date || task.deadline}</span>}
          {checklist.length > 0 && <span className="task-checklist-badge">{checkedCount}/{checklist.length}</span>}
          {pending && <span className="pending-sync-badge">Pending</span>}
        </div>
      </div>
      <div className="task-actions">
        {completed
          ? <button type="button" disabled={!canWrite || pending} title="Reopen task" onClick={event => { event.stopPropagation(); onPatch(task, { progress: 'not_started', completed_at: null }); }}><RotateCcw size={16} /></button>
          : <button type="button" disabled={!canWrite || pending} title="Complete task" onClick={event => { event.stopPropagation(); onPatch(task, { progress: 'completed' }); }}><CheckCircle2 size={16} /></button>}
        <button type="button" disabled={!canDelete || pending} title="Delete task" onClick={event => { event.stopPropagation(); onDelete(task); }}><Trash2 size={16} /></button>
      </div>
    </article>
  );
}

function TaskListTable({ tasks, canWrite, canDelete, onPatch, onDelete, onSelect }) {
  return (
    <section id="taskListView" className="task-list-view custom-scrollbar">
      <div className="task-list">
        {tasks.length === 0 && <p className="empty-column">No tasks match this view.</p>}
        {tasks.map(task => {
          const completed = isCompleted(task);
          const pending = task.__sync_status === 'pending';
          return (
            <article className={`task-list-row ${completed ? 'completed' : ''}`} key={task.id} onClick={() => onSelect(task)} role="button" tabIndex={0}>
              <div className="task-list-main">
                <div className="task-list-title-wrap"><strong className="task-list-title">{task.title}</strong>{pending && <span className="pending-sync-badge">Pending</span>}</div>
                <div className="task-list-meta">
                  <span className="task-list-priority">{task.priority || 'medium'}</span>
                  {task.bucket_id && <span className="task-list-bucket">{task.bucket_id}</span>}
                  {(task.due_date || task.deadline) && <span className="task-list-due">Due {task.due_date || task.deadline}</span>}
                  {task.schedule_time && <span>{task.schedule_time}</span>}
                </div>
              </div>
              <div className="task-actions">
                {completed
                  ? <button type="button" disabled={!canWrite || pending} onClick={event => { event.stopPropagation(); onPatch(task, { progress: 'not_started', completed_at: null }); }}><RotateCcw size={16} /></button>
                  : <button type="button" disabled={!canWrite || pending} onClick={event => { event.stopPropagation(); onPatch(task, { progress: 'completed' }); }}><CheckCircle2 size={16} /></button>}
                <button type="button" disabled={!canDelete || pending} onClick={event => { event.stopPropagation(); onDelete(task); }}><Trash2 size={16} /></button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TaskCalendarView({ tasks, selectedDate, onSelect }) {
  const month = monthKey(selectedDate);
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${month}-${String(day).padStart(2, '0')}`;
    cells.push({ day, dateKey, tasks: tasks.filter(task => task.start_date === dateKey || task.due_date === dateKey || task.deadline === dateKey) });
  }
  return (
    <section id="taskCalendarView" className="task-calendar-view custom-scrollbar">
      <div className="task-calendar-months">
        <div className="task-calendar-month">
          <h3 className="task-calendar-month-title">{month}</h3>
          <div className="task-calendar-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>
          <div className="task-calendar-grid">
            {cells.map((cell, index) => cell ? (
              <div className={`task-calendar-day ${cell.dateKey === selectedDate ? 'today' : ''}`} key={cell.dateKey}>
                <span className="task-calendar-date">{cell.day}</span>
                <div className="task-calendar-items">
                  {cell.tasks.slice(0, 4).map(task => (
                    <button className={`task-calendar-item ${task.start_date === cell.dateKey ? 'start' : 'due'}`} key={`${cell.dateKey}-${task.id}`} type="button" onClick={() => onSelect(task)}>
                      <span className="task-calendar-item-title">{task.title}</span>
                      <span className="task-calendar-item-type">{task.start_date === cell.dateKey ? 'start' : 'due'}</span>
                    </button>
                  ))}
                  {cell.tasks.length > 4 && <span className="task-calendar-more">+{cell.tasks.length - 4} more</span>}
                </div>
              </div>
            ) : <div className="task-calendar-spacer" key={`spacer-${index}`} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function TaskDetailPanel({ task, plans, buckets, labels, canWrite, onSave, onClose }) {
  const [form, setForm] = useState(null);
  const isManageBac = isManageBacSourceTask(task);
  const isPending = task?.__sync_status === 'pending';

  useEffect(() => {
    if (!task) {
      setForm(null);
      return;
    }
    setForm({
      title: task.title || '',
      start_date: task.start_date || '',
      due_date: task.due_date || '',
      schedule_time: task.schedule_time || '',
      duration: task.duration || 45,
      priority: task.priority || 'medium',
      progress: task.progress || task.status || 'not_started',
      plan_id: task.plan_id || '',
      bucket_id: task.bucket_id || '',
      recurrence_frequency: task.recurrence_frequency || 'none',
      recurrence_count: task.recurrence_count || 1,
      notes: task.notes || task.description || '',
      labels_text: Array.isArray(task.labels) ? task.labels.join(', ') : '',
      checklist_text: Array.isArray(task.checklist) ? task.checklist.map(item => typeof item === 'string' ? item : item.text || item.title || '').filter(Boolean).join('\n') : ''
    });
  }, [task?.id]);

  if (!task || !form) {
    return <div className="panel task-detail-panel empty-detail"><h2>Task detail</h2><p>Select a task to inspect and edit Cloud fields.</p></div>;
  }

  function updateField(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    const checklist = form.checklist_text.split('\n').map(text => text.trim()).filter(Boolean).map((text, index) => ({ id: `${task.id || 'task'}-check-${index}`, text, completed: false }));
    const nextLabels = form.labels_text.split(',').map(text => text.trim()).filter(Boolean);
    const patch = {
      start_date: form.start_date || null,
      schedule_time: form.schedule_time || null,
      duration: Number(form.duration || 45),
      priority: form.priority,
      progress: form.progress,
      bucket_id: form.bucket_id || null,
      recurrence_frequency: form.recurrence_frequency === 'none' ? null : form.recurrence_frequency,
      recurrence_count: form.recurrence_frequency === 'none' ? null : Number(form.recurrence_count || 1),
      notes: form.notes || null,
      labels: nextLabels,
      checklist
    };
    if (!isManageBac) {
      patch.title = form.title.trim() || task.title;
      patch.due_date = form.due_date || null;
      patch.plan_id = form.plan_id || null;
    }
    onSave(patch);
  }

  return (
    <div className="panel task-detail-panel">
      <div className="panel-heading-row">
        <h2>Task detail</h2>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      {isManageBac && <p className="source-boundary-note">ManageBac source task: title, due date, Plan and source metadata are read-only. Local execution fields remain editable.</p>}
      {isPending && <p className="pending-detail-note">This Task has local pending sync. Use Settings / Pending Task queue to retry preview or discard it before direct Cloud edits.</p>}
      <form className="task-detail-form" onSubmit={submit}>
        <label><span>Title</span><input value={form.title} onChange={event => updateField('title', event.target.value)} disabled={!canWrite || isManageBac} /></label>
        <label><span>Start</span><input type="date" value={form.start_date} onChange={event => updateField('start_date', event.target.value)} disabled={!canWrite} /></label>
        <label><span>Due</span><input type="date" value={form.due_date} onChange={event => updateField('due_date', event.target.value)} disabled={!canWrite || isManageBac} /></label>
        <label><span>Schedule</span><input type="time" value={form.schedule_time} onChange={event => updateField('schedule_time', event.target.value)} disabled={!canWrite} /></label>
        <label><span>Duration</span><input type="number" min="5" step="5" value={form.duration} onChange={event => updateField('duration', event.target.value)} disabled={!canWrite} /></label>
        <label><span>Priority</span><select value={form.priority} onChange={event => updateField('priority', event.target.value)} disabled={!canWrite}><option value="urgent">Urgent</option><option value="important">Important</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
        <label><span>Status</span><select value={form.progress} onChange={event => updateField('progress', event.target.value)} disabled={!canWrite}><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></label>
        <label><span>Plan</span><select value={form.plan_id} onChange={event => updateField('plan_id', event.target.value)} disabled={!canWrite || isManageBac}><option value="">No plan</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        <label><span>Bucket</span><select value={form.bucket_id} onChange={event => updateField('bucket_id', event.target.value)} disabled={!canWrite}><option value="">No bucket</option>{buckets.map(bucket => <option key={bucket.id} value={bucket.id}>{bucket.name}</option>)}</select></label>
        <label><span>Recurrence</span><select value={form.recurrence_frequency} onChange={event => updateField('recurrence_frequency', event.target.value)} disabled={!canWrite || isManageBac}><option value="none">None</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label><span>Repeat count</span><input type="number" min="1" max="52" value={form.recurrence_count} onChange={event => updateField('recurrence_count', event.target.value)} disabled={!canWrite || isManageBac || form.recurrence_frequency === 'none'} /></label>
        <label className="full-row"><span>Labels</span><input value={form.labels_text} onChange={event => updateField('labels_text', event.target.value)} placeholder={labels.map(label => label.name).join(', ')} disabled={!canWrite} /></label>
        <label className="full-row"><span>Checklist</span><textarea value={form.checklist_text} onChange={event => updateField('checklist_text', event.target.value)} disabled={!canWrite} /></label>
        <label className="full-row"><span>Notes</span><textarea value={form.notes} onChange={event => updateField('notes', event.target.value)} disabled={!canWrite} /></label>
        <button type="submit" disabled={!canWrite}>Save task detail</button>
      </form>
    </div>
  );
}

function StructureDetailPanel({ selection, item, plans, canWrite, onSave, onClose }) {
  const [form, setForm] = useState(null);
  const type = selection?.type || null;
  const typeLabel = type ? type.slice(0, 1).toUpperCase() + type.slice(1) : 'Structure';

  useEffect(() => {
    if (!type || !item) {
      setForm(null);
      return;
    }
    setForm({
      name: item.name || '',
      color: item.color || '#2364aa',
      icon_char: item.icon_char || '',
      subject: item.subject || '',
      subject_in_matrixview: item.subject_in_matrixview || '',
      plan_id: item.plan_id || '',
      sort_order: item.sort_order ?? '',
      time_start: item.time_start || '',
      time_end: item.time_end || '',
      repeat: item.repeat || 'weekday',
      enabled: item.enabled !== false,
      active_start_date: item.active_start_date || '',
      active_end_date: item.active_end_date || ''
    });
  }, [type, item?.id, item?.revision]);

  if (!type || !item || !form) {
    return <div className="structure-detail-panel empty-detail"><h3>Structure detail</h3><p>Select a Plan, Bucket, Label or Container to edit Cloud structure fields.</p></div>;
  }

  function updateField(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    let patch = { name: form.name.trim() };
    if (type === 'plan') {
      patch = {
        ...patch,
        color: form.color || null,
        icon_char: form.icon_char || null,
        subject: form.subject || null,
        subject_in_matrixview: form.subject_in_matrixview || null,
        sort_order: form.sort_order === '' ? null : Number(form.sort_order || 0)
      };
    } else if (type === 'bucket') {
      patch = {
        ...patch,
        color: form.color || null,
        plan_id: form.plan_id || null,
        sort_order: form.sort_order === '' ? null : Number(form.sort_order || 0)
      };
    } else if (type === 'label') {
      patch = {
        ...patch,
        color: form.color || null,
        plan_id: form.plan_id || null
      };
    } else if (type === 'container') {
      patch = {
        ...patch,
        time_start: form.time_start || null,
        time_end: form.time_end || null,
        repeat: form.repeat || null,
        enabled: Boolean(form.enabled),
        active_start_date: form.active_start_date || null,
        active_end_date: form.active_end_date || null
      };
    }
    onSave(type, item, patch);
  }

  return (
    <div className="structure-detail-panel">
      <div className="panel-heading-row">
        <h3>{typeLabel} detail</h3>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <form className="structure-detail-form" onSubmit={submit}>
        <label><span>Name</span><input value={form.name} onChange={event => updateField('name', event.target.value)} disabled={!canWrite} /></label>
        {type !== 'container' && <label><span>Color</span><input type="color" value={form.color} onChange={event => updateField('color', event.target.value)} disabled={!canWrite} /></label>}
        {type === 'plan' && <label><span>Icon</span><input value={form.icon_char} onChange={event => updateField('icon_char', event.target.value.slice(0, 2))} disabled={!canWrite} /></label>}
        {type === 'plan' && <label><span>Subject</span><input value={form.subject} onChange={event => updateField('subject', event.target.value)} disabled={!canWrite} /></label>}
        {type === 'plan' && <label><span>Matrix subject</span><input value={form.subject_in_matrixview} onChange={event => updateField('subject_in_matrixview', event.target.value)} disabled={!canWrite} /></label>}
        {(type === 'plan' || type === 'bucket') && <label><span>Sort order</span><input type="number" value={form.sort_order} onChange={event => updateField('sort_order', event.target.value)} disabled={!canWrite} /></label>}
        {(type === 'bucket' || type === 'label') && <label><span>Plan</span><select value={form.plan_id} onChange={event => updateField('plan_id', event.target.value)} disabled={!canWrite}><option value="">No plan</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>}
        {type === 'container' && <label><span>Start</span><input type="time" value={form.time_start} onChange={event => updateField('time_start', event.target.value)} disabled={!canWrite} /></label>}
        {type === 'container' && <label><span>End</span><input type="time" value={form.time_end} onChange={event => updateField('time_end', event.target.value)} disabled={!canWrite} /></label>}
        {type === 'container' && <label><span>Repeat</span><select value={form.repeat} onChange={event => updateField('repeat', event.target.value)} disabled={!canWrite}><option value="weekday">Weekday</option><option value="weekend">Weekend</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>}
        {type === 'container' && <label><span>Active start</span><input type="date" value={form.active_start_date} onChange={event => updateField('active_start_date', event.target.value)} disabled={!canWrite} /></label>}
        {type === 'container' && <label><span>Active end</span><input type="date" value={form.active_end_date} onChange={event => updateField('active_end_date', event.target.value)} disabled={!canWrite} /></label>}
        {type === 'container' && <label className="check-row"><input type="checkbox" checked={Boolean(form.enabled)} onChange={event => updateField('enabled', event.target.checked)} disabled={!canWrite} /><span>Enabled</span></label>}
        <button type="submit" disabled={!canWrite}>Save structure detail</button>
      </form>
    </div>
  );
}

function ReminderStatePanel({ state, session, onSessionEvent }) {
  return (
    <div className={`metric wide reminder-state ${state.status}`}>
      <span>Reminder state</span>
      <strong>{state.label}</strong>
      {session?.status && <p>Session: {session.status}{session.execution_check_at ? ` · check ${new Date(session.execution_check_at).toLocaleTimeString()}` : ''}</p>}
      {state.items?.length > 0 && <p>{state.items.map(item => `${item.title}${item.schedule_time ? ` ${item.schedule_time}` : ''}`).join('；')}{state.overflow ? ` · +${state.overflow}` : ''}</p>}
      {state.status === 'due' && (
        <div className="reminder-session-actions">
          <button type="button" onClick={() => onSessionEvent?.({ type: 'notification_sent' })}>Mark sent</button>
          <button type="button" onClick={() => onSessionEvent?.({ type: 'notification_closed' })}>Mark closed</button>
          <button type="button" onClick={() => onSessionEvent?.({ type: 'notification_clicked' })}>Mark clicked</button>
          <button type="button" onClick={() => onSessionEvent?.({ type: 'stop_session' })}>Stop session</button>
        </div>
      )}
    </div>
  );
}

function CalendarWeekView({ selectedDate, tasks, events, containers, onSelectTask, onSelectEvent }) {
  const start = startOfWeekKey(selectedDate);
  const days = Array.from({ length: 7 }, (_, index) => addDaysToKey(start, index));
  const hours = Array.from({ length: 16 }, (_, index) => index + 7);
  return (
    <div id="weekView" className="view-panel calendar-week-view">
      <div className="calendar-header-row">
        <div className="timezone-cell">GMT+08</div>
        <div className="days-wrapper">
          {days.map(day => <div className={`day-header ${day === localDateKey() ? 'today' : ''}`} key={day}><span>{new Date(`${day}T00:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' })}</span><strong>{day.slice(5)}</strong></div>)}
        </div>
      </div>
      <div className="allday-row">
        <div className="allday-spacer" />
        <div className="allday-grid">
          {days.map(day => {
            const projection = computeCalendarDateProjection({ date: day, tasks, events, containers });
            return <div className="allday-cell" key={day}>{projection.allDayItems?.slice(0, 3).map(item => <CalendarMiniItem key={`${day}-${item.kind}-${item.id}`} item={item} onSelectTask={onSelectTask} onSelectEvent={onSelectEvent} />)}</div>;
          })}
        </div>
      </div>
      <div className="calendar-body">
        <div className="time-axis">{hours.map(hour => <div className="time-label" key={hour}>{String(hour).padStart(2, '0')}:00</div>)}</div>
        <div className="columns-layer">
          {days.map(day => {
            const projection = computeCalendarDateProjection({ date: day, tasks, events, containers });
            return (
              <div className="day-column" key={day}>
                {hours.map(hour => <div className="hour-line" key={hour} />)}
                <div className="day-column-items">
                  {projection.timedItems.slice(0, 18).map(item => <CalendarMiniItem key={`${day}-${item.kind}-${item.id}`} item={item} onSelectTask={onSelectTask} onSelectEvent={onSelectEvent} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CalendarMonthView({ selectedDate, tasks, events, containers, onSelectTask, onSelectEvent }) {
  const month = monthKey(selectedDate);
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    cells.push({ day, date, projection: computeCalendarDateProjection({ date, tasks, events, containers }) });
  }
  return (
    <div id="monthView" className="view-panel calendar-month-view">
      <div className="month-header-row">{['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(day => <div className="month-day-header" key={day}>{day}</div>)}</div>
      <div className="month-grid">
        {cells.map((cell, index) => cell ? (
          <div className={`month-cell ${cell.date === localDateKey() ? 'today' : ''}`} key={cell.date}>
            <span className="month-day-number">{cell.day}</span>
            {[...cell.projection.timedItems, ...(cell.projection.allDayItems || [])].slice(0, 5).map(item => <CalendarMiniItem key={`${cell.date}-${item.kind}-${item.id}`} item={item} onSelectTask={onSelectTask} onSelectEvent={onSelectEvent} />)}
          </div>
        ) : <div className="month-cell other-month" key={`blank-${index}`} />)}
      </div>
    </div>
  );
}

function CalendarMiniItem({ item, onSelectTask, onSelectEvent }) {
  const handleClick = () => {
    if (item.kind === 'task') onSelectTask?.(item.source || item);
    if (item.kind === 'event') onSelectEvent?.(item.source || item);
  };
  return (
    <button type="button" className={`calendar-mini-item event-card ${item.kind}`} aria-label={`${item.kind === 'event' ? 'Open grid event' : 'Open grid task'} ${item.time_start || item.schedule_time || ''}`} onClick={handleClick}>
      <span>{item.time_start || item.schedule_time || ''}</span>
      <strong>{item.title}</strong>
      <em>{item.kind}</em>
    </button>
  );
}

function CalendarProjectionPanel({ projection, compact = false, title, onSelectTask }) {
  return (
    <div className={`panel calendar-projection ${compact ? 'compact' : ''}`}>
      <h2>{title || (compact ? 'Today projection' : 'Date projection')}</h2>
      {!compact && <p className="projection-date-label">{projection.date}</p>}
      <div className="projection-counts">
        <span>{projection.counts.containers} containers</span>
        <span>{projection.counts.events} events</span>
        <span>{projection.counts.tasks} tasks</span>
      </div>
      {projection.timedItems.length === 0 && <p>No timed work for this date.</p>}
      <div className="projection-list">
        {projection.timedItems.slice(0, compact ? 5 : 20).map(item => (
          <article className={`projection-row ${item.kind}`} key={`${item.kind}-${item.id}`}>
            <span>{item.time_start || '--:--'}</span>
            <strong>{item.title}</strong>
            <em>{item.kind}</em>
            {item.kind === 'task' && onSelectTask && <button type="button" onClick={() => onSelectTask(item.source)}>Open</button>}
          </article>
        ))}
      </div>
    </div>
  );
}

function CalendarEventDetailPanel({ event, canWrite, onSave, onClose }) {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!event) {
      setForm(null);
      return;
    }
    setForm({
      title: event.title || '',
      date: event.date || '',
      time_start: event.time_start || '',
      time_end: event.time_end || '',
      repeat: event.repeat || event.payload?.repeat || 'none',
      repeat_days_text: formatRepeatDaysText(event.repeat_days || event.payload?.repeat_days),
      active_start_date: event.active_start_date || '',
      active_end_date: event.active_end_date || '',
      source: event.source || 'web_app'
    });
  }, [event?.id]);

  if (!event || !form) {
    return <div className="panel calendar-event-detail empty-detail"><h2>Calendar event detail</h2><p>Select an event to inspect and edit Cloud schedule fields.</p></div>;
  }

  function updateField(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  function submit(detailEvent) {
    detailEvent.preventDefault();
    if (!form.title.trim()) return;
    const repeat = form.repeat || 'none';
    const repeatDays = parseRepeatDaysText(form.repeat_days_text);
    onSave({
      title: form.title.trim(),
      date: form.date || null,
      time_start: form.time_start || null,
      time_end: form.time_end || null,
      active_start_date: repeat === 'none' ? null : form.active_start_date || form.date || null,
      active_end_date: repeat === 'none' ? null : form.active_end_date || null,
      payload: {
        ...(event.payload && typeof event.payload === 'object' ? event.payload : {}),
        repeat,
        repeat_days: repeat === 'weekly' || repeat === 'custom' ? repeatDays : []
      }
    });
  }

  return (
    <div className="panel calendar-event-detail">
      <div className="panel-heading-row">
        <h2>Calendar event detail</h2>
        <span className="sr-only">Edit event</span>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <p className="source-boundary-note">Calendar source metadata is read-only in WebDev v1. Edit the title and schedule fields only.</p>
      <form className="calendar-detail-form" onSubmit={submit}>
        <label><span>Title</span><input value={form.title} onChange={detailEvent => updateField('title', detailEvent.target.value)} disabled={!canWrite} /></label>
        <label><span>Date</span><input type="date" value={form.date} onChange={detailEvent => updateField('date', detailEvent.target.value)} disabled={!canWrite} /></label>
        <label><span>Start</span><input type="time" value={form.time_start} onChange={detailEvent => updateField('time_start', detailEvent.target.value)} disabled={!canWrite} /></label>
        <label><span>End</span><input type="time" value={form.time_end} onChange={detailEvent => updateField('time_end', detailEvent.target.value)} disabled={!canWrite} /></label>
        <label><span>Repeat</span><select value={form.repeat} onChange={detailEvent => updateField('repeat', detailEvent.target.value)} disabled={!canWrite}><option value="none">None</option><option value="daily">Daily</option><option value="weekday">Weekday</option><option value="weekend">Weekend</option><option value="weekly">Weekly</option><option value="custom">Custom</option></select></label>
        <label><span>Repeat days</span><input value={form.repeat_days_text} onChange={detailEvent => updateField('repeat_days_text', detailEvent.target.value)} placeholder="0,1,2 for Sun,Mon,Tue" disabled={!canWrite || !['weekly', 'custom'].includes(form.repeat)} /></label>
        <label><span>Active start</span><input type="date" value={form.active_start_date} onChange={detailEvent => updateField('active_start_date', detailEvent.target.value)} disabled={!canWrite || form.repeat === 'none'} /></label>
        <label><span>Active end</span><input type="date" value={form.active_end_date} onChange={detailEvent => updateField('active_end_date', detailEvent.target.value)} disabled={!canWrite || form.repeat === 'none'} /></label>
        <label className="full-row"><span>Source</span><input value={form.source} disabled readOnly /></label>
        <button type="submit" disabled={!canWrite}>Save calendar event detail</button>
      </form>
    </div>
  );
}

function MigrationConflictReviewPanel({ conflicts, status, canWrite, onRefresh, onResolve }) {
  return (
    <div className="migration-conflicts">
      <div className="panel-heading-row">
        <h3>Migration conflicts</h3>
        <button type="button" onClick={onRefresh}>Refresh</button>
      </div>
      <p>{status}</p>
      {conflicts.length === 0 && <p>No open migration conflicts to review.</p>}
      {conflicts.map(conflict => (
        <article className="conflict-row" key={conflict.id}>
          <div>
            <strong>{conflict.entity_type} · {conflict.reason}</strong>
            <span>{conflict.entity_id || conflict.id}</span>
          </div>
          <pre>{JSON.stringify({ local: conflict.local, cloud: conflict.cloud }, null, 2)}</pre>
          <div className="conflict-actions">
            <button type="button" disabled={!canWrite} onClick={() => onResolve(conflict, 'use_cloud')}>Use cloud</button>
            <button type="button" disabled={!canWrite} onClick={() => onResolve(conflict, 'use_local')}>Use local</button>
            <button type="button" disabled={!canWrite} onClick={() => onResolve(conflict, 'skip')}>Skip</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function SyncReplayReadinessPanel({ summary, status, canRead, onRefresh }) {
  const readiness = summary?.readiness || null;
  const previewHardening = readiness?.preview_hardening || null;
  return (
    <div className="panel sync-readiness-diagnostics">
      <div className="panel-heading-row">
        <h2>Replay readiness summary</h2>
        <button type="button" disabled={!canRead} onClick={onRefresh}>Preview readiness</button>
      </div>
      <p>{status}</p>
      <p>Offline replay is still disabled. This card aggregates dry-run candidate counts, blocked reasons, and preview counts for developer review.</p>
      {readiness && (
        <>
          <div className="readiness-grid">
            <span>Apply candidates <strong>{readiness.candidate_counts?.apply || 0}</strong></span>
            <span>Conflict candidates <strong>{readiness.candidate_counts?.conflict || 0}</strong></span>
            <span>Rejected <strong>{readiness.candidate_counts?.reject || 0}</strong></span>
            <span>Apply plans <strong>{readiness.preview_counts?.apply_plan || 0}</strong></span>
            <span>Conflict previews <strong>{readiness.preview_counts?.conflict_record || 0}</strong></span>
            {previewHardening && <span>Evidence gaps <strong>{previewHardening.evidence_gaps?.length || 0}</strong></span>}
            {previewHardening && <span>Dependency blockers <strong>{previewHardening.dependency_summary?.blocked_count || 0}</strong></span>}
            {previewHardening && <span>Cloud validation <strong>{previewHardening.dependency_summary?.requires_cloud_validation_count || 0}</strong></span>}
          </div>
          <pre>{JSON.stringify({
            state: readiness.state,
            can_enable_replay: readiness.can_enable_replay,
            blocked_reasons: readiness.blocked_reasons,
            dependency_analysis: readiness.dependency_analysis,
            preview_hardening: readiness.preview_hardening,
            sample_results: readiness.sample_results,
            recommendations: summary.recommendations
          }, null, 2)}</pre>
        </>
      )}
    </div>
  );
}

function SyncReplayEnablementSimulationPanel({ simulation, status, canRead, onRefresh }) {
  const gates = Array.isArray(simulation?.gates) ? simulation.gates : [];
  return (
    <div className="panel sync-enable-simulation-diagnostics">
      <div className="panel-heading-row">
        <h2>Replay enablement simulation</h2>
        <button type="button" disabled={!canRead} onClick={onRefresh}>Run simulation</button>
      </div>
      <p>{status}</p>
      <p>This simulation evaluates Gate A-E inputs only. It cannot enable replay, persist user data, or change Cloud tasks.</p>
      {simulation && (
        <>
          <div className="readiness-grid">
            <span>Gate pass <strong>{gates.filter(gate => gate.passed).length}/{gates.length}</strong></span>
            <span>Writes enabled <strong>{simulation.writes_enabled ? 'yes' : 'no'}</strong></span>
            <span>Can enable <strong>{simulation.can_enable_replay ? 'yes' : 'no'}</strong></span>
            <span>Mode <strong>{simulation.replay_enablement}</strong></span>
          </div>
          <pre>{JSON.stringify({
            simulated_gate_pass: simulation.simulated_gate_pass,
            gates: gates.map(gate => ({
              id: gate.id,
              label: gate.label,
              passed: gate.passed,
              missing: gate.missing
            })),
            recommendation: simulation.recommendation
          }, null, 2)}</pre>
        </>
      )}
    </div>
  );
}

function SyncReplaySafetyPanel({ safety, status, canRead, onRefresh }) {
  const blockers = Array.isArray(safety?.blockers) ? safety.blockers : [];
  return (
    <div className="panel sync-replay-safety-diagnostics">
      <div className="panel-heading-row">
        <h2>Replay safety gate</h2>
        <button type="button" disabled={!canRead} onClick={onRefresh}>Refresh safety</button>
      </div>
      <p>{status}</p>
      <p>Phase 4 safety gate only reports kill switch, environment, and blocker status. It cannot enable production replay or apply queued local changes.</p>
      {safety && (
        <>
          <div className="readiness-grid">
            <span>Environment <strong>{safety.environment}</strong></span>
            <span>Kill switch <strong>{safety.kill_switch_active ? 'active' : 'off'}</strong></span>
            <span>Local/dev allowed <strong>{safety.local_dev_replay_allowed ? 'yes' : 'no'}</strong></span>
            <span>Prod allowed <strong>{safety.prod_replay_allowed ? 'yes' : 'no'}</strong></span>
            <span>Writes enabled <strong>{safety.writes_enabled ? 'yes' : 'no'}</strong></span>
          </div>
          <pre>{JSON.stringify({
            can_run_replay: safety.can_run_replay,
            applies_user_data: safety.applies_user_data,
            blockers,
            recommendation: safety.recommendation
          }, null, 2)}</pre>
        </>
      )}
    </div>
  );
}

function PendingTaskQueuePanel({ mutations, preview, status, canPreview, onPreviewAll, onPreviewTask, onDiscardTask }) {
  const grouped = mutations.reduce((map, mutation) => {
    const current = map.get(mutation.entity_id) || {
      entity_id: mutation.entity_id,
      task: mutation.task,
      mutations: []
    };
    current.mutations.push(mutation);
    if (!current.task && mutation.task) current.task = mutation.task;
    map.set(mutation.entity_id, current);
    return map;
  }, new Map());
  const rows = Array.from(grouped.values()).sort((left, right) => {
    const leftTime = left.mutations[0]?.created_at || '';
    const rightTime = right.mutations[0]?.created_at || '';
    return rightTime.localeCompare(leftTime);
  });
  const counts = preview?.readiness?.candidate_counts || null;
  return (
    <div className="panel pending-task-queue">
      <div className="panel-heading-row">
        <h2>Pending Task queue</h2>
        <button type="button" disabled={!canPreview || mutations.length === 0} onClick={onPreviewAll}>Retry preview</button>
      </div>
      <p>{status}</p>
      <p>Pending Task edits are local-only until Worker replay is explicitly enabled. Retry preview runs dry-run/readiness only; discard removes local pending changes without changing Cloud data.</p>
      {rows.length === 0 && <p>No local pending Task edits.</p>}
      <div className="pending-task-list">
        {rows.map(row => (
          <article className="pending-task-row" key={row.entity_id}>
            <div>
              <strong>{row.task?.title || row.entity_id}</strong>
              <span>{row.mutations.length} queued mutation{row.mutations.length === 1 ? '' : 's'} · {row.mutations.map(mutation => mutation.operation).join(', ')}</span>
              <span>{row.mutations[0]?.created_at ? new Date(row.mutations[0].created_at).toLocaleString() : 'queued locally'}</span>
            </div>
            <div className="pending-task-actions">
              <button type="button" disabled={!canPreview} onClick={() => onPreviewTask(row.entity_id)}>Retry preview</button>
              <button type="button" onClick={() => onDiscardTask(row.entity_id)}>Discard local pending</button>
            </div>
          </article>
        ))}
      </div>
      {preview && (
        <pre>{JSON.stringify({
          replay_enablement: preview.replay_enablement,
          writes_enabled: preview.writes_enabled,
          applies_user_data: preview.applies_user_data,
          candidate_counts: counts,
          blocked_reasons: preview.readiness?.blocked_reasons,
          sample_results: preview.readiness?.sample_results
        }, null, 2)}</pre>
      )}
    </div>
  );
}

function SyncReplayDiagnosticsPanel({ outcomes, detail, status, canRead, onRefresh, onInspect }) {
  return (
    <div className="panel sync-replay-diagnostics">
      <div className="panel-heading-row">
        <h2>Sync replay diagnostics</h2>
        <button type="button" disabled={!canRead} onClick={onRefresh}>Refresh outcomes</button>
      </div>
      <p>{status}</p>
      <p>Offline mutation replay is still disabled. This panel only reads sanitized replay gates and outcomes.</p>
      {outcomes.length === 0 && <p>No rejected replay outcomes to inspect.</p>}
      <div className="sync-outcome-list">
        {outcomes.map(outcome => (
          <article className="sync-outcome-row" key={outcome.mutation_id}>
            <div>
              <strong>{outcome.entity_type} · {outcome.operation}</strong>
              <span>{outcome.reason || outcome.outcome_status} · attempts {outcome.attempt_count || 1}</span>
              <span>{outcome.last_seen_at ? new Date(outcome.last_seen_at).toLocaleString() : outcome.mutation_id}</span>
            </div>
            <button type="button" onClick={() => onInspect(outcome)}>Inspect gate</button>
          </article>
        ))}
      </div>
      {detail && (
        <div className="sync-outcome-detail">
          <h3>Replay gate detail</h3>
          <pre>{JSON.stringify({
            mutation_id: detail.mutation_id,
            entity_type: detail.entity_type,
            entity_id: detail.entity_id,
            operation: detail.operation,
            replay_status: detail.replay_status,
            outcome_status: detail.outcome_status,
            reason: detail.reason,
            task_replay_gate: detail.task_replay_gate,
            attempt_count: detail.attempt_count,
            first_seen_at: detail.first_seen_at,
            last_seen_at: detail.last_seen_at
          }, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function SyncConflictDiagnosticsPanel({ conflicts, detail, status, canRead, canResolve, onRefresh, onInspect, onResolve }) {
  const taskConflicts = conflicts.filter(conflict => conflict.entity_type === 'task');
  return (
    <div className="panel sync-conflict-diagnostics">
      <div className="panel-heading-row">
        <h2>Task sync conflicts</h2>
        <button type="button" disabled={!canRead} onClick={onRefresh}>Refresh conflicts</button>
      </div>
      <p>{status}</p>
      <p>Resolve one Task conflict at a time. This phase can keep Cloud data or discard the local pending change; it cannot overwrite Cloud with local data.</p>
      {taskConflicts.length === 0 && <p>No open Task sync conflicts to review.</p>}
      <div className="sync-conflict-list">
        {taskConflicts.map(conflict => (
          <article className="sync-conflict-row" key={conflict.id}>
            <div>
              <strong>{conflict.entity_type} · {conflict.reason}</strong>
              <span>{conflict.entity_id || conflict.mutation_id || conflict.id}</span>
              <span>{conflict.created_at ? new Date(conflict.created_at).toLocaleString() : conflict.status}</span>
            </div>
            <div className="sync-conflict-actions">
              <button type="button" onClick={() => onInspect(conflict)}>Inspect</button>
              <button type="button" disabled={!canResolve} onClick={() => onResolve(conflict, 'keep_cloud')}>Keep cloud</button>
              <button type="button" disabled={!canResolve} onClick={() => onResolve(conflict, 'discard_local')}>Discard local</button>
              <button type="button" disabled={!canRead} onClick={() => onResolve(conflict, 'later')}>Later</button>
            </div>
          </article>
        ))}
      </div>
      {detail && (
        <div className="sync-conflict-detail">
          <h3>Task conflict detail</h3>
          <pre>{JSON.stringify({
            id: detail.id,
            mutation_id: detail.mutation_id,
            entity_type: detail.entity_type,
            entity_id: detail.entity_id,
            reason: detail.reason,
            status: detail.status,
            local: detail.local,
            cloud: detail.cloud,
            created_at: detail.created_at,
            resolved_at: detail.resolved_at
          }, null, 2)}</pre>
          <div className="conflict-actions">
            <button type="button" disabled={!canResolve || detail.entity_type !== 'task'} onClick={() => onResolve(detail, 'keep_cloud')}>Keep cloud</button>
            <button type="button" disabled={!canResolve || detail.entity_type !== 'task'} onClick={() => onResolve(detail, 'discard_local')}>Discard local</button>
            <button type="button" disabled={!canRead || detail.entity_type !== 'task'} onClick={() => onResolve(detail, 'later')}>Later</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarEventList({ events, canWrite, onSelect, onDelete }) {
  return (
    <div className="calendar-list">
      <h2>Calendar events</h2>
      {events.length === 0 && <p>No calendar events match this view.</p>}
      {events.map(event => (
        <article className="event-row" key={event.id}>
          <CalendarDays size={18} />
          <div className="event-main" role="button" tabIndex={0} onClick={() => onSelect?.(event)} onKeyDown={keyboardEvent => { if (keyboardEvent.key === 'Enter') onSelect?.(event); }}>
            <strong>{event.title}</strong>
            <span>{formatEventMeta(event)}</span>
          </div>
          <div className="event-actions">
            <button type="button" title="Edit event" onClick={() => onSelect?.(event)}><Pencil size={16} /></button>
            <button type="button" disabled={!canWrite} title="Delete event" onClick={() => onDelete(event)}><Trash2 size={16} /></button>
          </div>
        </article>
      ))}
    </div>
  );
}

function TaskPendingBanner({ mutations, onOpenQueue }) {
  if (!mutations.length) return null;
  const taskCount = new Set(mutations.map(mutation => mutation.entity_id)).size;
  return (
    <div className="task-pending-banner">
      <div>
        <strong>{taskCount} Task{taskCount === 1 ? '' : 's'} pending local sync</strong>
        <span>{mutations.length} queued mutation{mutations.length === 1 ? '' : 's'} need retry preview or local discard before direct Cloud edits.</span>
      </div>
      <button type="button" onClick={onOpenQueue}>Open pending queue</button>
    </div>
  );
}

function TaskList({ tasks, canWrite, canDelete = canWrite, onPatch, onDelete, onSelect, title = 'Current work' }) {
  return (
    <div className="panel task-list">
      <h2>{title}</h2>
      {tasks.length === 0 && <p>No tasks match this view.</p>}
      {tasks.map(task => {
        const completed = isCompleted(task);
        const pending = task.__sync_status === 'pending';
        const pendingLabel = task.__pending_operation ? `Pending sync: ${task.__pending_operation}` : 'Pending sync';
        const pendingTitle = 'Resolve local pending sync in Settings before direct Cloud edits.';
        return (
          <article className={`task-row ${completed ? 'completed' : ''} ${pending ? 'pending-sync' : ''}`} key={task.id}>
            {completed ? <CheckCircle2 size={18} className="done" /> : <Circle size={18} />}
            <div className="task-main" role="button" tabIndex={0} onClick={() => onSelect?.(task)} onKeyDown={event => { if (event.key === 'Enter') onSelect?.(task); }}>
              <strong>{task.title}</strong>
              <span>{formatTaskMeta(task)}</span>
              {pending && <em className="pending-sync-badge">{pendingLabel}{task.__pending_at ? ` · ${new Date(task.__pending_at).toLocaleString()}` : ''}</em>}
              {(task.notes || task.description) && <p>{task.notes || task.description}</p>}
            </div>
            <div className="task-actions">
              {completed ? (
                <button type="button" disabled={!canWrite || pending} title={pending ? pendingTitle : 'Reopen task'} onClick={() => onPatch(task, { progress: 'not_started', completed_at: null })}><RotateCcw size={16} /></button>
              ) : (
                <button type="button" disabled={!canWrite || pending} title={pending ? pendingTitle : 'Complete task'} onClick={() => onPatch(task, { progress: 'completed' })}><CheckCircle2 size={16} /></button>
              )}
              <button type="button" disabled={!canDelete || pending} title={pending ? 'Discard local pending in Settings before deleting' : canDelete ? 'Delete task' : 'Delete requires reconnect'} onClick={() => onDelete(task)}><Trash2 size={16} /></button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
