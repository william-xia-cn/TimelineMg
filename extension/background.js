/**
 * TimeWhere Background Service Worker
 * 版本: v2.0
 * 日期: 2026-04-02
 */

importScripts('shared/js/scheduling.js', 'shared/js/reminders.js');

const TASK_REMINDER_ALARM = 'timewhere-task-reminder-tick';
const TASK_REMINDER_SENT_KEY = 'timewhere_task_reminder_sent';
const TASK_REMINDER_SESSION_KEY = 'timewhere_work_reminder_state_v1';
const TASK_REMINDER_NOTIFICATION_PREFIX = 'timewhere-work-reminder:';
const TASK_REMINDER_ALARM_PERIOD_MINUTES = 1;
const TASK_REMINDER_RENOTIFY_COOLDOWN_MS = 60 * 1000;
const TASK_REMINDER_EXECUTION_CHECK_MS = 30 * 60 * 1000;
const TASK_REMINDER_DEBUG_NOTIFICATIONS = false;
const TASK_REMINDER_DIAGNOSTIC_ALARM = 'timewhere-task-reminder-diagnostic';
const TASK_REMINDER_DIAGNOSTIC_DELAY_MINUTES = 0.5;
const TASK_REMINDER_DIAGNOSTIC_STATE_KEY = 'timewhere_task_reminder_diagnostic_state';
const TIMEWHERE_DB_VERSION = 5;
const DAILY_JOURNAL_SNAPSHOT_ALARM = 'timewhere-daily-journal-snapshot';
const DAILY_JOURNAL_COMPLETION_ALARM = 'timewhere-daily-journal-completion';
const DAILY_JOURNAL_PROMPT_ALARM = 'timewhere-daily-journal-prompt';
const DAILY_JOURNAL_SNAPSHOT_HOUR = 0;
const DAILY_JOURNAL_COMPLETION_HOUR = 0;
const DAILY_JOURNAL_COMPLETION_MINUTE = 5;
const DAILY_JOURNAL_PROMPT_HOUR = 21;
const DAILY_JOURNAL_PROMPT_MINUTE = 30;

chrome.runtime.onInstalled.addListener(async (details) => {
    await configureSidePanel();
    await bootstrapTaskReminders();
    await bootstrapDailyJournal();
    if (details.reason === 'install') {
        await initializeOnFirstInstall();
    }
});

chrome.runtime.onStartup.addListener(() => {
    configureSidePanel();
    bootstrapTaskReminders();
    bootstrapDailyJournal();
});

configureSidePanel();
bootstrapTaskReminders();
bootstrapDailyJournal();

async function configureSidePanel() {
    if (!chrome.sidePanel?.setPanelBehavior) return;
    try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (error) {
        console.warn('TimeWhere: side panel behavior setup skipped', error);
    }
}

async function initializeOnFirstInstall() {
    try {
        const response = await fetch(chrome.runtime.getURL('shared/js/db.js'));
        if (response.ok) {
            console.log('TimeWhere: Extension installed successfully');
        }
    } catch (e) {
        console.error('TimeWhere: Failed to initialize', e);
    }
}

async function ensureTaskReminderAlarm() {
    if (!chrome.alarms) return;
    await createAlarm(TASK_REMINDER_ALARM, {
        delayInMinutes: TASK_REMINDER_ALARM_PERIOD_MINUTES,
        periodInMinutes: TASK_REMINDER_ALARM_PERIOD_MINUTES
    });
    const alarm = await getAlarm(TASK_REMINDER_ALARM);
    if (!alarm) throw new Error('Task reminder alarm was not registered');
    return normalizeAlarm(alarm);
}

async function bootstrapTaskReminders() {
    try {
        await ensureTaskReminderAlarm();
        await runTaskReminderTick();
    } catch (error) {
        console.warn('TimeWhere: task reminder bootstrap skipped', error);
    }
}

async function bootstrapDailyJournal() {
    try {
        await ensureDailyJournalAlarms();
        await ensureTodayDailyJournalSnapshot();
        await ensurePreviousDailyJournalCompletionSnapshot();
    } catch (error) {
        console.warn('TimeWhere: daily journal bootstrap skipped', error);
    }
}

function readChromeLastError() {
    return chrome.runtime?.lastError?.message || '';
}

function createAlarm(name, alarmInfo) {
    return new Promise((resolve, reject) => {
        chrome.alarms.create(name, alarmInfo, () => {
            const error = readChromeLastError();
            if (error) reject(new Error(error));
            else resolve();
        });
    });
}

function getAlarm(name) {
    return new Promise((resolve, reject) => {
        chrome.alarms.get(name, alarm => {
            const error = readChromeLastError();
            if (error) reject(new Error(error));
            else resolve(alarm || null);
        });
    });
}

function getAllAlarms() {
    return new Promise((resolve, reject) => {
        chrome.alarms.getAll(alarms => {
            const error = readChromeLastError();
            if (error) reject(new Error(error));
            else resolve(alarms || []);
        });
    });
}

function nextDailyAlarmTime(hour, minute = 0, now = new Date()) {
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.getTime();
}

