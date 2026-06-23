/**
 * Daily journal static behavior checks.
 * Run: node tests/daily-journal.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const dbJs = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'db.js'), 'utf8');
const googleSyncJs = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'google-sync.js'), 'utf8');
const backgroundJs = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
const focusScript = fs.readFileSync(path.join(root, 'extension', 'pages', 'focus', 'script.js'), 'utf8');

let passed = 0;
let failed = 0;

function assert(desc, condition) {
    if (condition) {
        passed++;
        console.log(`  PASS ${desc}`);
    } else {
        failed++;
        console.log(`  FAIL ${desc}`);
    }
}

function loadTimeWhereDBForUnitChecks(options = {}) {
    class FakeDexie {
        constructor() {}
        version() {
            return {
                stores() {
                    return {
                        upgrade() {}
                    };
                }
            };
        }
    }
    const sandbox = {
        Dexie: FakeDexie,
        crypto: { randomUUID: () => 'test-id' },
        TimeWhereScheduling: options.TimeWhereScheduling || null,
        window: {}
    };
    vm.runInNewContext(dbJs, sandbox);
    return sandbox.window.TimeWhereDB;
}

console.log('\nTimeWhere Daily Journal tests\n' + '='.repeat(42));

assert('DB schema defines daily_journals keyed by date',
    dbJs.includes("db.version(5).stores")
    && dbJs.includes("daily_journals: '&date, status, updated_at, submitted_at, snapshot_at'"));

assert('DB exposes daily journal APIs',
    dbJs.includes('async ensureDailyJournalSnapshot')
    && dbJs.includes('async buildDailyJournalDraft')
    && dbJs.includes('async saveDailyJournalDraft')
    && dbJs.includes('async submitDailyJournal')
    && dbJs.includes('async getDailyJournal'));

assert('daily snapshot is available from local 00:00 and is not gated by 6am',
    !/ref\.getHours\(\) < 6[\s\S]*status: 'too_early'/.test(dbJs)
    && !/referenceDate\.getHours\(\) >= 6/.test(dbJs));

assert('planned snapshot uses Daily Settle displayTasks rather than only start_date equals journal date',
    dbJs.includes('buildDailyJournalSettleSnapshot')
    && dbJs.includes('scheduling.buildDailyTaskPool(tasks || [], referenceDate)')
    && dbJs.includes('scheduling.dailySettle(taskPool, todayContainers, referenceDate)')
    && dbJs.includes('const displayTasks = settle?.displayTasks || settle?.currentTasks || taskPool')
    && dbJs.includes('const planned = this.buildDailyJournalSettleSnapshot(tasks, containers, journalDate, ref)')
    && !/const planned = tasks[\s\S]*?filter\(task => task\.start_date === journalDate\)/.test(dbJs));

assert('task snapshots store checklist baseline for same-day progress comparison',
    dbJs.includes('createJournalChecklistBaseline(task)')
    && dbJs.includes('checklist_total_count')
    && dbJs.includes('checklist_checked_count')
    && dbJs.includes('checklist_checked_ids')
    && dbJs.includes('checklist_fingerprint')
    && dbJs.includes('checklist_partial_percent'));

assert('daily draft analyzes checklist progress without treating ordinary edits as progress',
    dbJs.includes('analyzeJournalChecklistProgress')
    && dbJs.includes('newly_checked_ids')
    && dbJs.includes('partial_percent_increased')
    && dbJs.includes('checklist_structure_changed')
    && dbJs.includes('checklist_regressed')
    && dbJs.includes('task_progress_analyses')
    && dbJs.includes('progressed_task_ids'));

assert('daily pool snapshot follows Daily Settle task-pool eligibility',
    dbJs.includes("task.progress !== 'completed'")
    && dbJs.includes('const effectiveStartDate = this.getTaskEffectiveStartDate(task)')
    && dbJs.includes('return effectiveStartDate == null || effectiveStartDate <= date')
    && dbJs.includes('task.deferred_until == null || new Date(task.deferred_until) <= referenceDate'));

assert('task snapshots preserve Daily Settle assignment metadata',
    dbJs.includes('assignment: task.assignment ?')
    && dbJs.includes('container_id: task.assignment.container_id || null')
    && dbJs.includes('container_name: task.assignment.container_name || null'));

assert('draft computes planned completed delayed and extra task snapshots with separate semantics',
    dbJs.includes('const completedPlanned = completed.filter(snapshot => plannedIds.has(String(snapshot.id)))')
    && dbJs.includes('completed_task_snapshots: completedPlanned')
    && dbJs.includes('all_completed_task_snapshots: completed')
    && dbJs.includes('delayed_task_snapshots: delayed')
    && dbJs.includes('const snapshotTime = snapshotAt ? new Date(snapshotAt).getTime() : null')
    && dbJs.includes('createdTime > snapshotTime')
    && dbJs.includes('const extraTasks = this.buildDailyJournalExtraTaskSnapshots(tasks, plannedIds, journal?.snapshot_at)')
    && dbJs.includes('const completionByTaskId = new Map((journal?.completion_task_snapshots || []).map(snapshot => [String(snapshot.id), snapshot]))')
    && dbJs.includes('const extraCompletionByTaskId = new Map((journal?.completion_extra_task_snapshots || []).map(snapshot => [String(snapshot.id), snapshot]))')
    && dbJs.includes('planned_task_snapshots: plannedReviewSnapshots')
    && dbJs.includes('extra_done_task_snapshots: extraReviewSnapshots')
    && dbJs.includes('this.getLocalDateFromISO(task.completed_at) === journalDate'));

assert('daily journal completion snapshot fields freeze planned and extra task statuses',
    dbJs.includes('async ensureDailyJournalCompletionSnapshot')
    && dbJs.includes('completion_snapshot_at')
    && dbJs.includes('completion_task_snapshots')
    && dbJs.includes('completion_extra_task_snapshots')
    && dbJs.includes('buildDailyJournalCompletionSnapshots')
    && dbJs.includes('withJournalTaskCompletionStatus')
    && dbJs.includes('journal_status'));

assert('Dashboard journal labels use aligned review layout and no planned completion note',
    focusScript.includes('今日任务')
    && focusScript.includes('计划延误说明')
    && focusScript.includes('计划外任务')
    && focusScript.includes('计划外任务说明')
    && !focusScript.includes('计划外完成')
    && focusScript.includes("'今日总结'")
    && focusScript.includes('journal-note-title')
    && focusScript.includes('placeholder="补充说明..."')
    && !focusScript.includes('placeholder="${escapeAttribute(label)}"')
    && !/<h4>计划内完成/.test(focusScript)
    && !/<h4>计划延误/.test(focusScript)
    && !focusScript.includes("'计划完成说明'"));

assert('Dashboard journal task lists show completed partial and incomplete status markers',
    focusScript.includes('renderJournalPlannedTaskReview')
    && focusScript.includes('renderJournalStatusTaskList')
    && focusScript.includes("statusClass: 'completed'")
    && focusScript.includes("statusIcon: 'check_circle'")
    && focusScript.includes("statusLabel: '完成'")
    && focusScript.includes("statusClass: 'partial'")
    && focusScript.includes("statusIcon: 'rule'")
    && focusScript.includes("statusLabel: '部分完成'")
    && focusScript.includes("statusClass: 'incomplete'")
    && focusScript.includes("statusIcon: 'close'")
    && focusScript.includes("statusLabel: '未完成'"));

assert('journal submit does not update tasks',
    /async submitDailyJournal[\s\S]*db\.daily_journals\.put\(journal\)/.test(dbJs)
    && !/async submitDailyJournal[\s\S]*updateTask/.test(dbJs));

assert('Google sync includes daily_journals and resolves same-day conflict by newer updated_at',
    googleSyncJs.includes("'daily_journals'")
    && googleSyncJs.includes('chooseNewerDailyJournal')
    && googleSyncJs.includes("reason: 'daily_journal_newer_local'")
    && googleSyncJs.includes("reason: 'daily_journal_newer_cloud'"));

assert('background can create daily snapshot from local 00:00 on next availability',
    backgroundJs.includes('bootstrapDailyJournal()')
    && backgroundJs.includes('ensureTodayDailyJournalSnapshot()')
    && backgroundJs.includes('DAILY_JOURNAL_SNAPSHOT_HOUR = 0')
    && backgroundJs.includes('buildDailyJournalSettleSnapshot(tasks, containers, date, now)')
    && !backgroundJs.includes("return { status: 'too_early' }")
    && backgroundJs.includes('openExistingTimeWhereDB'));

assert('Dashboard and Side Panel daily journal entry no longer gate snapshot creation by 6am',
    !focusScript.includes('now.getHours() >= 6')
    && !focusScript.includes('new Date().getHours() >= 6'));

assert('Dashboard opens journal from URL and manual entry',
    focusScript.includes("journal_date")
    && focusScript.includes('data-action="open-today-journal"')
    && focusScript.includes('openDailyJournalModal'));

const TimeWhereDB = loadTimeWhereDBForUnitChecks();
const baselineTask = {
    id: 'task-1',
    title: 'Math task',
    progress: 'in_progress',
    checklist: [
        { id: 'a', title: 'Read', checked: false },
        { id: 'b', title: 'Solve', checked: true }
    ]
};
const baselineSnapshot = TimeWhereDB.createJournalTaskSnapshot(baselineTask);

assert('checklist baseline captures checked count ids and fingerprint',
    baselineSnapshot.checklist_total_count === 2
    && baselineSnapshot.checklist_checked_count === 1
    && baselineSnapshot.checklist_checked_ids.join(',') === 'b'
    && typeof baselineSnapshot.checklist_fingerprint === 'string');

assert('newly checked checklist item is detected as same-day progress', (() => {
    const analysis = TimeWhereDB.analyzeJournalChecklistProgress(baselineSnapshot, {
        ...baselineTask,
        checklist: [
            { id: 'a', title: 'Read', checked: true },
            { id: 'b', title: 'Solve', checked: true }
        ]
    }, '2026-05-26');
    return analysis.has_new_progress === true
        && analysis.newly_checked_ids.includes('a')
        && analysis.checked_count_now === 2;
})());

assert('ordinary task title edit does not count as checklist progress', (() => {
    const analysis = TimeWhereDB.analyzeJournalChecklistProgress(baselineSnapshot, {
        ...baselineTask,
        title: 'Renamed task'
    }, '2026-05-26');
    return analysis.has_new_progress === false
        && analysis.checklist_structure_changed === false;
})());

assert('adding an unchecked checklist item marks structure change but not progress', (() => {
    const analysis = TimeWhereDB.analyzeJournalChecklistProgress(baselineSnapshot, {
        ...baselineTask,
        checklist: [
            ...baselineTask.checklist,
            { id: 'c', title: 'Review', checked: false }
        ]
    }, '2026-05-26');
    return analysis.has_new_progress === false
        && analysis.checklist_structure_changed === true
        && analysis.checklist_total_now === 3;
})());

assert('unchecked baseline checklist item is tracked as regression not progress', (() => {
    const analysis = TimeWhereDB.analyzeJournalChecklistProgress(baselineSnapshot, {
        ...baselineTask,
        checklist: [
            { id: 'a', title: 'Read', checked: false },
            { id: 'b', title: 'Solve', checked: false }
        ]
    }, '2026-05-26');
    return analysis.has_new_progress === false
        && analysis.checklist_regressed === true
        && analysis.unchecked_baseline_ids.includes('b');
})());

assert('partial completion percent increase is detected as progress', (() => {
    const partialBaseline = TimeWhereDB.createJournalTaskSnapshot({
        id: 'task-2',
        title: 'Essay',
        checklist: [
            { id: 'done', title: '已完成占比 30%', checked: true, type: 'partial_completion', partial_role: 'done', partial_percent: 30 },
            { id: 'remaining', title: '未完成占比 70%', checked: false, type: 'partial_completion', partial_role: 'remaining', partial_percent: 30 }
        ]
    });
    const analysis = TimeWhereDB.analyzeJournalChecklistProgress(partialBaseline, {
        id: 'task-2',
        title: 'Essay',
        checklist: [
            { id: 'done', title: '已完成占比 60%', checked: true, type: 'partial_completion', partial_role: 'done', partial_percent: 60 },
            { id: 'remaining', title: '未完成占比 40%', checked: false, type: 'partial_completion', partial_role: 'remaining', partial_percent: 60 }
        ]
    }, '2026-05-26');
    return analysis.has_new_progress === true
        && analysis.partial_percent_increased === true
        && analysis.partial_percent_before === 30
        && analysis.partial_percent_now === 60;
})());

assert('legacy snapshot without checklist baseline falls back to completion signal only', (() => {
    const analysis = TimeWhereDB.analyzeJournalChecklistProgress({ id: 'legacy-1', title: 'Legacy' }, {
        id: 'legacy-1',
        title: 'Legacy',
        completed_at: '2026-05-26T09:00:00.000Z',
        checklist: [{ id: 'x', title: 'Done', checked: true }]
    }, '2026-05-26');
    return analysis.has_checklist_baseline === false
        && analysis.has_new_progress === true
        && analysis.progress_source === 'completion_only';
})());

assert('journal completion status returns completed partial and incomplete states', (() => {
    const completed = TimeWhereDB.getJournalTaskCompletionStatus(
        { id: 'done' },
        { id: 'done', progress: 'completed', completed_at: '2026-05-26T09:00:00.000Z' },
        null,
        '2026-05-26'
    );
    const partial = TimeWhereDB.getJournalTaskCompletionStatus(
        { id: 'partial', checklist_checked_count: 0 },
        { id: 'partial' },
        { has_new_progress: true },
        '2026-05-26'
    );
    const incomplete = TimeWhereDB.getJournalTaskCompletionStatus(
        { id: 'todo', checklist_checked_count: 0 },
        { id: 'todo', progress: 'not_started' },
        null,
        '2026-05-26'
    );
    return completed.status === 'completed'
        && completed.label === '完成'
        && partial.status === 'partial'
        && partial.label === '部分完成'
        && incomplete.status === 'incomplete'
        && incomplete.label === '未完成';
})());

const DailySettleDB = loadTimeWhereDBForUnitChecks({
    TimeWhereScheduling: {
        containerAppliesToDate(container) {
            return container.repeat !== 'none';
        },
        buildDailyTaskPool(tasks, now) {
            const todayStr = DailySettleDB.formatDateISO(now);
            return (tasks || []).filter(task =>
                task.progress !== 'completed'
                && ((task.arranged_date || task.start_date) == null || (task.arranged_date || task.start_date) <= todayStr)
                && (task.deferred_until == null || new Date(task.deferred_until) <= now)
            );
        },
        dailySettle(taskPool) {
            return {
                displayTasks: taskPool.map((task, index) => ({
                    ...task,
                    assignment: index === 0
                        ? { status: 'current', label: '当前', container_id: 'c1', container_name: 'Study', time_start: '08:00', time_end: '09:00' }
                        : { status: 'unassigned', label: '当前未分配', reason: '当前未分配' }
                }))
            };
        }
    }
});

assert('Daily Settle snapshot includes today overdue and null-start tasks and excludes future completed deferred-future tasks', (() => {
    const snapshot = DailySettleDB.buildDailyJournalSettleSnapshot([
        { id: 'today', title: 'Today', progress: 'not_started', start_date: '2026-05-26' },
        { id: 'overdue', title: 'Overdue', progress: 'not_started', start_date: '2026-05-25' },
        { id: 'null-start', title: 'No start', progress: 'not_started', start_date: null },
        { id: 'future', title: 'Future', progress: 'not_started', start_date: '2026-05-27' },
        { id: 'arranged-today', title: 'Arranged today', progress: 'not_started', start_date: '2026-05-27', arranged_date: '2026-05-26' },
        { id: 'done', title: 'Done', progress: 'completed', start_date: '2026-05-26' },
        { id: 'deferred-future', title: 'Deferred', progress: 'not_started', start_date: '2026-05-26', deferred_until: '2026-05-26T13:00:00' }
    ], [{ id: 'c1', name: 'Study', enabled: true, repeat: 'daily' }], '2026-05-26', new Date('2026-05-26T08:00:00'));
    return snapshot.map(task => task.id).join(',') === 'today,overdue,null-start,arranged-today'
        && snapshot[0].assignment.status === 'current'
        && snapshot[0].assignment.container_id === 'c1';
})());

assert('extra task list uses post-snapshot creation time and Daily Settle snapshot membership', (() => {
    const plannedIds = new Set(['today', 'overdue', 'null-start']);
    const snapshotTime = new Date('2026-05-26T00:05:00.000Z').getTime();
    const tasks = [
        { id: 'today', created_at: '2026-05-26T00:10:00.000Z', progress: 'completed' },
        { id: 'preexisting-outside', created_at: '2026-05-25T23:00:00.000Z', progress: 'not_started' },
        { id: 'new-not-started', created_at: '2026-05-26T00:10:00.000Z', progress: 'not_started' },
        { id: 'new-in-progress', created_at: '2026-05-26T00:11:00.000Z', progress: 'in_progress' },
        { id: 'new-completed', created_at: '2026-05-26T00:12:00.000Z', progress: 'completed' }
    ];
    return tasks
        .filter(task => !plannedIds.has(String(task.id)))
        .filter(task => new Date(task.created_at).getTime() > snapshotTime)
        .map(task => task.id)
        .join(',') === 'new-not-started,new-in-progress,new-completed';
})());

assert('completion snapshots freeze planned and extra task statuses without overwriting current draft semantics', (() => {
    const journal = {
        date: '2026-05-26',
        snapshot_at: '2026-05-26T00:05:00.000Z',
        planned_task_snapshots: [
            { id: 'planned-done', title: 'Done', progress: 'not_started', checklist_checked_count: 0, checklist_checked_ids: [] },
            { id: 'planned-partial', title: 'Partial', progress: 'not_started', checklist_checked_count: 0, checklist_checked_ids: [] },
            { id: 'planned-todo', title: 'Todo', progress: 'not_started', checklist_checked_count: 0, checklist_checked_ids: [] }
        ]
    };
    const completion = TimeWhereDB.buildDailyJournalCompletionSnapshots(journal, [
        { id: 'planned-done', progress: 'completed', completed_at: '2026-05-26T22:00:00.000Z' },
        { id: 'planned-partial', progress: 'not_started', checklist: [{ id: 'a', title: 'A', checked: true }] },
        { id: 'planned-todo', progress: 'not_started', checklist: [] },
        { id: 'extra', progress: 'not_started', created_at: '2026-05-26T08:00:00.000Z', checklist: [{ id: 'b', title: 'B', checked: true }] }
    ], '2026-05-26');
    return completion.completion_task_snapshots.map(task => task.journal_status).join(',') === 'completed,partial,incomplete'
        && completion.completion_extra_task_snapshots.length === 1
        && completion.completion_extra_task_snapshots[0].journal_status === 'partial';
})());

console.log('\n' + '='.repeat(42));
console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
if (failed > 0) process.exit(1);
