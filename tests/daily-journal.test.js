/**
 * Daily journal static behavior checks.
 * Run: node tests/daily-journal.test.js
 */

const fs = require('fs');
const path = require('path');

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

assert('6am snapshot is not generated too early',
    /ref\.getHours\(\) < 6[\s\S]*status: 'too_early'/.test(dbJs));

assert('planned snapshot uses start_date equals journal date',
    /filter\(task => task\.start_date === journalDate\)/.test(dbJs)
    && dbJs.includes('planned_task_snapshots: planned'));

assert('daily pool snapshot follows Daily Settle task-pool eligibility',
    dbJs.includes("task.progress !== 'completed'")
    && dbJs.includes('task.start_date == null || task.start_date <= date')
    && dbJs.includes('task.deferred_until == null || new Date(task.deferred_until) <= referenceDate'));

assert('draft computes mutually exclusive planned-completed delayed and extra-done snapshots',
    dbJs.includes('const completedPlanned = completed.filter(snapshot => plannedIds.has(String(snapshot.id)))')
    && dbJs.includes('completed_task_snapshots: completedPlanned')
    && dbJs.includes('all_completed_task_snapshots: completed')
    && dbJs.includes('delayed_task_snapshots: delayed')
    && dbJs.includes('extra_done_task_snapshots: extraDone')
    && dbJs.includes('this.getLocalDateFromISO(task.completed_at) === journalDate'));

assert('Dashboard journal labels use aligned review layout and no planned completion note',
    focusScript.includes('今日任务')
    && focusScript.includes('计划延误说明')
    && focusScript.includes('计划外完成')
    && focusScript.includes('计划外完成说明')
    && focusScript.includes("'今日总结'")
    && focusScript.includes('journal-note-title')
    && focusScript.includes('placeholder="补充说明..."')
    && !focusScript.includes('placeholder="${escapeAttribute(label)}"')
    && !/<h4>计划内完成/.test(focusScript)
    && !/<h4>计划延误/.test(focusScript)
    && !focusScript.includes("'计划完成说明'"));

assert('Dashboard journal planned tasks show completed delayed and fallback status markers',
    focusScript.includes('renderJournalPlannedTaskReview')
    && focusScript.includes("statusClass = 'completed'")
    && focusScript.includes("statusIcon = 'check_circle'")
    && focusScript.includes("statusLabel = '任务完成'")
    && focusScript.includes("statusClass = 'delayed'")
    && focusScript.includes("statusIcon = 'close'")
    && focusScript.includes("statusLabel = '任务延误'")
    && focusScript.includes("statusLabel = '待确认'"));

assert('journal submit does not update tasks',
    /async submitDailyJournal[\s\S]*db\.daily_journals\.put\(journal\)/.test(dbJs)
    && !/async submitDailyJournal[\s\S]*updateTask/.test(dbJs));

assert('Google sync includes daily_journals and resolves same-day conflict by newer updated_at',
    googleSyncJs.includes("'daily_journals'")
    && googleSyncJs.includes('chooseNewerDailyJournal')
    && googleSyncJs.includes("reason: 'daily_journal_newer_local'")
    && googleSyncJs.includes("reason: 'daily_journal_newer_cloud'"));

assert('background can create missed 6am snapshot on next availability',
    backgroundJs.includes('bootstrapDailyJournal()')
    && backgroundJs.includes('ensureTodayDailyJournalSnapshot()')
    && backgroundJs.includes('now.getHours() < DAILY_JOURNAL_SNAPSHOT_HOUR')
    && backgroundJs.includes('openExistingTimeWhereDB'));

assert('Dashboard opens journal from URL and manual entry',
    focusScript.includes("journal_date")
    && focusScript.includes('data-action="open-today-journal"')
    && focusScript.includes('openDailyJournalModal'));

console.log('\n' + '='.repeat(42));
console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
if (failed > 0) process.exit(1);