async function ensureDailyJournalAlarms() {
    if (!chrome.alarms) return {};
    await createAlarm(DAILY_JOURNAL_SNAPSHOT_ALARM, {
        when: nextDailyAlarmTime(DAILY_JOURNAL_SNAPSHOT_HOUR),
        periodInMinutes: 24 * 60
    });
    await createAlarm(DAILY_JOURNAL_COMPLETION_ALARM, {
        when: nextDailyAlarmTime(DAILY_JOURNAL_COMPLETION_HOUR, DAILY_JOURNAL_COMPLETION_MINUTE),
        periodInMinutes: 24 * 60
    });
    await createAlarm(DAILY_JOURNAL_PROMPT_ALARM, {
        when: nextDailyAlarmTime(DAILY_JOURNAL_PROMPT_HOUR, DAILY_JOURNAL_PROMPT_MINUTE),
        periodInMinutes: 24 * 60
    });
    return {
        snapshot: normalizeAlarm(await getAlarm(DAILY_JOURNAL_SNAPSHOT_ALARM)),
        completion: normalizeAlarm(await getAlarm(DAILY_JOURNAL_COMPLETION_ALARM)),
        prompt: normalizeAlarm(await getAlarm(DAILY_JOURNAL_PROMPT_ALARM))
    };
}

function normalizeAlarm(alarm) {
    if (!alarm) return null;
    return {
        name: alarm.name,
        scheduledTime: alarm.scheduledTime,
        periodInMinutes: alarm.periodInMinutes
    };
}

async function getTaskReminderStatus() {
    const alarm = chrome.alarms ? await getAlarm(TASK_REMINDER_ALARM) : null;
    const allAlarms = chrome.alarms ? await getAllAlarms() : [];
    const diagnostic = chrome.storage?.local
        ? (await chrome.storage.local.get(TASK_REMINDER_DIAGNOSTIC_STATE_KEY))[TASK_REMINDER_DIAGNOSTIC_STATE_KEY] || null
        : null;
    return {
        alarm: normalizeAlarm(alarm),
        alarms: allAlarms.map(normalizeAlarm),
        diagnostic,
        alarmName: TASK_REMINDER_ALARM,
        periodInMinutes: TASK_REMINDER_ALARM_PERIOD_MINUTES
    };
}

function openTimeWhereDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('TimeWhere', TIMEWHERE_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('daily_journals')) {
                const store = db.createObjectStore('daily_journals', { keyPath: 'date' });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('updated_at', 'updated_at', { unique: false });
                store.createIndex('submitted_at', 'submitted_at', { unique: false });
                store.createIndex('snapshot_at', 'snapshot_at', { unique: false });
            }
        };
        request.onerror = () => reject(request.error || new Error('Failed to open TimeWhere DB'));
        request.onsuccess = () => resolve(request.result);
    });
}

async function openExistingTimeWhereDB() {
    if (typeof indexedDB.databases === 'function') {
        const databases = await indexedDB.databases();
        if (!databases.some(database => database.name === 'TimeWhere')) return null;
    }
    try {
        return await openTimeWhereDB();
    } catch (error) {
        if (String(error?.name || error?.message || '').includes('Version')) {
            return await new Promise((resolve, reject) => {
                const request = indexedDB.open('TimeWhere');
                request.onerror = () => reject(request.error || new Error('Failed to open TimeWhere DB'));
                request.onsuccess = () => resolve(request.result);
            });
        }
        throw error;
    }
}

function getAllFromStore(db, storeName) {
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(storeName)) {
            resolve([]);
            return;
        }
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).getAll();
        request.onerror = () => reject(request.error || new Error(`Failed to read ${storeName}`));
        request.onsuccess = () => resolve(request.result || []);
    });
}

function getFromStore(db, storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db || !db.objectStoreNames.contains(storeName)) {
            resolve(null);
            return;
        }
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).get(key);
        request.onerror = () => reject(request.error || new Error(`Failed to read ${storeName}`));
        request.onsuccess = () => resolve(request.result || null);
    });
}

function putToStore(db, storeName, value) {
    return new Promise((resolve, reject) => {
        if (!db || !db.objectStoreNames.contains(storeName)) {
            resolve(false);
            return;
        }
        const tx = db.transaction(storeName, 'readwrite');
        const request = tx.objectStore(storeName).put(value);
        request.onerror = () => reject(request.error || new Error(`Failed to write ${storeName}`));
        request.onsuccess = () => resolve(true);
    });
}

async function readReminderData() {
    if (typeof indexedDB.databases === 'function') {
        const databases = await indexedDB.databases();
        if (!databases.some(database => database.name === 'TimeWhere')) {
            return { tasks: [], containers: [] };
        }
    }
    const db = await openExistingTimeWhereDB();
    if (!db) return { tasks: [], containers: [], settings: {} };
    try {
        const [tasks, containers, plans, settingsRows] = await Promise.all([
            getAllFromStore(db, 'tasks'),
            getAllFromStore(db, 'containers'),
            getAllFromStore(db, 'plans'),
            getAllFromStore(db, 'settings')
        ]);
        const planById = new Map((plans || []).map(plan => [plan.id, plan]));
        const enrichedTasks = (tasks || []).map(task => ({
            ...task,
            plan_name: planById.get(task.plan_id)?.name || task.plan_name || null
        }));
        const settings = Object.fromEntries((settingsRows || []).map(row => [row.key, row.value]));
        return { tasks: enrichedTasks, containers, settings };
    } finally {
        db.close();
    }
}

