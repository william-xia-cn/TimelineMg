/**
 * TimeWhere macOS widget snapshot tests.
 * Run: node tests/widget-snapshot.test.js
 */

const fs = require('fs');
const path = require('path');
const WidgetSnapshot = require('../extension/shared/js/widget-snapshot.js');

const root = path.join(__dirname, '..');
const g = {};
const schedulingSrc = fs.readFileSync(path.join(root, 'extension/shared/js/scheduling.js'), 'utf8');
new Function('global', schedulingSrc).call(g, g);
const Scheduling = g.TimeWhereScheduling;

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

function assertEqual(desc, got, expected) {
    assert(`${desc} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(expected));
}

function task(overrides = {}) {
    return {
        id: overrides.id || 'task-1',
        title: overrides.title || 'Essay',
        progress: 'not_started',
        start_date: '2026-06-06',
        due_date: '2026-06-08',
        priority: 'medium',
        duration: 45,
        plan_name: 'English Plan',
        notes: 'private notes should not enter widget',
        ...overrides
    };
}

function container(overrides = {}) {
    return {
        id: overrides.id || 'study',
        name: overrides.name || 'Study',
        time_start: '18:00',
        time_end: '20:00',
        repeat: 'daily',
        layer: 1,
        enabled: true,
        ...overrides
    };
}

console.log('\nTimeWhere widget snapshot tests\n' + '='.repeat(40));

const now = new Date('2026-06-06T18:30:00');
const snapshot = WidgetSnapshot.buildWidgetSnapshot({
    now,
    scheduling: Scheduling,
    containers: [container()],
    tasks: [
        task({ id: 'active', title: 'Active essay', progress: 'in_progress', schedule_time: '18:00' }),
        task({ id: 'next', title: 'Next reading', schedule_time: null }),
        task({ id: 'done', title: 'Completed today', progress: 'completed', completed_at: '2026-06-06T17:00:00' }),
        task({ id: 'future', title: 'Future task', start_date: '2026-06-07' })
    ]
});

assertEqual('snapshot schema is timewhere-widget-v1', snapshot.schema, 'timewhere-widget-v1');
assertEqual('snapshot completed_today counts completed tasks for today', snapshot.counts.completed_today, 1);
assertEqual('snapshot pending_today follows Daily Settle task pool', snapshot.counts.pending_today, 2);
assertEqual('snapshot selects in-progress current task first', snapshot.current_tasks[0]?.id, 'active');
assert('snapshot limits current tasks to display fields',
    Object.keys(snapshot.current_tasks[0]).sort().join(',') === 'assignment_label,duration,id,plan_name,priority,progress,schedule_time,title');
assert('snapshot excludes private notes and raw sync/auth data',
    !JSON.stringify(snapshot).includes('private notes')
    && !/token|secret|oauth|google|email|cookie/i.test(JSON.stringify(snapshot)));

const empty = WidgetSnapshot.buildWidgetSnapshot({
    now,
    scheduling: Scheduling,
    containers: [container()],
    tasks: [task({ id: 'done-only', progress: 'completed', completed_at: '2026-06-06T12:00:00' })]
});
assertEqual('snapshot empty state has no current tasks', empty.current_tasks.length, 0);
assertEqual('snapshot empty state keeps completed count', empty.counts.completed_today, 1);

const overrideCount = WidgetSnapshot.buildWidgetSnapshot({
    now,
    scheduling: Scheduling,
    containers: [container()],
    tasks: [task({ id: 'todo' })],
    completedToday: 7
});
assertEqual('snapshot can use DB-provided completed count', overrideCount.counts.completed_today, 7);

const desktopReminders = fs.readFileSync(path.join(root, 'extension/shared/js/desktop-reminders.js'), 'utf8');
const platformJs = fs.readFileSync(path.join(root, 'extension/shared/js/platform.js'), 'utf8');
const electronMain = fs.readFileSync(path.join(root, 'platforms/desktop-electron/main.js'), 'utf8');
const electronPackage = fs.readFileSync(path.join(root, 'platforms/desktop-electron/package.json'), 'utf8');
const widgetSwift = fs.readFileSync(path.join(root, 'platforms/macos-widget/TimeWhereWidget/TimeWhereWidget.swift'), 'utf8');
const widgetWorkflow = fs.readFileSync(path.join(root, '.github/workflows/timewhere-macos-widget.yml'), 'utf8');

assert('desktop reminders writes widget snapshot through platform system bridge',
    desktopReminders.includes('TimeWhereWidgetSnapshot.buildWidgetSnapshot')
    && desktopReminders.includes('writeWidgetSnapshot(snapshot)'));
assert('platform exposes desktop writeWidgetSnapshot only through system capability',
    platformJs.includes('writeWidgetSnapshot(snapshot = {})')
    && platformJs.includes("call('system.writeWidgetSnapshot', snapshot)"));
assert('Electron main sanitizes and writes widget snapshot JSON',
    electronMain.includes("const widgetSnapshotSchema = 'timewhere-widget-v1'")
    && electronMain.includes("const widgetAppGroupIdentifier = 'group.cn.williamxia.timewhere'")
    && electronMain.includes('TIMEWHERE_WIDGET_SNAPSHOT_PATH')
    && electronMain.includes('sanitizeWidgetSnapshot')
    && electronMain.includes('system.writeWidgetSnapshot')
    && electronMain.includes('timewhere-widget-v1.json'));
assert('Electron app registers timewhere URL scheme for widget click',
    electronMain.includes("const protocolScheme = 'timewhere'")
    && electronMain.includes('app.setAsDefaultProtocolClient(protocolScheme)')
    && electronPackage.includes('"schemes"')
    && electronPackage.includes('"timewhere"'));
assert('macOS WidgetKit source reads only snapshot JSON and supports medium/large',
    widgetSwift.includes('import WidgetKit')
    && widgetSwift.includes('timewhere-widget-v1.json')
    && widgetSwift.includes('group.cn.williamxia.timewhere')
    && widgetSwift.includes('.systemMedium')
    && widgetSwift.includes('.systemLarge')
    && widgetSwift.includes('timewhere://dashboard')
    && !/IndexedDB|OAuth|token|secret|Google|email|cookie/i.test(widgetSwift));
assert('macOS widget workflow builds with xcodebuild without signing',
    widgetWorkflow.includes('macos-latest')
    && widgetWorkflow.includes('npm run macos:widget:build')
    && fs.readFileSync(path.join(root, 'package.json'), 'utf8').includes('CODE_SIGNING_ALLOWED=NO'));

console.log('\n' + '='.repeat(40));
console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
if (failed > 0) process.exit(1);
