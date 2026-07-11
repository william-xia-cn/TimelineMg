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
  RefreshCw,
  RotateCcw,
  Settings,
  Trash2,
  WifiOff
} from 'lucide-react';
import { apiClient, ApiError } from './api/client.js';
import { createTaskRepository, OfflineWriteBlockedError } from './repositories/taskRepository.js';
import { createCalendarRepository, OfflineCalendarWriteBlockedError } from './repositories/calendarRepository.js';
import { createStructureRepository, OfflineStructureWriteBlockedError } from './repositories/structureRepository.js';
import { createSettingsRepository, OfflineSettingsWriteBlockedError } from './repositories/settingsRepository.js';
import { createMigrationRepository } from './repositories/migrationRepository.js';
import { createBrowserPlatform } from './platform/browserPlatform.js';
import { computeDashboardProjection } from './domain/dailySettleProjection.js';
import { computeCalendarDateProjection } from './domain/calendarDateProjection.js';
import { advanceReminderSession, computeReminderState } from './domain/reminderState.js';
import { buildLegacyIndexedDbSnapshot } from './migration/legacyIndexedDbSnapshotAdapter.js';
import { disableGoogleAutoSelect, GOOGLE_SSO_CLIENT_ID, renderGoogleSsoButton } from './auth/googleSso.js';

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
  time_end: ''
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
  default_task_duration: 45,
  default_task_priority: 'medium',
  reminders_enabled: true
};

function normalizeSettingsDraft(settings) {
  return {
    ...defaultSettingsDraft,
    ...(settings && typeof settings === 'object' ? settings : {})
  };
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
  if (event.source) parts.push(event.source);
  return parts.join(' · ');
}