function createJournalTaskSnapshot(task) {
    const checklistBaseline = createJournalChecklistBaseline(task);
    return {
        id: task.id,
        title: task.title || '',
        plan_id: task.plan_id || null,
        bucket_id: task.bucket_id || null,
        subject: task.subject || null,
        start_date: task.start_date || null,
        due_date: task.due_date || task.deadline || null,
        progress: task.progress || task.status || 'not_started',
        priority: task.priority || 'medium',
        completed_at: task.completed_at || null,
        source: task.source || null,
        source_uid: task.source_uid || null,
        duration: task.duration || null,
        schedule_time: task.schedule_time || null,
        assignment: task.assignment ? {
            status: task.assignment.status || null,
            label: task.assignment.label || null,
            reason: task.assignment.reason || null,
            container_id: task.assignment.container_id || null,
            container_name: task.assignment.container_name || null,
            time_start: task.assignment.time_start || null,
            time_end: task.assignment.time_end || null
        } : null,
        ...checklistBaseline
    };
}

function normalizeJournalChecklistItem(item, index = 0) {
    return {
        id: String(item?.id ?? `index:${index}`),
        title: String(item?.title || item?.text || ''),
        checked: item?.checked === true,
        type: item?.type || null,
        partial_group_id: item?.partial_group_id || null,
        partial_role: item?.partial_role || null,
        partial_percent: Number.isFinite(Number(item?.partial_percent))
            ? Number(item.partial_percent)
            : null
    };
}

function createJournalChecklistBaseline(task = {}) {
    const items = Array.isArray(task.checklist)
        ? task.checklist.map((item, index) => normalizeJournalChecklistItem(item, index))
        : [];
    const checkedItems = items.filter(item => item.checked);
    const partialDone = items
        .filter(item => item.type === 'partial_completion' && item.partial_role === 'done')
        .map(item => item.partial_percent)
        .filter(value => value != null);
    const fingerprintItems = items.map(item => ({
        id: item.id,
        title: item.title,
        checked: item.checked,
        type: item.type,
        partial_group_id: item.partial_group_id,
        partial_role: item.partial_role,
        partial_percent: item.partial_percent
    }));
    return {
        checklist_total_count: items.length,
        checklist_checked_count: checkedItems.length,
        checklist_checked_ids: checkedItems.map(item => item.id).sort(),
        checklist_fingerprint: JSON.stringify(fingerprintItems),
        checklist_partial_percent: partialDone.length > 0 ? Math.max(...partialDone) : null
    };
}

function getLocalDateFromISO(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return formatDateISOFallback(date);
}

function getPreviousDateString(now = new Date()) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return formatDateISOFallback(date);
}

function hasChecklistProgressSinceSnapshot(snapshot = {}, currentTask = {}) {
    const current = createJournalChecklistBaseline(currentTask);
    const baselineChecked = Number(snapshot.checklist_checked_count || 0);
    const currentChecked = Number(current.checklist_checked_count || 0);
    const baselinePartial = snapshot.checklist_partial_percent != null && Number.isFinite(Number(snapshot.checklist_partial_percent))
        ? Number(snapshot.checklist_partial_percent)
        : null;
    const currentPartial = current.checklist_partial_percent != null && Number.isFinite(Number(current.checklist_partial_percent))
        ? Number(current.checklist_partial_percent)
        : null;
    return currentChecked > baselineChecked
        || (currentPartial != null && (baselinePartial == null || currentPartial > baselinePartial));
}

function getJournalTaskCompletionStatus(snapshot = {}, currentTask = null, journalDate = null) {
    const progress = currentTask?.progress || currentTask?.status || snapshot?.progress || 'not_started';
    const completedAt = currentTask?.completed_at || snapshot?.completed_at || null;
    const completedOnDate = journalDate ? getLocalDateFromISO(completedAt) === journalDate : !!completedAt;
    if (progress === 'completed' || completedOnDate) {
        return { status: 'completed', label: '完成' };
    }
    const partialPercent = snapshot?.checklist_partial_percent != null && Number.isFinite(Number(snapshot.checklist_partial_percent))
        ? Number(snapshot.checklist_partial_percent)
        : null;
    const checkedCount = Number.isFinite(Number(snapshot?.checklist_checked_count))
        ? Number(snapshot.checklist_checked_count)
        : 0;
    if (hasChecklistProgressSinceSnapshot(snapshot, currentTask || snapshot)
        || (partialPercent != null && partialPercent > 0)
        || checkedCount > 0) {
        return { status: 'partial', label: '部分完成' };
    }
    return { status: 'incomplete', label: '未完成' };
}

function withJournalTaskCompletionStatus(snapshot, currentTask = null, journalDate = null) {
    const completion = getJournalTaskCompletionStatus(snapshot, currentTask, journalDate);
    return {
        ...snapshot,
        journal_status: completion.status,
        journal_status_label: completion.label
    };
}

function buildDailyJournalPoolSnapshot(tasks, date, now) {
    return (tasks || [])
        .filter(task => task.progress !== 'completed')
        .filter(task => task.start_date == null || task.start_date <= date)
        .filter(task => task.deferred_until == null || new Date(task.deferred_until) <= now)
        .map(createJournalTaskSnapshot);
}

