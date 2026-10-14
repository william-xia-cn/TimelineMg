import { apiClient } from '../api/client.js';
import { createTaskRepository } from '../repositories/taskRepository.js';
import { createCalendarRepository } from '../repositories/calendarRepository.js';
import { createStructureRepository } from '../repositories/structureRepository.js';
import { createSettingsRepository } from '../repositories/settingsRepository.js';
import { createMigrationRepository } from '../repositories/migrationRepository.js';
import {
  buildExtensionBackupSnapshot,
  parseExtensionBackupFile,
  summarizeExtensionBackup
} from '../migration/legacyIndexedDbSnapshotAdapter.js';

const LOCAL_RUNTIME_KEY = 'timewhere.web.legacy.runtime.v032';
const DEFAULT_SETTINGS = {
  theme: 'light',
  start_week_on: 1,
  pomodoro_work: 25,
  default_duration: 45,
  default_priority: 'medium',
  notification_enabled: true,
  appearance_background: 'calm',
  appearance_avatar: 'default'
};

function hasSession() {
  return Boolean(apiClient.getSession()?.token);
}

function readLocalRuntime() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_RUNTIME_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeLocalRuntime(patch) {
  const next = { ...readLocalRuntime(), ...patch };
  localStorage.setItem(LOCAL_RUNTIME_KEY, JSON.stringify(next));
  return next;
}

function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isCompleted(task) {
  return task?.progress === 'completed' || task?.status === 'completed' || Boolean(task?.completed_at);
}

function createDexieCollection(list, deleteItems) {
  return {
    async count() {
      return list().length;
    },
    filter(predicate) {
      return {
        async count() {
          return list().filter(predicate).length;
        },
        async delete() {
          const matches = list().filter(predicate);
          for (const item of matches) await deleteItems(item.id);
          return matches.length;
        }
      };
    }
  };
}