function formatContainerMeta(container) {
  const parts = [];
  if (container.time_start || container.time_end) parts.push(`${container.time_start || '--:--'}-${container.time_end || '--:--'}`);
  if (container.repeat) parts.push(container.repeat);
  parts.push(container.enabled === false ? 'disabled' : 'enabled');
  return parts.join(' · ');
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export function App() {
  const platform = useMemo(() => createBrowserPlatform(), []);
  const googleButtonRef = useRef(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [session, setSession] = useState(() => apiClient.getSession());
  const [account, setAccount] = useState(() => apiClient.getSession()?.account || null);
  const [ssoState, setSsoState] = useState({ phase: GOOGLE_SSO_CLIENT_ID ? 'idle' : 'not_configured', message: GOOGLE_SSO_CLIENT_ID ? 'Google SSO ready.' : 'Set VITE_GOOGLE_OIDC_CLIENT_ID to enable Google SSO.' });
  const [cloudSessionStatus, setCloudSessionStatus] = useState('Cloud session not checked.');
  const taskRepository = useMemo(() => createTaskRepository(apiClient, { isOnline: () => navigator.onLine }), []);
  const calendarRepository = useMemo(() => createCalendarRepository(apiClient, { isOnline: () => navigator.onLine }), []);
  const structureRepository = useMemo(() => createStructureRepository(apiClient, { isOnline: () => navigator.onLine }), []);
  const settingsRepository = useMemo(() => createSettingsRepository(apiClient, { isOnline: () => navigator.onLine }), []);
  const migrationRepository = useMemo(() => createMigrationRepository(apiClient), []);
  const [activeView, setActiveView] = useState('dashboard');
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
  const [eventSearch, setEventSearch] = useState('');
  const [structureSearch, setStructureSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => localDateKey());
  const [selectedTaskId, setSelectedTaskId] = useState(null);
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
  const [syncConflictRecords, setSyncConflictRecords] = useState([]);
  const [syncConflictDetail, setSyncConflictDetail] = useState(null);
  const [syncConflictStatus, setSyncConflictStatus] = useState('Not loaded');
  const [reminderSession, setReminderSession] = useState(null);

  useEffect(() => platform.onNetworkChange(setOnline), [platform]);

  useEffect(() => {
    let disposed = false;
    async function refreshAccount() {
      if (!online || !session?.token) return;
      try {
        const data = await apiClient.getAccount();
        if (disposed) return;
        const nextAccount = data.account ? {
          id: data.account.id,
          email: data.account.email || null,
          name: data.account.display_name || data.account.name || null,
          picture: data.account.picture_url || data.account.picture || null
        } : session.account || null;
        setAccount(nextAccount);
        apiClient.setSession({ ...apiClient.getSession(), account: nextAccount });
        setCloudSessionStatus(`Cloud account active: ${nextAccount?.name || nextAccount?.email || 'Google account'}`);
      } catch (error) {
        if (disposed) return;
        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          apiClient.logoutLocal();
          setSession(null);
          setAccount(null);
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
  }, [activeView, online, session?.token]);

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

  async function refreshWorkspace() {
    await Promise.all([refreshTasks(), refreshEvents(), refreshStructure(), refreshSettings()]);
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
      const [accountData, syncData] = await Promise.all([apiClient.getAccount(), apiClient.getSyncStatus()]);
      const displayName = accountData.account?.display_name || accountData.account?.email || 'Google account';
      setCloudSessionStatus(`${displayName} · ${syncData.mode} · offline writes ${syncData.offline_writes}`);
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
      setStatus({ phase: 'preview', message: 'Google SSO disconnected. Preview/cache remains available.' });
      setCloudSessionStatus('No active TimeWhere Cloud session. Connect with Google SSO.');
      setSsoState({ phase: GOOGLE_SSO_CLIENT_ID ? 'idle' : 'not_configured', message: GOOGLE_SSO_CLIENT_ID ? 'Google SSO ready.' : 'Set VITE_GOOGLE_OIDC_CLIENT_ID to enable Google SSO.' });
      await refreshWorkspace();
    } catch (error) {
      setStatus({ phase: 'error', message: formatStatus(error) });
      setSsoState({ phase: 'error', message: formatStatus(error) });
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
      const created = await taskRepository.createTask({
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
      const updated = await taskRepository.updateTask(task.id, nextPatch);
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
      await taskRepository.deleteTask(task.id);
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
      const created = await calendarRepository.createEvent({
        title: eventDraft.title.trim(),
        date: eventDraft.date || null,
        time_start: eventDraft.time_start || null,
        time_end: eventDraft.time_end || null,
        source: 'web_app'
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
      await calendarRepository.deleteEvent(event.id);
      setEvents(current => current.filter(item => item.id !== event.id));
      setStatus({ phase: 'ready', message: 'Calendar event deleted from Cloud canonical store.' });
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
      setStatus({ phase: 'ready', message: 'Container deleted from Cloud canonical store.' });
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
      const saved = await settingsRepository.updateSettings({
        default_task_duration: Number(settingsDraft.default_task_duration || 45),
        default_task_priority: settingsDraft.default_task_priority || 'medium',
        reminders_enabled: Boolean(settingsDraft.reminders_enabled)
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

  const visibleTasks = tasks.filter(task => {
    if (filter === 'pending' && isCompleted(task)) return false;
    if (filter === 'completed' && !isCompleted(task)) return false;
    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;
    return `${task.title || ''} ${task.notes || ''} ${task.description || ''}`.toLowerCase().includes(keyword);
  });
  const visibleEvents = events.filter(event => {
    const keyword = eventSearch.trim().toLowerCase();
    if (!keyword) return true;
    return `${event.title || ''} ${event.source || ''} ${event.subject_in_matrixview || ''}`.toLowerCase().includes(keyword);
  });
  const dashboardProjection = useMemo(() => computeDashboardProjection({ tasks, containers }), [tasks, containers]);
  const calendarProjection = useMemo(() => computeCalendarDateProjection({ date: selectedDate, tasks, events, containers }), [selectedDate, tasks, events, containers]);
  const reminderState = useMemo(() => computeReminderState({ tasks, remindersEnabled: settingsDraft.reminders_enabled }), [tasks, settingsDraft.reminders_enabled]);

  useEffect(() => {
    setReminderSession(current => advanceReminderSession({ previousSession: current, reminderState }));
  }, [reminderState.status, reminderState.total, reminderState.items?.map(item => item.id).join('|')]);

  function updateReminderSession(event) {
    setReminderSession(current => advanceReminderSession({ previousSession: current, reminderState, event }));
  }
  const pendingCount = tasks.filter(task => !isCompleted(task)).length;
  const completedCount = tasks.filter(isCompleted).length;
  const selectedTask = tasks.find(task => task.id === selectedTaskId) || null;
  const accountName = account?.name || account?.display_name || account?.email || 'Google account';
  const accountPicture = account?.picture || account?.picture_url || null;
  const hasSession = hasCloudSession();
  const canWrite = online && hasSession;
  const taskCanWrite = hasSession;
  const taskDeleteAllowed = online && hasSession;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">TW</div>
          <span>TimeWhere</span>
        </div>
        <nav className="nav-list" aria-label="Primary">
          <button className={activeView === 'dashboard' ? 'active' : ''} onClick={() => setActiveView('dashboard')}><LayoutDashboard size={18} />Dashboard</button>
          <button className={activeView === 'tasks' ? 'active' : ''} onClick={() => setActiveView('tasks')}><ListChecks size={18} />Tasks</button>
          <button className={activeView === 'calendar' ? 'active' : ''} onClick={() => setActiveView('calendar')}><CalendarDays size={18} />Calendar</button>
          <button className={activeView === 'settings' ? 'active' : ''} onClick={() => setActiveView('settings')}><Settings size={18} />Settings</button>
        </nav>
        <div className={`cloud-state ${online ? status.phase : 'offline'}`}>
          {online ? <Cloud size={18} /> : <WifiOff size={18} />}
          <span>{online ? status.message : 'Offline read cache'}</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{activeView === 'dashboard' ? 'Dashboard' : activeView[0].toUpperCase() + activeView.slice(1)}</h1>
            <p>Cloud canonical data · Web business app · Electron runtime ready</p>
          </div>
          <button className="icon-button" onClick={refreshWorkspace} title="Refresh Cloud state"><RefreshCw size={18} /></button>
        </header>

        {!online && (
          <section className="notice warning">
            <AlertTriangle size={18} />
            <span>当前离线。Task 新建、编辑、完成和重开会进入待同步队列；删除和非 Task 数据仍需重新连接。</span>
          </section>
        )}

        {online && !hasCloudSession() && (
          <section className="notice info">
            <Cloud size={18} />
            <span>当前未连接 Google SSO。可浏览 preview/cache；创建、完成、删除任务和日历事件需要 Cloud account session。</span>
          </section>
        )}

        {activeView === 'dashboard' && (
          <section className="dashboard-grid">
            <div className="metric">
              <span>Pending</span>
              <strong>{pendingCount}</strong>
            </div>
            <div className="metric">
              <span>Completed</span>
              <strong>{completedCount}</strong>
            </div>
            <div className="metric">
              <span>Today projection</span>
              <strong>{dashboardProjection.pendingCount}</strong>
            </div>
            <div className="metric wide">
              <span>Current container</span>
              <strong>{dashboardProjection.activeContainer?.name || 'No active container'}</strong>
            </div>
            <ReminderStatePanel state={reminderState} session={reminderSession} onSessionEvent={updateReminderSession} />
            <CalendarProjectionPanel projection={calendarProjection} compact />
            <div className="metric wide">
              <span>Migration</span>
              <strong>{migrationResult?.status || 'Ready after Google SSO'}</strong>
            </div>
            <TaskList title="Projected current work" tasks={dashboardProjection.currentTasks} canWrite={taskCanWrite} canDelete={taskDeleteAllowed} onPatch={updateTaskState} onDelete={deleteTask} onSelect={task => setSelectedTaskId(task.id)} />
          </section>
        )}

        {activeView === 'tasks' && (
          <section className="tasks-layout">
            <div className="panel task-editor">
              <h2>Create task</h2>
              <form className="task-form expanded" onSubmit={addTask}>
                <label>
                  <span>Title</span>
                  <input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="Add a task" disabled={!taskCanWrite} />
                </label>
                <label>
                  <span>Due date</span>
                  <input type="date" value={draft.due_date} onChange={event => setDraft(current => ({ ...current, due_date: event.target.value }))} disabled={!taskCanWrite} />
                </label>
                <label>
                  <span>Time</span>
                  <input type="time" value={draft.schedule_time} onChange={event => setDraft(current => ({ ...current, schedule_time: event.target.value }))} disabled={!taskCanWrite} />
                </label>
                <label>
                  <span>Duration</span>
                  <input type="number" min="5" step="5" value={draft.duration} onChange={event => setDraft(current => ({ ...current, duration: event.target.value }))} disabled={!taskCanWrite} />
                </label>
                <label>
                  <span>Priority</span>
                  <select value={draft.priority} onChange={event => setDraft(current => ({ ...current, priority: event.target.value }))} disabled={!taskCanWrite}>
                    <option value="urgent">Urgent</option>
                    <option value="important">Important</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                <label>
                  <span>Recurrence</span>
                  <select value={draft.recurrence_frequency} onChange={event => setDraft(current => ({ ...current, recurrence_frequency: event.target.value }))} disabled={!taskCanWrite}>
                    <option value="none">None</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <label>
                  <span>Repeat count</span>
                  <input type="number" min="1" max="52" value={draft.recurrence_count} onChange={event => setDraft(current => ({ ...current, recurrence_count: event.target.value }))} disabled={!taskCanWrite || draft.recurrence_frequency === 'none'} />
                </label>
                <label className="full-row">
                  <span>Notes</span>
                  <textarea value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} disabled={!taskCanWrite} />
                </label>
                <button type="submit" disabled={!taskCanWrite}>{online ? 'Save to Cloud' : 'Queue task locally'}</button>
              </form>
            </div>

            <div className="panel task-browser">
              <div className="task-toolbar">
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tasks" />
                <select value={filter} onChange={event => setFilter(event.target.value)}>
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>
                <button type="button" onClick={refreshTasks}>Refresh</button>
              </div>
              <TaskList tasks={visibleTasks} canWrite={taskCanWrite} canDelete={taskDeleteAllowed} onPatch={updateTaskState} onDelete={deleteTask} onSelect={task => setSelectedTaskId(task.id)} />
              <TaskDetailPanel task={selectedTask} plans={plans} buckets={buckets} labels={labels} canWrite={taskCanWrite} onSave={patch => selectedTask && updateTaskState(selectedTask, patch)} onClose={() => setSelectedTaskId(null)} />
            </div>
          </section>
        )}

        {activeView === 'calendar' && (
          <section className="calendar-layout">
            <div className="panel calendar-editor">
              <h2>Create calendar event</h2>
              <form className="calendar-form" onSubmit={addEvent}>
                <label>
                  <span>Title</span>
                  <input value={eventDraft.title} onChange={event => setEventDraft(current => ({ ...current, title: event.target.value }))} placeholder="Add an event" disabled={!canWrite} />
                </label>
                <label>
                  <span>Date</span>
                  <input type="date" value={eventDraft.date} onChange={event => setEventDraft(current => ({ ...current, date: event.target.value }))} disabled={!canWrite} />
                </label>
                <label>
                  <span>Start</span>
                  <input type="time" value={eventDraft.time_start} onChange={event => setEventDraft(current => ({ ...current, time_start: event.target.value }))} disabled={!canWrite} />
                </label>
                <label>
                  <span>End</span>
                  <input type="time" value={eventDraft.time_end} onChange={event => setEventDraft(current => ({ ...current, time_end: event.target.value }))} disabled={!canWrite} />
                </label>
                <button type="submit" disabled={!canWrite}>Save event to Cloud</button>
              </form>
            </div>
            <div className="panel calendar-browser">
              <div className="task-toolbar">
                <input value={eventSearch} onChange={event => setEventSearch(event.target.value)} placeholder="Search calendar events" />
                <button type="button" onClick={refreshEvents}>Refresh</button>
              </div>
              <label className="date-picker-row">
                <span>Date projection</span>
                <input type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} />
              </label>
              <CalendarProjectionPanel projection={calendarProjection} onSelectTask={task => setSelectedTaskId(task.id)} />
              <CalendarEventList events={visibleEvents} canWrite={canWrite} onDelete={deleteEvent} />
            </div>
          </section>
        )}

        {activeView === 'settings' && (
          <section className="settings-layout">
            <div className="panel account-panel">
              <h2>Account</h2>
              <p>Google SSO creates a TimeWhere Cloud session through the Worker.</p>
              {hasCloudSession() ? (
                <div className="account-card">
                  {accountPicture ? <img src={accountPicture} alt="" /> : <div className="account-initial">{accountName.slice(0, 1).toUpperCase()}</div>}
                  <div>
                    <strong>{accountName}</strong>
                    {account?.email && <span>{account.email}</span>}
                    {session?.expires_at && <span>Session expires {new Date(session.expires_at).toLocaleString()}</span>}
                  </div>
                  <button type="button" onClick={disconnectGoogleSession}>Disconnect session</button>
                </div>
              ) : (
                <>
                  <div className="google-sso-button" ref={googleButtonRef} />
                  {ssoState.phase === 'not_configured' && <button type="button" disabled>Connect Google SSO</button>}
                </>
              )}
              <p className={`sso-state ${ssoState.phase}`}>{ssoState.message}</p>
              <div className="cloud-session-status">
                <strong>Cloud session</strong>
                <span>{cloudSessionStatus}</span>
                <button type="button" onClick={refreshCloudSessionStatus}>Refresh account status</button>
              </div>
            </div>
            <div className="panel">
              <h2>Automatic migration</h2>
              <p>After SSO, legacy IndexedDB snapshots migrate automatically into D1 and R2.</p>
              <button onClick={runPreviewMigration}>Run migration preview</button>
              {migrationResult && <pre>{JSON.stringify(migrationResult, null, 2)}</pre>}
              <MigrationConflictReviewPanel conflicts={migrationConflicts} status={migrationConflictStatus} canWrite={canWrite} onRefresh={refreshMigrationConflicts} onResolve={resolveMigrationConflict} />
            </div>
            <SyncReplayReadinessPanel summary={syncReadinessSummary} status={syncReadinessStatus} canRead={hasCloudSession()} onRefresh={refreshSyncReplayReadiness} />
            <SyncReplayEnablementSimulationPanel simulation={syncEnablementSimulation} status={syncEnablementStatus} canRead={hasCloudSession()} onRefresh={refreshSyncReplayEnablementSimulation} />
            <SyncReplaySafetyPanel safety={syncReplaySafety} status={syncReplaySafetyStatus} canRead={hasCloudSession()} onRefresh={refreshSyncReplaySafety} />
            <SyncReplayDiagnosticsPanel outcomes={syncReplayOutcomes} detail={syncReplayDetail} status={syncReplayStatus} canRead={hasCloudSession()} onRefresh={refreshSyncReplayDiagnostics} onInspect={inspectSyncReplayOutcome} />
            <SyncConflictDiagnosticsPanel conflicts={syncConflictRecords} detail={syncConflictDetail} status={syncConflictStatus} canRead={hasCloudSession()} canResolve={online && hasCloudSession()} onRefresh={refreshSyncConflictDiagnostics} onInspect={inspectSyncConflict} onResolve={resolveSyncConflictAction} />
            <div className="panel preferences-panel">
              <h2>Preferences</h2>
              <form className="settings-form" onSubmit={saveSettings}>
                <label>
                  <span>Default duration</span>
                  <input type="number" min="5" step="5" value={settingsDraft.default_task_duration} onChange={event => setSettingsDraft(current => ({ ...current, default_task_duration: event.target.value }))} disabled={!canWrite} />
                </label>
                <label>
                  <span>Default priority</span>
                  <select value={settingsDraft.default_task_priority} onChange={event => setSettingsDraft(current => ({ ...current, default_task_priority: event.target.value }))} disabled={!canWrite}>
                    <option value="urgent">Urgent</option>
                    <option value="important">Important</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={Boolean(settingsDraft.reminders_enabled)} onChange={event => setSettingsDraft(current => ({ ...current, reminders_enabled: event.target.checked }))} disabled={!canWrite} />
                  <span>Enable reminders</span>
                </label>
                <button type="submit" disabled={!canWrite}>Save settings</button>
              </form>
            </div>
            <div className="panel structure-panel">
              <h2>Structure</h2>
              <div className="task-toolbar">
                <input value={structureSearch} onChange={event => setStructureSearch(event.target.value)} placeholder="Search buckets and containers" />
                <button type="button" onClick={refreshStructure}>Refresh</button>
              </div>
              <form className="compact-form plan-form" onSubmit={addPlan}>
                <input value={planDraft.name} onChange={event => setPlanDraft(current => ({ ...current, name: event.target.value }))} placeholder="Plan name" disabled={!canWrite} />
                <input type="color" value={planDraft.color} onChange={event => setPlanDraft(current => ({ ...current, color: event.target.value }))} disabled={!canWrite} />
                <input value={planDraft.icon_char} onChange={event => setPlanDraft(current => ({ ...current, icon_char: event.target.value.slice(0, 2) }))} placeholder="Icon" disabled={!canWrite} />
                <button type="submit" disabled={!canWrite}>Add plan</button>
              </form>
              <div className="structure-list">
                <h3>Plans</h3>
                {plans.map(plan => (
                  <article className="structure-row" key={plan.id}>
                    <span className="swatch" style={{ backgroundColor: plan.color || '#cbd7e4' }} />
                    <div>
                      <strong>{plan.name}</strong>
                      <span>{plan.subject || plan.icon_char || 'plan'}</span>
                    </div>
                    <button type="button" disabled={!canWrite} title="Delete plan" onClick={() => deletePlan(plan)}><Trash2 size={15} /></button>
                  </article>
                ))}
              </div>
              <form className="compact-form" onSubmit={addBucket}>
                <input value={bucketDraft.name} onChange={event => setBucketDraft(current => ({ ...current, name: event.target.value }))} placeholder="Bucket name" disabled={!canWrite} />
                <input type="color" value={bucketDraft.color} onChange={event => setBucketDraft(current => ({ ...current, color: event.target.value }))} disabled={!canWrite} />
                <button type="submit" disabled={!canWrite}>Add bucket</button>
              </form>
              <div className="structure-list">
                <h3>Buckets</h3>
                {buckets.map(bucket => (
                  <article className="structure-row" key={bucket.id}>
                    <span className="swatch" style={{ backgroundColor: bucket.color || '#cbd7e4' }} />
                    <strong>{bucket.name}</strong>
                    <button type="button" disabled={!canWrite} title="Delete bucket" onClick={() => deleteBucket(bucket)}><Trash2 size={15} /></button>
                  </article>
                ))}
              </div>
              <form className="compact-form" onSubmit={addLabel}>
                <input value={labelDraft.name} onChange={event => setLabelDraft(current => ({ ...current, name: event.target.value }))} placeholder="Label name" disabled={!canWrite} />
                <input type="color" value={labelDraft.color} onChange={event => setLabelDraft(current => ({ ...current, color: event.target.value }))} disabled={!canWrite} />
                <button type="submit" disabled={!canWrite}>Add label</button>
              </form>
              <div className="structure-list">
                <h3>Labels</h3>
                {labels.map(label => (
                  <article className="structure-row" key={label.id}>
                    <span className="swatch" style={{ backgroundColor: label.color || '#cbd7e4' }} />
                    <strong>{label.name}</strong>
                    <button type="button" disabled={!canWrite} title="Delete label" onClick={() => deleteLabel(label)}><Trash2 size={15} /></button>
                  </article>
                ))}
              </div>
              <form className="compact-form container-form" onSubmit={addContainer}>
                <input value={containerDraft.name} onChange={event => setContainerDraft(current => ({ ...current, name: event.target.value }))} placeholder="Container name" disabled={!canWrite} />
                <input type="time" value={containerDraft.time_start} onChange={event => setContainerDraft(current => ({ ...current, time_start: event.target.value }))} disabled={!canWrite} />
                <input type="time" value={containerDraft.time_end} onChange={event => setContainerDraft(current => ({ ...current, time_end: event.target.value }))} disabled={!canWrite} />
                <select value={containerDraft.repeat} onChange={event => setContainerDraft(current => ({ ...current, repeat: event.target.value }))} disabled={!canWrite}>
                  <option value="weekday">Weekday</option>
                  <option value="weekend">Weekend</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
                <button type="submit" disabled={!canWrite}>Add container</button>
              </form>
              <div className="structure-list">
                <h3>Containers</h3>
                {containers.map(container => (
                  <article className="structure-row" key={container.id}>
                    <CalendarDays size={15} />
                    <div>
                      <strong>{container.name}</strong>
                      <span>{formatContainerMeta(container)}</span>
                    </div>
                    <button type="button" disabled={!canWrite} title="Delete container" onClick={() => deleteContainer(container)}><Trash2 size={15} /></button>
                  </article>
                ))}
              </div>
            </div>
            <div className="panel">
              <h2>Data authority</h2>
              <p><Database size={16} /> Cloud D1 is canonical. IndexedDB is local read cache and migration source.</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function TaskDetailPanel({ task, plans, buckets, labels, canWrite, onSave, onClose }) {
  const [form, setForm] = useState(null);
  const isManageBac = isManageBacSourceTask(task);

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

function CalendarProjectionPanel({ projection, compact = false, onSelectTask }) {
  return (
    <div className={`panel calendar-projection ${compact ? 'compact' : ''}`}>
      <h2>{compact ? 'Today date projection' : `Date projection ${projection.date}`}</h2>
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
          </div>
          <pre>{JSON.stringify({
            state: readiness.state,
            can_enable_replay: readiness.can_enable_replay,
            blocked_reasons: readiness.blocked_reasons,
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

function CalendarEventList({ events, canWrite, onDelete }) {
  return (
    <div className="calendar-list">
      <h2>Calendar events</h2>
      {events.length === 0 && <p>No calendar events match this view.</p>}
      {events.map(event => (
        <article className="event-row" key={event.id}>
          <CalendarDays size={18} />
          <div>
            <strong>{event.title}</strong>
            <span>{formatEventMeta(event)}</span>
          </div>
          <button type="button" disabled={!canWrite} title="Delete event" onClick={() => onDelete(event)}><Trash2 size={16} /></button>
        </article>
      ))}
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
        return (
          <article className={`task-row ${completed ? 'completed' : ''}`} key={task.id}>
            {completed ? <CheckCircle2 size={18} className="done" /> : <Circle size={18} />}
            <div className="task-main" role="button" tabIndex={0} onClick={() => onSelect?.(task)} onKeyDown={event => { if (event.key === 'Enter') onSelect?.(task); }}>
              <strong>{task.title}</strong>
              <span>{formatTaskMeta(task)}</span>
              {task.__sync_status === 'pending' && <em className="pending-sync-badge">Pending sync</em>}
              {(task.notes || task.description) && <p>{task.notes || task.description}</p>}
            </div>
            <div className="task-actions">
              {completed ? (
                <button type="button" disabled={!canWrite} title="Reopen task" onClick={() => onPatch(task, { progress: 'not_started', completed_at: null })}><RotateCcw size={16} /></button>
              ) : (
                <button type="button" disabled={!canWrite} title="Complete task" onClick={() => onPatch(task, { progress: 'completed' })}><CheckCircle2 size={16} /></button>
              )}
              <button type="button" disabled={!canDelete} title={canDelete ? 'Delete task' : 'Delete requires reconnect'} onClick={() => onDelete(task)}><Trash2 size={16} /></button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