function getDailyJournalContainersForDate(containers = [], date) {
    const scheduling = globalThis.TimeWhereScheduling;
    if (!scheduling?.containerAppliesToDate) return [];
    const dateObj = new Date(`${date}T00:00:00`);
    const dow = dateObj.getDay();
    const isWeekday = dow >= 1 && dow <= 5;
    const isWeekend = dow === 0 || dow === 6;
    return (containers || [])
        .filter(container => container?.enabled !== false)
        .filter(container => scheduling.containerAppliesToDate(container, dateObj, date, dow, isWeekday, isWeekend));
}

function buildDailyJournalSettleSnapshot(tasks, containers, date, now) {
    const scheduling = globalThis.TimeWhereScheduling;
    if (!scheduling?.buildDailyTaskPool || !scheduling?.dailySettle) {
        return buildDailyJournalPoolSnapshot(tasks, date, now);
    }
    const taskPool = scheduling.buildDailyTaskPool(tasks || [], now);
    const todayContainers = getDailyJournalContainersForDate(containers || [], date);
    const settle = scheduling.dailySettle(taskPool, todayContainers, now);
    const displayTasks = settle?.displayTasks || settle?.currentTasks || taskPool;
    return displayTasks.map(createJournalTaskSnapshot);
}

function buildDailyJournalExtraTaskSnapshots(tasks, plannedIds, snapshotAt) {
    const snapshotTime = snapshotAt ? new Date(snapshotAt).getTime() : null;
    if (!Number.isFinite(snapshotTime)) return [];
    return (tasks || [])
        .filter(task => !plannedIds.has(String(task.id)))
        .filter(task => {
            const createdTime = new Date(task.created_at || task.createdAt || 0).getTime();
            return Number.isFinite(createdTime) && createdTime > snapshotTime;
        })
        .map(createJournalTaskSnapshot);
}

function buildDailyJournalCompletionSnapshots(journal, tasks, journalDate) {
    const taskById = new Map((tasks || []).map(task => [String(task.id), task]));
    const plannedSnapshots = Array.isArray(journal?.planned_task_snapshots) ? journal.planned_task_snapshots : [];
    const plannedIds = new Set(plannedSnapshots.map(task => String(task.id)));
    return {
        completion_task_snapshots: plannedSnapshots.map(snapshot =>
            withJournalTaskCompletionStatus(snapshot, taskById.get(String(snapshot.id)) || null, journalDate)
        ),
        completion_extra_task_snapshots: buildDailyJournalExtraTaskSnapshots(tasks, plannedIds, journal?.snapshot_at)
            .map(snapshot => withJournalTaskCompletionStatus(snapshot, taskById.get(String(snapshot.id)) || null, journalDate))
    };
}

async function ensureTodayDailyJournalSnapshot(now = new Date()) {
    const date = formatDateISOFallback(now);
    const db = await openExistingTimeWhereDB();
    if (!db) return { status: 'no_db' };
    try {
        const existing = await getFromStore(db, 'daily_journals', date);
        if (existing?.snapshot_at && Array.isArray(existing.planned_task_snapshots)) {
            return { status: 'exists', journal: existing };
        }
        const [tasks, containers] = await Promise.all([
            getAllFromStore(db, 'tasks'),
            getAllFromStore(db, 'containers')
        ]);
        const nowISO = now.toISOString();
        const planned = buildDailyJournalSettleSnapshot(tasks, containers, date, now);
        const journal = {
            ...(existing || {}),
            date,
            status: existing?.status || 'snapshot',
            planned_task_snapshots: planned,
            daily_pool_snapshots: buildDailyJournalPoolSnapshot(tasks, date, now),
            completed_task_snapshots: existing?.completed_task_snapshots || [],
            delayed_task_snapshots: existing?.delayed_task_snapshots || [],
            extra_done_task_snapshots: existing?.extra_done_task_snapshots || [],
            planned_notes: existing?.planned_notes || '',
            delayed_notes: existing?.delayed_notes || '',
            extra_done_notes: existing?.extra_done_notes || '',
            general_notes: existing?.general_notes || '',
            snapshot_at: nowISO,
            created_at: existing?.created_at || nowISO,
            updated_at: nowISO,
            submitted_at: existing?.submitted_at || null
        };
        await putToStore(db, 'daily_journals', journal);
        return { status: 'created', journal };
    } finally {
        db.close();
    }
}