export function createLegacyCloudRuntime() {
  const isOnline = () => navigator.onLine;
  const taskRepository = createTaskRepository(apiClient, { isOnline });
  const calendarRepository = createCalendarRepository(apiClient, { isOnline });
  const structureRepository = createStructureRepository(apiClient, { isOnline });
  const settingsRepository = createSettingsRepository(apiClient, { isOnline });
  const migrationRepository = createMigrationRepository(apiClient);
  const runtimeInstanceId = crypto.randomUUID();
  const workspaceChannel = typeof BroadcastChannel === 'function'
    ? new BroadcastChannel('timewhere-cloud-workspace-v1')
    : null;

  workspaceChannel?.addEventListener('message', event => {
    if (event.data?.type !== 'workspace/replaced' || event.data?.source === runtimeInstanceId) return;
    refreshBootstrap()
      .then(() => location.reload())
      .catch(error => console.warn('[TimeWhere Cloud] replacement refresh failed:', error.message));
  });

  function broadcastWorkspaceReplacement(replacement) {
    workspaceChannel?.postMessage({
      type: 'workspace/replaced',
      source: runtimeInstanceId,
      replacement_id: replacement?.replacement_id || null,
      sync_cursor: replacement?.sync_cursor || null
    });
    window.dispatchEvent(new CustomEvent('timewhere-workspace-replaced', { detail: replacement }));
  }

  function snapshotCounts(snapshot) {
    const data = snapshot?.data || {};
    return {
      plans: Array.isArray(data.plans) ? data.plans.length : 0,
      buckets: Array.isArray(data.buckets) ? data.buckets.length : 0,
      labels: Array.isArray(data.labels) ? data.labels.length : 0,
      tasks: Array.isArray(data.tasks) ? data.tasks.length : 0,
      containers: Array.isArray(data.containers) ? data.containers.length : 0,
      events: Array.isArray(data.events) ? data.events.length : 0,
      settings: data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
        ? Object.keys(data.settings).length
        : 0
    };
  }

  function verifyExtensionImport(snapshot, migration) {
    const expected = snapshotCounts(snapshot);
    const counts = migration?.counts || {};
    const conflictKeys = {
      plans: 'plan_conflicts',
      buckets: 'bucket_conflicts',
      labels: 'label_conflicts',
      tasks: 'task_conflicts',
      containers: 'container_conflicts',
      events: 'event_conflicts',
      settings: 'setting_conflicts'
    };
    const handled = {};
    const missing = [];
    for (const [entity, expectedCount] of Object.entries(expected)) {
      const importedCount = Number(counts[entity] || 0);
      const conflictCount = Number(counts[conflictKeys[entity]] || 0);
      handled[entity] = { expected: expectedCount, imported: importedCount, conflicts: conflictCount };
      if (importedCount + conflictCount !== expectedCount) missing.push(entity);
    }
    if (missing.length) {
      const error = new Error(`Cloud 未确认完整导入：${missing.join(', ')}`);
      error.code = 'import_verification_failed';
      error.verification = { status: 'failed', expected, handled, missing };
      throw error;
    }
    return { status: 'verified', expected, handled, missing: [] };
  }

  async function prepareExtensionBackup(file) {
    const backup = await parseExtensionBackupFile(file);
    const summary = summarizeExtensionBackup(backup);
    const snapshot = await buildExtensionBackupSnapshot(backup);
    return { summary, snapshot };
  }

  async function commitExtensionBackup(prepared) {
    if (!hasSession()) throw new Error('请先使用 Google 登录 TimeWhere Cloud');
    if (!isOnline()) throw new Error('导入需要网络连接');
    const { summary, snapshot } = prepared || {};
    if (!summary || !snapshot) throw new Error('导入数据尚未完成校验');
    const migration = await migrationRepository.createMigrationRun(snapshot, 'extension_json_export_v1');
    const verification = verifyExtensionImport(snapshot, migration);
    await refreshBootstrap();
    return { migration, summary, verification };
  }

  async function importExtensionBackup(file) {
    return commitExtensionBackup(await prepareExtensionBackup(file));
  }

  async function previewExtensionReplacement(prepared) {
    if (!hasSession()) throw new Error('请先使用 Google 登录 TimeWhere Cloud');
    if (!isOnline()) throw new Error('覆盖预览需要网络连接');
    if (!prepared?.summary || !prepared?.snapshot) throw new Error('导入数据尚未完成校验');
    const replacement = await migrationRepository.previewReplacement(prepared.snapshot, 'extension_json_export_v1');
    return { replacement, summary: prepared.summary };
  }

  async function commitExtensionReplacement(prepared, replacementId, confirmation) {
    if (!hasSession()) throw new Error('请先使用 Google 登录 TimeWhere Cloud');
    const replacement = await migrationRepository.commitReplacement(replacementId, confirmation);
    await refreshBootstrap();
    broadcastWorkspaceReplacement(replacement);
    return { replacement, summary: prepared.summary };
  }

  async function listReplacementRuns() {
    if (!hasSession()) return [];
    return migrationRepository.listReplacements();
  }

  async function previewReplacementRollback(id) {
    if (!hasSession()) throw new Error('请先使用 Google 登录 TimeWhere Cloud');
    return migrationRepository.previewRollback(id);
  }

  async function commitReplacementRollback(id, confirmation) {
    if (!hasSession()) throw new Error('请先使用 Google 登录 TimeWhere Cloud');
    const replacement = await migrationRepository.commitRollback(id, confirmation);
    await refreshBootstrap();
    broadcastWorkspaceReplacement(replacement);
    return replacement;
  }

  async function getMigrationConflicts() {
    if (!hasSession()) return [];
    return migrationRepository.listConflicts('open');
  }

  async function resolveMigrationConflict(id, resolution) {
    const result = await migrationRepository.resolveConflict(id, resolution);
    await refreshBootstrap();
    return result;
  }

  async function refreshBootstrap() {
    if (!hasSession() || !isOnline()) return false;
    const bootstrap = await apiClient.getSyncBootstrap();
    const entities = bootstrap?.entities || {};
    taskRepository.hydrateCache(entities.tasks || []);
    calendarRepository.hydrateCache(entities.calendar_events || []);
    structureRepository.hydrateCache({
      plans: entities.plans || [],
      buckets: entities.buckets || [],
      labels: entities.labels || [],
      containers: entities.containers || []
    });
    settingsRepository.hydrateCache(entities.settings || {});
    localStorage.setItem('timewhere.web.sync.cursor.v1', String(bootstrap?.cursor || 0));
    window.dispatchEvent(new CustomEvent('timewhere-cloud-state', {
      detail: { status: 'connected', cursor: bootstrap?.cursor || 0, refreshed_at: new Date().toISOString() }
    }));
    return true;
  }

  async function pollWorkspaceReplacement() {
    if (!hasSession() || !isOnline()) return false;
    const cursor = Number(localStorage.getItem('timewhere.web.sync.cursor.v1') || 0);
    const feed = await apiClient.listSyncChanges({ cursor, limit: 100 });
    const replaced = (feed?.changes || []).some(change => change.entity_type === 'workspace' && change.operation === 'replaced');
    if (!replaced) return false;
    await refreshBootstrap();
    return true;
  }

  async function listTasks() {
    if (hasSession() && isOnline()) {
      try { return await taskRepository.listTasks({ includeCompleted: true }); } catch { /* cache fallback */ }
    }
    return taskRepository.getCachedTasks();
  }

  async function listEvents() {
    if (hasSession() && isOnline()) {
      try { return await calendarRepository.listEvents(); } catch { /* cache fallback */ }
    }
    return calendarRepository.getCachedEvents();
  }

  async function listStructure() {
    if (hasSession() && isOnline()) {
      try { return await structureRepository.listStructure(); } catch { /* cache fallback */ }
    }
    return structureRepository.getCachedStructure();
  }

  async function getSettings() {
    let settings = settingsRepository.getCachedSettings();
    if (hasSession() && isOnline()) {
      try { settings = await settingsRepository.getSettings(); } catch { /* cache fallback */ }
    }
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  async function updateSettings(patch) {
    if (!hasSession()) throw new Error('请先使用 Google 登录 TimeWhere Cloud');
    return settingsRepository.updateSettings(patch);
  }

  async function createSeries(task, recurrenceOptions = {}) {
    const count = Math.max(1, Number(recurrenceOptions.count || recurrenceOptions.occurrences || task.recurrence_count || 1));
    const seriesId = task.recurrence_series_id || `series_${crypto.randomUUID().replaceAll('-', '')}`;
    const created = [];
    for (let index = 0; index < count; index += 1) {
      created.push(await taskRepository.createTask({
        ...task,
        recurrence_series_id: seriesId,
        recurrence_index: index,
        recurrence_count: count,
        recurrence_frequency: recurrenceOptions.frequency || task.recurrence_frequency || 'weekly'
      }));
    }
    return created;
  }

  const db = {
    events: createDexieCollection(
      () => calendarRepository.getCachedEvents(),
      id => calendarRepository.deleteEvent(id)
    ),
    settings: {
      async clear() {
        await updateSettings(DEFAULT_SETTINGS);
      }
    }
  };

  const facade = {
    db,
    refreshBootstrap,
    async initDefaultSettings() {
      return getSettings();
    },
    getSettings,
    async getSetting(key) {
      return (await getSettings())[key];
    },
    async setSetting(key, value) {
      return updateSettings({ [key]: value });
    },
    async getAllTasks() {
      return listTasks();
    },
    async getTaskById(id) {
      return (await listTasks()).find(item => String(item.id) === String(id)) || null;
    },
    async getTasksByPlan(planId) {
      return taskRepository.getCachedTasks().filter(item => String(item.plan_id) === String(planId));
    },
    async addTask(task) {
      if (!hasSession()) throw new Error('请先使用 Google 登录 TimeWhere Cloud');
      return taskRepository.createTask(task);
    },
    async updateTask(id, patch) {
      if (!hasSession()) throw new Error('请先使用 Google 登录 TimeWhere Cloud');
      return taskRepository.updateTask(String(id), patch);
    },
    async deleteTask(id) {
      if (!hasSession()) throw new Error('请先使用 Google 登录 TimeWhere Cloud');
      return taskRepository.deleteTask(String(id));
    },
    async updateChecklist(id, checklist) {
      return facade.updateTask(id, { checklist });
    },
    addRecurringTaskSeries: createSeries,
    async createRecurringTaskSeriesFromTask(id, recurrenceOptions) {
      const task = await facade.getTaskById(id);
      if (!task) throw new Error('任务不存在');
      return createSeries({ ...task, id: undefined }, recurrenceOptions);
    },
    async resizeRecurringTaskSeries(id, newCount) {
      const task = await facade.getTaskById(id);
      if (!task) throw new Error('任务不存在');
      return createSeries({ ...task, id: undefined }, { count: newCount, frequency: task.recurrence_frequency });
    },
    async updateRecurringTaskScope(id, patch) {
      return facade.updateTask(id, patch);
    },
    async deleteRecurringTaskScope(id) {
      return facade.deleteTask(id);
    },
    isManageBacSourceTask(task) {
      return task?.source === 'managebac' || task?.source_type === 'managebac';
    },
    async getPlans() {
      return structureRepository.getCachedStructure().plans;
    },
    async getBucketsByPlan(planId) {
      return structureRepository.getCachedStructure().buckets.filter(item => String(item.plan_id) === String(planId));
    },
    async getLabelsByPlan(planId) {
      return structureRepository.getCachedStructure().labels.filter(item => !item.plan_id || String(item.plan_id) === String(planId));
    },
    async getContainers(options = {}) {
      const containers = structureRepository.getCachedStructure().containers;
      return options.enabled ? containers.filter(item => item.enabled !== false) : containers;
    },
    async getContainerById(id) {
      return (await facade.getContainers()).find(item => String(item.id) === String(id)) || null;
    },
    async addPlan(input) {
      return structureRepository.createPlan(input);
    },
    async updatePlan(id, patch) {
      return structureRepository.updatePlan(String(id), patch);
    },
    async deletePlan(id) {
      return structureRepository.deletePlan(String(id));
    },
    async reorderPlans(orderedIds) {
      const plans = await facade.getPlans();
      await Promise.all(orderedIds.map((id, index) => {
        const plan = plans.find(item => String(item.id) === String(id));
        return plan ? structureRepository.updatePlan(String(id), { order: index }) : null;
      }));
    },
    async ensureDefaultPlan() {
      const plans = await facade.getPlans();
      if (plans.length || !hasSession()) return plans[0] || null;
      return structureRepository.createPlan({ name: 'My Tasks', color: '#1d8cf8', order: 0 });
    },
    async addBucket(input) {
      return structureRepository.createBucket(input);
    },
    async updateBucket(id, patch) {
      return structureRepository.updateBucket(String(id), patch);
    },
    async deleteBucket(id) {
      return structureRepository.deleteBucket(String(id));
    },
    async ensureBucketTemplateForPlan(planId, names = []) {
      const buckets = await facade.getBucketsByPlan(planId);
      const existing = new Set(buckets.map(item => item.name));
      for (const name of names) {
        if (!existing.has(name)) await structureRepository.createBucket({ plan_id: planId, name });
      }
      return facade.getBucketsByPlan(planId);
    },
    async addLabel(input) {
      return structureRepository.createLabel(input);
    },
    async updateLabel(id, patch) {
      return structureRepository.updateLabel(String(id), patch);
    },
    async deleteLabel(id) {
      return structureRepository.deleteLabel(String(id));
    },
    async addContainer(input) {
      return structureRepository.createContainer(input);
    },
    async updateContainer(id, patch) {
      return structureRepository.updateContainer(String(id), patch);
    },
    async deleteContainer(id) {
      return structureRepository.deleteContainer(String(id));
    },
    async getEvents() {
      return listEvents();
    },
    async getEventsByDateRange(start, end) {
      return (await listEvents()).filter(event => {
        const date = event.date || event.start_date;
        return !date || (date >= start && date <= end);
      });
    },
    async getEventById(id) {
      return (await listEvents()).find(item => String(item.id) === String(id)) || null;
    },
    async addEvent(input) {
      return calendarRepository.createEvent(input);
    },
    async updateEvent(id, patch) {
      return calendarRepository.updateEvent(String(id), patch);
    },
    async deleteEvent(id) {
      return calendarRepository.deleteEvent(String(id));
    },
    async getHabits() {
      return [];
    },
    async completeHabit() {
      return null;
    },
    async listDailyJournals() {
      return Object.values(readLocalRuntime().journals || {});
    },
    async getDailyJournal(date) {
      return readLocalRuntime().journals?.[dateKey(date)] || null;
    },
    async buildDailyJournalDraft(date) {
      const key = dateKey(date);
      const tasks = (await listTasks()).filter(task => isCompleted(task) && String(task.completed_at || '').startsWith(key));
      return { date: key, completed_tasks: tasks, summary: '', status: 'draft' };
    },
    async ensureDailyJournalSnapshot(date) {
      return facade.getDailyJournal(date) || facade.buildDailyJournalDraft(date);
    },
    async saveDailyJournalDraft(date, data = {}) {
      const key = dateKey(date);
      const runtime = readLocalRuntime();
      const journal = { ...(runtime.journals?.[key] || {}), ...data, date: key, status: 'draft' };
      writeLocalRuntime({ journals: { ...(runtime.journals || {}), [key]: journal } });
      return journal;
    },
    async submitDailyJournal(date, data = {}) {
      const key = dateKey(date);
      const runtime = readLocalRuntime();
      const journal = { ...(runtime.journals?.[key] || {}), ...data, date: key, status: 'submitted', submitted_at: new Date().toISOString() };
      writeLocalRuntime({ journals: { ...(runtime.journals || {}), [key]: journal } });
      return journal;
    },
    async exportAllData() {
      return {
        tasks: await listTasks(),
        events: await listEvents(),
        ...(await listStructure()),
        settings: await getSettings()
      };
    },
    async importAllData() {
      throw new Error('WebDev 自动迁移入口位于 TimeWhere Cloud；不支持本地覆盖导入');
    }
  };

  return {
    facade,
    repositories: { taskRepository, calendarRepository, structureRepository, settingsRepository },
    refreshBootstrap,
    pollWorkspaceReplacement,
    prepareExtensionBackup,
    commitExtensionBackup,
    importExtensionBackup,
    previewExtensionReplacement,
    commitExtensionReplacement,
    listReplacementRuns,
    previewReplacementRollback,
    commitReplacementRollback,
    getMigrationConflicts,
    resolveMigrationConflict,
    hasSession,
    apiClient
  };
}