async function ensureDailyJournalCompletionSnapshot(date, now = new Date()) {
    const db = await openExistingTimeWhereDB();
    if (!db) return { status: 'no_db' };
    try {
        let journal = await getFromStore(db, 'daily_journals', date);
        if (journal?.completion_snapshot_at && Array.isArray(journal.completion_task_snapshots)) {
            return { status: 'exists', journal };
        }

        const [tasks, containers] = await Promise.all([
            getAllFromStore(db, 'tasks'),
            getAllFromStore(db, 'containers')
        ]);
        if (!journal?.snapshot_at || !Array.isArray(journal.planned_task_snapshots)) {
            const dayEnd = new Date(`${date}T23:59:00`);
            const dayEndISO = dayEnd.toISOString();
            journal = {
                ...(journal || {}),
                date,
                status: journal?.status || 'snapshot',
                planned_task_snapshots: buildDailyJournalSettleSnapshot(tasks, containers, date, dayEnd),
                daily_pool_snapshots: buildDailyJournalPoolSnapshot(tasks, date, dayEnd),
                completed_task_snapshots: journal?.completed_task_snapshots || [],
                delayed_task_snapshots: journal?.delayed_task_snapshots || [],
                extra_done_task_snapshots: journal?.extra_done_task_snapshots || [],
                planned_notes: journal?.planned_notes || '',
                delayed_notes: journal?.delayed_notes || '',
                extra_done_notes: journal?.extra_done_notes || '',
                general_notes: journal?.general_notes || '',
                snapshot_at: dayEndISO,
                created_at: journal?.created_at || dayEndISO,
                updated_at: dayEndISO,
                submitted_at: journal?.submitted_at || null
            };
        }

        const completion = buildDailyJournalCompletionSnapshots(journal, tasks, date);
        const updated = {
            ...journal,
            ...completion,
            completion_snapshot_at: now.toISOString(),
            updated_at: now.toISOString()
        };
        await putToStore(db, 'daily_journals', updated);
        return { status: 'created', journal: updated };
    } finally {
        db.close();
    }
}

async function ensurePreviousDailyJournalCompletionSnapshot(now = new Date()) {
    return ensureDailyJournalCompletionSnapshot(getPreviousDateString(now), now);
}

async function createDailyJournalPromptNotification(now = new Date()) {
    if (!chrome.notifications) return { sent: false, reason: 'notifications_unavailable' };
    const date = formatDateISOFallback(now);
    const db = await openExistingTimeWhereDB();
    if (!db) return { sent: false, reason: 'no_db' };
    try {
        const settingsRows = await getAllFromStore(db, 'settings');
        const settings = Object.fromEntries((settingsRows || []).map(row => [row.key, row.value]));
        if (settings?.notification_enabled === false) return { sent: false, reason: 'disabled' };
        const journal = await getFromStore(db, 'daily_journals', date);
        if (journal?.status === 'submitted') return { sent: false, reason: 'submitted' };
        const payload = {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            priority: 1,
            requireInteraction: true,
            title: 'TimeWhere 今日总结',
            message: '整理今天计划完成、实际完成和延误说明。'
        };
        await chrome.notifications.create(`timewhere-daily-journal:${date}`, payload);
        return { sent: true, date };
    } finally {
        db.close();
    }
}

function getTodayContainers(containers, now) {
    const S = globalThis.TimeWhereScheduling;
    const todayStr = S.formatDateISO ? S.formatDateISO(now) : formatDateISOFallback(now);
    const dateObj = new Date(`${todayStr}T00:00:00`);
    const dow = dateObj.getDay();
    const isWeekday = dow >= 1 && dow <= 5;
    const isWeekend = dow === 0 || dow === 6;
    return (containers || [])
        .filter(container => container.enabled !== false)
        .filter(container => S.containerAppliesToDate(container, dateObj, todayStr, dow, isWeekday, isWeekend));
}

function formatDateISOFallback(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function getReminderSentState() {
    const result = await chrome.storage.local.get(TASK_REMINDER_SENT_KEY);
    return result[TASK_REMINDER_SENT_KEY] || {};
}

async function saveReminderSentState(sentState, now) {
    const todayPrefix = formatDateISOFallback(now);
    const compact = {};
    for (const [key, value] of Object.entries(sentState || {})) {
        if (String(key).includes(todayPrefix)) compact[key] = value;
    }
    await chrome.storage.local.set({ [TASK_REMINDER_SENT_KEY]: compact });
}

function cloneReminderValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createReminderSessionId(now = new Date()) {
    return `chrome-work-reminder:${now.getTime()}:${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeWorkReminderState(value = {}) {
    const state = value && typeof value === 'object' ? cloneReminderValue(value) : {};
    return {
        schema: TASK_REMINDER_SESSION_KEY,
        session_id: state.session_id || null,
        status: state.status || 'idle',
        due_key: state.due_key || null,
        bucket: state.bucket || null,
        phase: state.phase || null,
        created_at: state.created_at || null,
        last_notified_at: state.last_notified_at || null,
        notification_closed_at: state.notification_closed_at || null,
        handled_at: state.handled_at || null,
        execution_check_at: state.execution_check_at || null,
        task_ids: Array.isArray(state.task_ids) ? state.task_ids.map(id => String(id)) : [],
        items: Array.isArray(state.items) ? state.items : [],
        total_count: Number(state.total_count) || 0,
        cooldown_until: state.cooldown_until || null,
        stopped_at: state.stopped_at || null,
        stop_reason: state.stop_reason || null
    };
}

async function getWorkReminderState() {
    const result = await chrome.storage.local.get(TASK_REMINDER_SESSION_KEY);
    return normalizeWorkReminderState(result[TASK_REMINDER_SESSION_KEY]);
}

async function saveWorkReminderState(state) {
    const normalized = normalizeWorkReminderState(state);
    await chrome.storage.local.set({ [TASK_REMINDER_SESSION_KEY]: normalized });
    return normalized;
}

function buildIdleWorkReminderState(now = new Date(), reason = 'no_due_work') {
    return {
        schema: TASK_REMINDER_SESSION_KEY,
        status: 'idle',
        session_id: null,
        due_key: null,
        bucket: null,
        phase: null,
        created_at: null,
        last_notified_at: null,
        notification_closed_at: null,
        handled_at: null,
        execution_check_at: null,
        task_ids: [],
        items: [],
        total_count: 0,
        cooldown_until: null,
        stopped_at: null,
        stop_reason: reason,
        updated_at: now.toISOString()
    };
}

function buildVisibleWorkReminderState(previousState, reminder, now = new Date(), phase = 'due') {
    const previous = normalizeWorkReminderState(previousState);
    const taskIds = (reminder.task_ids || [])
        .map(id => String(id))
        .filter(Boolean);
    return {
        ...previous,
        schema: TASK_REMINDER_SESSION_KEY,
        session_id: previous.session_id || createReminderSessionId(now),
        status: 'notification_visible',
        due_key: reminder.key || null,
        bucket: reminder.bucket || null,
        phase,
        created_at: previous.created_at || now.toISOString(),
        last_notified_at: now.toISOString(),
        notification_closed_at: null,
        handled_at: null,
        execution_check_at: null,
        task_ids: taskIds,
        items: Array.isArray(reminder.items) ? reminder.items : [],
        total_count: Number(reminder.total_count) || taskIds.length || 1,
        cooldown_until: null,
        stopped_at: null,
        stop_reason: null,
        updated_at: now.toISOString()
    };
}

function parseReminderTime(value) {
    if (!value) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
}

function getTaskIdsSignature(taskIds = []) {
    return (taskIds || [])
        .map(id => String(id))
        .filter(Boolean)
        .sort()
        .join('|');
}

function isSameWorkReminderSession(state, reminder) {
    return state?.due_key
        && reminder?.key
        && String(state.due_key) === String(reminder.key)
        && getTaskIdsSignature(state.task_ids) === getTaskIdsSignature(reminder.task_ids);
}

function createWorkReminderNotificationId(reminder = {}) {
    return `${TASK_REMINDER_NOTIFICATION_PREFIX}${reminder.key || Date.now()}`;
}

function getWorkReminderKeyFromNotificationId(notificationId = '') {
    return String(notificationId || '').startsWith(TASK_REMINDER_NOTIFICATION_PREFIX)
        ? String(notificationId).slice(TASK_REMINDER_NOTIFICATION_PREFIX.length)
        : '';
}

async function createTaskReminderNotification(reminder) {
    const payload = globalThis.TimeWhereReminders.buildReminderNotificationPayload(reminder);
    if (payload.iconUrl && !/^https?:|^chrome-extension:/i.test(payload.iconUrl)) {
        payload.iconUrl = chrome.runtime.getURL(payload.iconUrl);
    }
    const notificationId = createWorkReminderNotificationId(reminder);
    await chrome.notifications.create(notificationId, payload);
    return notificationId;
}

function formatClockTime(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function createTaskReminderDebugNotification(now, reminders, reason = '') {
    if (!TASK_REMINDER_DEBUG_NOTIFICATIONS || !chrome.notifications) return;
    const checkedAt = formatClockTime(now);
    const payload = {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        priority: 1,
        requireInteraction: true,
        title: reminders.length
            ? `TimeWhere 检查：命中 ${reminders.length} 个任务`
            : 'TimeWhere 检查：没有任务提醒',
        message: reminders.length
            ? `${checkedAt} · ${reminders.slice(0, 5).map(reminder => `${reminder.type}：${reminder.task?.title || '无标题任务'}`).join('；')}`
            : `${checkedAt} · ${reason || 'alarm 已触发，但没有符合当前提醒规则的任务。请检查任务是否未完成、start_date 是否为今天或更早、schedule_time 是否在当前提醒窗口。'}`
    };
    await chrome.notifications.create(`timewhere-debug-reminder:${Date.now()}`, payload);
}

async function createTaskReminderAlarmEventNotification(alarm) {
    if (!chrome.notifications) return;
    const payload = {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        priority: 2,
        requireInteraction: true,
        title: 'TimeWhere 诊断：alarm 事件已触发',
        message: `${formatClockTime(new Date())} · ${alarm?.name || 'unknown alarm'}`
    };
    await chrome.notifications.create(`timewhere-alarm-event:${Date.now()}`, payload);
}

async function createDiagnosticAlarm() {
    await createAlarm(TASK_REMINDER_DIAGNOSTIC_ALARM, {
        delayInMinutes: TASK_REMINDER_DIAGNOSTIC_DELAY_MINUTES
    });
    const alarm = normalizeAlarm(await getAlarm(TASK_REMINDER_DIAGNOSTIC_ALARM));
    if (chrome.storage?.local) {
        await chrome.storage.local.set({
            [TASK_REMINDER_DIAGNOSTIC_STATE_KEY]: {
                status: 'scheduled',
                scheduledTime: alarm?.scheduledTime || null,
                scheduledAt: new Date().toISOString()
            }
        });
    }
    return alarm;
}

async function createTaskReminderTestNotification() {
    const alarm = await ensureTaskReminderAlarm();
    const diagnosticAlarm = await createDiagnosticAlarm();
    const payload = {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: '当前任务提醒：测试提醒',
        message: '系统通知测试 · TimeWhere · 点击打开 Dashboard',
        priority: 2,
        requireInteraction: true
    };
    await chrome.notifications.create(`timewhere-test-reminder:${Date.now()}`, payload);
    return { alarm, diagnosticAlarm };
}

async function handleWorkReminderNotificationClick(notificationId) {
    const key = getWorkReminderKeyFromNotificationId(notificationId);
    if (!key) return { status: 'ignored' };
    const now = new Date();
    const state = await getWorkReminderState();
    const next = {
        ...state,
        schema: TASK_REMINDER_SESSION_KEY,
        session_id: state.session_id || createReminderSessionId(now),
        status: 'execution_check_waiting',
        due_key: state.due_key || key,
        phase: 'execution_check_waiting',
        created_at: state.created_at || now.toISOString(),
        handled_at: now.toISOString(),
        execution_check_at: new Date(now.getTime() + TASK_REMINDER_EXECUTION_CHECK_MS).toISOString(),
        notification_closed_at: null,
        cooldown_until: null,
        updated_at: now.toISOString()
    };
    await saveWorkReminderState(next);
    return { status: 'handled', key: next.due_key, execution_check_at: next.execution_check_at };
}

async function handleWorkReminderNotificationClosed(notificationId, byUser) {
    const key = getWorkReminderKeyFromNotificationId(notificationId);
    if (!key || byUser !== true) return { status: 'ignored' };
    const now = new Date();
    const state = await getWorkReminderState();
    if (state.status !== 'notification_visible') return { status: 'ignored', reason: 'not_visible' };
    if (state.due_key && String(state.due_key) !== String(key)) {
        return { status: 'ignored', reason: 'stale_notification' };
    }
    const next = {
        ...state,
        status: 'renotify_waiting',
        notification_closed_at: now.toISOString(),
        cooldown_until: new Date(now.getTime() + TASK_REMINDER_RENOTIFY_COOLDOWN_MS).toISOString(),
        updated_at: now.toISOString()
    };
    await saveWorkReminderState(next);
    return { status: 'closed', key: state.due_key, cooldown_until: next.cooldown_until };
}

async function stopCurrentWorkReminder() {
    const now = new Date();
    const state = await getWorkReminderState();
    if (!state.session_id && state.status === 'idle') {
        return { status: 'no_active_reminder', state };
    }
    const next = {
        ...state,
        status: 'stopped',
        phase: 'stopped',
        stopped_at: now.toISOString(),
        stop_reason: 'user_stopped',
        notification_closed_at: null,
        cooldown_until: null,
        updated_at: now.toISOString()
    };
    await saveWorkReminderState(next);
    return { status: 'stopped', state: next };
}

async function runTaskReminderTick(now = new Date()) {
    if (!chrome.notifications || !chrome.storage?.local) return { sent: 0, skipped: true };
    const { tasks, containers, settings } = await readReminderData();
    if (settings?.notification_enabled === false) {
        await createTaskReminderDebugNotification(now, [], '系统任务提醒已关闭');
        return { sent: 0, skipped: true, reason: 'disabled' };
    }
    const todayContainers = getTodayContainers(containers, now);
    const aggregatedReminder = globalThis.TimeWhereReminders.computeAggregatedReminder(
        tasks,
        todayContainers,
        now,
        globalThis.TimeWhereScheduling,
        {}
    );
    const state = await getWorkReminderState();

    if (!aggregatedReminder) {
        if (state.status !== 'idle') {
            await saveWorkReminderState(buildIdleWorkReminderState(now));
        }
        await createTaskReminderDebugNotification(now, [], '没有符合当前提醒规则的工作');
        return { sent: 0 };
    }

    let shouldNotify = false;
    let phase = 'due';
    if (state.status === 'notification_visible') {
        await createTaskReminderDebugNotification(now, [], '当前工作提醒通知仍在显示');
        return { sent: 0, state: 'notification_visible' };
    }
    if (state.status === 'renotify_waiting') {
        const cooldownUntil = parseReminderTime(state.cooldown_until);
        if (cooldownUntil && now.getTime() < cooldownUntil) {
            await createTaskReminderDebugNotification(now, [], '工作提醒关闭后等待冷却');
            return { sent: 0, state: 'renotify_waiting' };
        }
        shouldNotify = true;
        phase = state.phase || 'due';
    } else if (state.status === 'execution_check_waiting') {
        const checkAt = parseReminderTime(state.execution_check_at);
        if (checkAt && now.getTime() < checkAt) {
            await createTaskReminderDebugNotification(now, [], '工作提醒已处理，等待执行检查');
            return { sent: 0, state: 'execution_check_waiting' };
        }
        shouldNotify = true;
        phase = 'execution_check';
    } else if (state.status === 'stopped' && isSameWorkReminderSession(state, aggregatedReminder)) {
        await createTaskReminderDebugNotification(now, [], '当前工作提醒已停止');
        return { sent: 0, state: 'stopped' };
    } else {
        shouldNotify = true;
    }

    if (!shouldNotify) return { sent: 0 };
    await createTaskReminderNotification(aggregatedReminder);
    await saveWorkReminderState(buildVisibleWorkReminderState(state, aggregatedReminder, now, phase));
    await createTaskReminderDebugNotification(now, [aggregatedReminder]);
    return { sent: 1, state: 'notification_visible' };
}

function isAllowedManageBacIcsUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        const host = url.hostname.toLowerCase();
        const isManageBacHost = host === 'managebac.com' ||
            host.endsWith('.managebac.com') ||
            host === 'managebac.cn' ||
            host.endsWith('.managebac.cn');
        return url.protocol === 'https:' &&
            isManageBacHost &&
            /\/student\/events\//i.test(url.pathname);
    } catch (_) {
        return false;
    }
}

async function fetchManageBacIcs(url) {
    if (!isAllowedManageBacIcsUrl(url)) {
        throw new Error('Unsupported ManageBac ICS subscription host or path');
    }
    let response;
    try {
        response = await fetch(url, { cache: 'no-store' });
    } catch (_) {
        throw new Error('无法读取 ManageBac ICS link，请检查链接是否有效、网络是否可访问。');
    }
    if (!response.ok) {
        throw new Error(`ICS request failed: HTTP ${response.status}`);
    }
    return await response.text();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'TIMEWHERE_MANAGEBAC_FETCH_ICS') {
        fetchManageBacIcs(message.url)
            .then(text => sendResponse({ ok: true, text }))
            .catch(error => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message?.type === 'TIMEWHERE_TASK_REMINDER_TEST') {
        createTaskReminderTestNotification()
            .then(status => sendResponse({ ok: true, ...status }))
            .catch(error => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message?.type === 'TIMEWHERE_TASK_REMINDER_ENSURE') {
        ensureTaskReminderAlarm()
            .then(alarm => sendResponse({ ok: true, alarm }))
            .catch(error => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message?.type === 'TIMEWHERE_TASK_REMINDER_STATUS') {
        getTaskReminderStatus()
            .then(status => sendResponse({ ok: true, ...status }))
            .catch(error => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message?.type === 'TIMEWHERE_WORK_REMINDER_STATE') {
        getWorkReminderState()
            .then(state => sendResponse({ ok: true, state }))
            .catch(error => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message?.type === 'TIMEWHERE_WORK_REMINDER_STOP') {
        stopCurrentWorkReminder()
            .then(result => sendResponse({ ok: true, ...result }))
            .catch(error => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message?.type === 'TIMEWHERE_DAILY_JOURNAL_ENSURE') {
        ensureDailyJournalAlarms()
            .then(status => sendResponse({ ok: true, ...status }))
            .catch(error => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message.action === 'getStatus') {
        sendResponse({ status: 'ok', timestamp: new Date().toISOString() });
    }

    if (message.action === 'openPage') {
        const page = message.page || 'focus';
        chrome.tabs.create({
            url: `pages/${page}/${page}.html`
        });
        sendResponse({ success: true });
    }
    
    return false;
});

chrome.alarms?.onAlarm.addListener(alarm => {
    if (alarm?.name === TASK_REMINDER_DIAGNOSTIC_ALARM) {
        chrome.storage?.local?.set({
            [TASK_REMINDER_DIAGNOSTIC_STATE_KEY]: {
                status: 'fired',
                alarmName: alarm.name,
                firedAt: new Date().toISOString()
            }
        });
        createTaskReminderAlarmEventNotification(alarm).catch(error => {
            console.error('TimeWhere: diagnostic alarm notification failed', error);
        });
        return;
    }
    if (alarm?.name === DAILY_JOURNAL_SNAPSHOT_ALARM) {
        ensureTodayDailyJournalSnapshot().catch(error => {
            console.error('TimeWhere: daily journal snapshot failed', error);
        });
        return;
    }
    if (alarm?.name === DAILY_JOURNAL_COMPLETION_ALARM) {
        ensurePreviousDailyJournalCompletionSnapshot().catch(error => {
            console.error('TimeWhere: daily journal completion snapshot failed', error);
        });
        return;
    }
    if (alarm?.name === DAILY_JOURNAL_PROMPT_ALARM) {
        ensureTodayDailyJournalSnapshot()
            .then(() => createDailyJournalPromptNotification())
            .catch(error => {
                console.error('TimeWhere: daily journal prompt failed', error);
            });
        return;
    }
    if (alarm?.name !== TASK_REMINDER_ALARM) return;
    runTaskReminderTick().catch(error => {
        console.error('TimeWhere: task reminder tick failed', error);
    });
});

chrome.notifications?.onClicked.addListener(notificationId => {
    if (notificationId.startsWith('timewhere-test-reminder:')) {
        chrome.tabs.create({ url: 'pages/focus/focus.html' });
        return;
    }
    if (notificationId.startsWith('timewhere-daily-journal:')) {
        const [, date] = notificationId.split(':');
        chrome.tabs.create({
            url: `pages/focus/focus.html?journal_date=${encodeURIComponent(date || formatDateISOFallback(new Date()))}`
        });
        return;
    }
    if (!notificationId.startsWith(TASK_REMINDER_NOTIFICATION_PREFIX)) return;
    handleWorkReminderNotificationClick(notificationId).catch(error => {
        console.error('TimeWhere: work reminder click state failed', error);
    });
    chrome.tabs.create({
        url: 'pages/focus/focus.html'
    });
});

chrome.notifications?.onClosed.addListener((notificationId, byUser) => {
    if (!String(notificationId || '').startsWith(TASK_REMINDER_NOTIFICATION_PREFIX)) return;
    handleWorkReminderNotificationClosed(notificationId, byUser).catch(error => {
        console.error('TimeWhere: work reminder close state failed', error);
    });
});
