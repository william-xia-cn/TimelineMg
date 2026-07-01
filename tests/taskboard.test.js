/**
 * Task Board manual task creation and quick-add checks.
 * Run: node tests/taskboard.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const boardJs = fs.readFileSync(path.join(root, 'extension', 'pages', 'tasks', 'board.js'), 'utf8');
const dialogsJs = fs.readFileSync(path.join(root, 'extension', 'pages', 'tasks', 'dialogs.js'), 'utf8');
const detailPanelJs = fs.readFileSync(path.join(root, 'extension', 'pages', 'tasks', 'detail-panel.js'), 'utf8');
const sidebarJs = fs.readFileSync(path.join(root, 'extension', 'pages', 'tasks', 'sidebar.js'), 'utf8');
const stateJs = fs.readFileSync(path.join(root, 'extension', 'pages', 'tasks', 'state.js'), 'utf8');
const scriptJs = fs.readFileSync(path.join(root, 'extension', 'pages', 'tasks', 'script.js'), 'utf8');
const tasksHtml = fs.readFileSync(path.join(root, 'extension', 'pages', 'tasks', 'tasks.html'), 'utf8');
const dbJs = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'db.js'), 'utf8');
const matrixViewJs = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'matrixview.js'), 'utf8');
const taskArrangeAutoJs = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'task-arrange-auto.js'), 'utf8');
const iconsJs = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'icons.js'), 'utf8');
const externalLinksJs = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'external-links.js'), 'utf8');
const googleSyncStatusUi = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'google-sync-status-ui.js'), 'utf8');
const boardCss = fs.readFileSync(path.join(root, 'extension', 'pages', 'tasks', 'styles.css'), 'utf8');

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

function countOccurrences(text, pattern) {
    return (String(text || '').match(new RegExp(pattern, 'g')) || []).length;
}

function getCalendarItemHtml(html, taskId) {
    const marker = 'data-task-id="' + taskId + '"';
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) return '';
    const start = html.lastIndexOf('<button', markerIndex);
    const end = html.indexOf('</button>', markerIndex);
    return start >= 0 && end >= 0 ? html.slice(start, end + '</button>'.length) : '';
}
console.log('\nTimeWhere Task Board tests\n' + '='.repeat(44));

const RealDate = Date;
class FixedDate extends RealDate {
    constructor(...args) {
        if (args.length === 0) return new RealDate('2026-05-13T12:00:00');
        return new RealDate(...args);
    }

    static now() {
        return new RealDate('2026-05-13T12:00:00').getTime();
    }

    static parse(value) {
        return RealDate.parse(value);
    }

    static UTC(...args) {
        return RealDate.UTC(...args);
    }
}

const context = {
    console,
    Date: FixedDate,
    document: {
        createElement: () => ({
            innerHTML: '',
            set textContent(value) {
                this.innerHTML = String(value || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
            }
        })
    },
    setTimeout,
    crypto: {
        randomUUID: (() => {
            let i = 0;
            return () => `uuid-${++i}`;
        })()
    },
    requestAnimationFrame: (fn) => fn(),
    TaskApp: {
        groupBy: 'due_date',
        focusedGroupKey: null,
        currentPlanBuckets: [],
        plans: [],
        getBucketName: () => '',
        getLabelInfo: () => null
    },
    TimeWhereDB: {},
    TimeWhereManageBac: null
};
vm.runInNewContext(boardJs, context);
vm.runInNewContext(dialogsJs, context);
vm.runInNewContext(detailPanelJs, context);

const noDateTask = context.normalizeManualTaskPayload({ title: 'No date' });
assert('manual task payload allows missing due_date',
    noDateTask.due_date === null && noDateTask.start_date === null);

const normalized = context.normalizeManualTaskPayload({
    title: 'With due date',
    due_date: '2026-05-20',
    start_date: null
});
assert('manual task start_date defaults to due_date when omitted', normalized.start_date === '2026-05-20');

assert('manual overdue task start_date initializes to due_date', context.normalizeManualTaskPayload({
    title: 'Overdue due date',
    due_date: '2026-05-10',
    start_date: null
}).start_date === '2026-05-10');

assert('manual task keeps explicit start_date', context.normalizeManualTaskPayload({
    title: 'With start date',
    due_date: '2026-05-20',
    start_date: '2026-05-18'
}).start_date === '2026-05-18');

assert('due_date grouping with exact column shows Bucket selector without Due input', (() => {
    const cfg = context.getQuickAddFieldConfig('due_date', { due_date: '2026-05-20' });
    return cfg.showBucketSelect === true && cfg.showDueDate === false && cfg.showStartDate === false;
})());

assert('due_date grouping with non-exact column requires Due input', (() => {
    const cfg = context.getQuickAddFieldConfig('due_date', {});
    return cfg.showBucketSelect === true && cfg.showDueDate === true && cfg.showStartDate === false;
})());

assert('next_week quick-add requires explicit due_date', (() => {
    const defaults = context.getQuickAddDefaults('next_week');
    const cfg = context.getQuickAddFieldConfig('due_date', defaults);
    return !defaults.due_date && cfg.showDueDate === true && cfg.showBucketSelect === true;
})());

assert('no_date quick-add can normalize an empty due_date payload', (() => {
    const defaults = context.getQuickAddDefaults('no_date');
    const cfg = context.getQuickAddFieldConfig('due_date', defaults);
    const payload = context.normalizeManualTaskPayload({ ...defaults, title: 'No date quick add' });
    return cfg.showDueDate === true && payload.due_date === null && payload.start_date === null;
})());

assert('bucket grouping includes start_date and required due_date without Bucket selector', (() => {
    const cfg = context.getQuickAddFieldConfig('bucket', { bucket_id: 12 });
    return cfg.showStartDate === true && cfg.showDueDate === true && cfg.showBucketSelect === false;
})());

assert('other groupings include start_date, required due_date, and Bucket selector', (() => {
    const cfg = context.getQuickAddFieldConfig('priority', { priority: 'urgent' });
    return cfg.showStartDate === true && cfg.showDueDate === true && cfg.showBucketSelect === true;
})());

assert('quick-add preserves inferred defaults before normalization', boardJs.includes('const defaults = getQuickAddDefaults(colKey)')
    && boardJs.includes('...defaults')
    && boardJs.includes('priority: defaults.priority || defaultPriority'));

assert('quick-add creation uses normalized manual payload before addTask', boardJs.includes('const normalizedPayload = normalizeManualTaskPayload(payload)')
    && boardJs.includes('TimeWhereDB.addTask(normalizedPayload)'));
assert('quick-add can create weekly or monthly recurring task series',
    boardJs.includes('data-field="recurrence_frequency"')
    && boardJs.includes('<option value="weekly">每周</option>')
    && boardJs.includes('<option value="monthly">每月</option>')
    && boardJs.includes('data-field="recurrence_count" min="2" max="12"')
    && boardJs.includes('TimeWhereDB.addRecurringTaskSeries(normalizedPayload'));
assert('DB addTask derives subject from selected Plan only', /const subject = plan\?\.subject \|\| null;/.test(dbJs)
    && !/let subject = task\.subject/.test(dbJs));
assert('DB addTask derives subject_in_matrixview from selected Plan or MatrixView mapping',
    dbJs.includes('resolvePlanSubjectInMatrixView(plan, task.subject_in_matrixview || null)')
    && dbJs.includes('subject_in_matrixview: subjectInMatrixView'));
assert('DB can backfill historical Plan and Task subject_in_matrixview from timetable events',
    dbJs.includes('async backfillMatrixViewSubjectIds')
    && dbJs.includes('resolvePlanSubjectInMatrixViewFromEvents')
    && dbJs.includes('subjectIdMatchesPlan')
    && dbJs.includes("await this.backfillMatrixViewSubjectIds({ source: 'init_default_settings' })")
    && dbJs.includes("source: 'matrixview_backfill'")
    && dbJs.includes("await this.markTaskArrangeDirty('matrixview_subject_id_backfill'"));
assert('MatrixView import immediately backfills subject_in_matrixview to existing tasks',
    matrixViewJs.includes('db.backfillMatrixViewSubjectIds')
    && matrixViewJs.includes("source: 'matrixview_initialize'"));
assert('DB addTask initializes manual start_date from due_date and no longer defaults to today',
    dbJs.includes('getInitialTaskStartDate(task = {}, referenceDate = new Date())')
    && dbJs.includes('if (!this.isManageBacSourceTask(task)) return dueDate')
    && dbJs.includes('this.addDaysISO(dueDate, -14)')
    && dbJs.includes('start_date: normalizedTask.start_date || null')
    && !dbJs.includes('start_date: task.start_date || this.formatDateISO(new Date())'));
assert('DB updateTask recalculates subject when plan_id changes', dbJs.includes("Object.prototype.hasOwnProperty.call(data, 'plan_id')")
    && dbJs.includes('updateData.subject = nextPlan?.subject || null')
    && dbJs.includes('updateData.subject_in_matrixview = await this.resolvePlanSubjectInMatrixView'));
assert('DB marks Task Arrange dirty for task date or plan changes only', taskArrangeAutoJs.includes("task_arrange_dirty_at")
    && dbJs.includes('markTaskArrangeDirty')
    && dbJs.includes('hasArrangeRelevantTaskUpdate')
    && dbJs.includes("['start_date', 'arranged_date', 'due_date', 'deadline', 'plan_id', 'subject_in_matrixview']")
    && dbJs.includes('task_created_with_arrange_date')
    && dbJs.includes('task_arrange_field_changed')
    && !/if \(data\.progress\)[\s\S]{0,120}markTaskArrangeDirty/.test(dbJs));
assert('DB blocks deletion of active subject Plans', dbJs.includes('plan?.subject && plan.subject_active !== false')
    && dbJs.includes('启用学科 Plan 只能通过 MatrixView 导入更新'));
assert('Plan sidebar disables active subject Plan deletion', sidebarJs.includes('const canDeletePlan = !(plan.subject && plan.subject_active !== false)')
    && sidebarJs.includes('showDeletePlanDialog(plan)'));

assert('quick-add prevents duplicate forms while async bucket options load', boardJs.includes('dataset.quickAddOpening')
    && boardJs.includes("delete columnEl.dataset.quickAddOpening"));

assert('quick-add no longer has business-layer missing due_date error', !boardJs.includes('请选择截止日期'));

assert('quick-add keeps Due visual required hint and required attribute', boardJs.includes('<span>Due <strong>*</strong></span>')
    && /data-field="due_date" required/.test(boardJs));

assert('quick-add renders bucket selector for due_date and other groupings', boardJs.includes('showBucketSelect')
    && boardJs.includes('renderQuickAddBucketOptions'));

assert('quick-add form has compact inline styling', /\.quick-add-form/.test(boardCss)
    && /\.quick-add-error/.test(boardCss)
    && /\.quick-add-actions/.test(boardCss)
    && /\.quick-add-recurrence/.test(boardCss));

assert('Task Board exposes Calendar tab and container', tasksHtml.includes('data-view="calendar"')
    && tasksHtml.includes('id="taskCalendarView"')
    && stateJs.includes("currentView: 'board'")
    && stateJs.includes("'board' | 'list' | 'calendar'"));
assert('Task Board loads and initializes avatar-based Google sync status entry',
    tasksHtml.includes('shared/styles/google-sync-status.css')
    && tasksHtml.includes('shared/js/google-sync-status-ui.js')
    && tasksHtml.indexOf('desktop-sync-service.js') < tasksHtml.indexOf('google-sync-status-ui.js')
    && tasksHtml.includes('class="user-avatar"')
    && scriptJs.includes('TimeWhereGoogleSyncStatusUI?.init?.()')
    && scriptJs.includes('TimeWhereGoogleSyncStatusUI?.refreshAll?.()')
    && !scriptJs.includes('setTransientStatus')
    && googleSyncStatusUi.includes('attachSidebarAvatar'));
assert('Task Board renderBoard supports Calendar view', boardJs.includes("TaskApp.currentView === 'calendar'")
    && boardJs.includes('renderCalendarView()')
    && boardJs.includes("calendarEl.style.display = ''"));
assert('Task Calendar renders a 13-month continuous date stream from previous month', boardJs.includes('for (let i = 0; i < 13; i++)')
    && boardJs.includes('today.getMonth() - 1')
    && !boardJs.includes('today.getMonth() - 3'));
assert('Task Calendar focuses the current month after rendering surrounding months',
    boardJs.includes("task-calendar-month.current-month")
    && boardJs.includes("scrollIntoView({ block: 'start' })"));
assert('Task Calendar month rendering uses spacer cells instead of duplicate other-month dates',
    boardJs.includes('task-calendar-spacer')
    && !boardJs.includes("classes.push('other-month')")
    && boardCss.includes('.task-calendar-spacer'));
assert('Task Calendar styles define green start and red due items', boardCss.includes('.task-calendar-item.start')
    && boardCss.includes('color: #047857')
    && boardCss.includes('.task-calendar-item.due')
    && boardCss.includes('color: #b91c1c'));

const mayCalendarHtml = context.renderTaskCalendarMonth(new RealDate('2026-05-01T00:00:00'), [
    { id: 'start-only', title: 'Start only', start_date: '2026-05-20', priority: 'medium' },
    { id: 'due-only', title: 'Due only', due_date: '2026-05-20', priority: 'medium' },
    { id: 'same-day', title: 'Same day', start_date: '2026-05-20', due_date: '2026-05-20', priority: 'medium' },
    { id: 'cross-month', title: 'Cross month', start_date: '2026-05-31', due_date: '2026-06-01', priority: 'medium' },
    { id: 'no-date', title: 'No date', priority: 'medium' },
    { id: 'done', title: 'Done task', due_date: '2026-05-20', progress: 'completed', priority: 'low' }
], new RealDate('2026-05-13T12:00:00'));
const juneCalendarHtml = context.renderTaskCalendarMonth(new RealDate('2026-06-01T00:00:00'), [
    { id: 'cross-month', title: 'Cross month', start_date: '2026-05-31', due_date: '2026-06-01', priority: 'medium' }
], new RealDate('2026-05-13T12:00:00'));
const calendarDayHtml = context.renderTaskCalendarDay(new RealDate('2026-05-20T00:00:00'), 4, [
    { id: 'start-only', title: 'Start only', start_date: '2026-05-20', priority: 'medium' },
    { id: 'due-only', title: 'Due only', due_date: '2026-05-20', priority: 'medium' },
    { id: 'same-day', title: 'Same day', start_date: '2026-05-20', due_date: '2026-05-20', priority: 'medium' },
    { id: 'no-date', title: 'No date', priority: 'medium' },
    { id: 'done', title: 'Done task', due_date: '2026-05-20', progress: 'completed', priority: 'low' }
], new RealDate('2026-05-13T12:00:00'));
const arrangedCalendarDayHtml = context.renderTaskCalendarDay(new RealDate('2026-05-21T00:00:00'), 4, [
    { id: 'arranged-same-start', title: 'Arranged same start', start_date: '2026-05-21', arranged_date: '2026-05-21', priority: 'medium' },
    { id: 'arranged-only', title: 'Arranged only', start_date: '2026-05-18', arranged_date: '2026-05-21', priority: 'medium' }
], new RealDate('2026-05-13T12:00:00'));
const startOnlyItemHtml = getCalendarItemHtml(calendarDayHtml, 'start-only');
assert('Task Calendar start_date task uses green start class', /class="[^"]*task-calendar-item start[^"]*"[^>]*data-task-id="start-only"/.test(calendarDayHtml)
    && startOnlyItemHtml.includes('Start only')
    && startOnlyItemHtml.includes('开始'));
const dueOnlyItemHtml = getCalendarItemHtml(calendarDayHtml, 'due-only');
assert('Task Calendar due_date task uses red due class', dueOnlyItemHtml.includes('task-calendar-item due')
    && dueOnlyItemHtml.includes('Due only')
    && dueOnlyItemHtml.includes('结束'));
assert('Task Calendar same-day start and due renders once as due', (() => {
    const sameCount = (calendarDayHtml.match(/data-task-id="same-day"/g) || []).length;
    return sameCount === 1 && getCalendarItemHtml(calendarDayHtml, 'same-day').includes('task-calendar-item due');
})());
assert('Task Calendar same-day start and arranged renders once as arranged', (() => {
    const sameCount = (arrangedCalendarDayHtml.match(/data-task-id="arranged-same-start"/g) || []).length;
    return sameCount === 1 && /class="[^"]*task-calendar-item arranged[^"]*"[^>]*data-task-id="arranged-same-start"/.test(arrangedCalendarDayHtml);
})());
assert('Task Calendar arranged_date task uses arranged class', getCalendarItemHtml(arrangedCalendarDayHtml, 'arranged-only').includes('task-calendar-item arranged')
    && getCalendarItemHtml(arrangedCalendarDayHtml, 'arranged-only').includes('安排'));
assert('Task Calendar omits no-date tasks and marks completed tasks', !calendarDayHtml.includes('data-task-id="no-date"')
    && getCalendarItemHtml(calendarDayHtml, 'done').includes('task-calendar-item due completed'));
assert('Task Calendar adjacent month boundary dates render only in their own month sections',
    (mayCalendarHtml.match(/data-date="2026-05-31"/g) || []).length === 1
    && !mayCalendarHtml.includes('data-date="2026-06-01"')
    && !juneCalendarHtml.includes('data-date="2026-05-31"')
    && (juneCalendarHtml.match(/data-date="2026-06-01"/g) || []).length === 1);
assert('Task Calendar cross-month task renders start and due on separate natural dates',
    getCalendarItemHtml(mayCalendarHtml, 'cross-month').includes('task-calendar-item start')
    && getCalendarItemHtml(mayCalendarHtml, 'cross-month').includes('开始')
    && getCalendarItemHtml(juneCalendarHtml, 'cross-month').includes('task-calendar-item due')
    && getCalendarItemHtml(juneCalendarHtml, 'cross-month').includes('结束'));
assert('Task Calendar task click delegates to existing detail panel', scriptJs.includes("getElementById('taskCalendarView')")
    && scriptJs.includes("closest('.task-calendar-item')")
    && scriptJs.includes('openDetailPanel(taskId)'));
assert('No-plan state hides Calendar view with Board/List', scriptJs.includes("getElementById('taskCalendarView')")
    && scriptJs.includes("calendar.style.display = 'none'"));

assert('Task Board columns use unified compact desktop width with room for five buckets', boardCss.includes('6 列紧凑基准')
    && boardCss.includes('width: calc((100% - 80px) / 6);')
    && boardCss.includes('min-width: 160px;')
    && !boardCss.includes('4 列铺满可视区')
    && !boardCss.includes('width: calc((100% - 48px) / 4);'));

context.TaskApp.groupBy = 'bucket';
context.TaskApp.viewMode = 'plan';
const bucketColumnHtml = context.renderColumnHTML({ key: 'bucket_12', title: '作业', bucketId: 12, tasks: [] });
assert('bucket grouping uses Planner-like column header and add row', bucketColumnHtml.includes('planner-column')
    && bucketColumnHtml.includes('planner-add-row')
    && bucketColumnHtml.includes('添加任务'));
assert('bucket grouping renders rename/delete menu trigger only for concrete Plan buckets', bucketColumnHtml.includes('bucket-menu-btn')
    && bucketColumnHtml.includes('data-bucket-id="12"'));

context.TaskApp.groupBy = 'due_date';
context.TaskApp.viewMode = 'plan';
const dueColumnHtml = context.renderColumnHTML({ key: 'today', title: 'Today', icon: 'today', tasks: [] });
assert('due_date grouping uses the same Planner-like add row style', dueColumnHtml.includes('planner-column')
    && dueColumnHtml.includes('planner-add-row')
    && dueColumnHtml.includes('添加任务'));
assert('due_date grouping does not render bucket rename/delete menu trigger', !dueColumnHtml.includes('bucket-menu-btn'));

const dueDateGrouped = context.groupTasks([
    { id: 'overdue', title: 'Overdue task', due_date: '2026-05-12' },
    { id: 'today', title: 'Today task', due_date: '2026-05-13' },
    { id: 'tomorrow', title: 'Tomorrow task', due_date: '2026-05-14' },
    { id: 'this-week', title: 'This week task', due_date: '2026-05-17' },
    { id: 'next-week-mon', title: 'Next week Monday task', due_date: '2026-05-18' },
    { id: 'next-week-sun', title: 'Next week Sunday task', due_date: '2026-05-24' },
    { id: 'future', title: 'Future task', due_date: '2026-05-25' },
    { id: 'no-date', title: 'No date task' }
], 'due_date');
assert('due_date grouping includes Next week between This week and Future',
    Array.from(dueDateGrouped.keys()).join(',') === 'overdue,today,tomorrow,this_week,next_week,future,no_date');
assert('due_date grouping classifies natural week ranges',
    dueDateGrouped.get('overdue').tasks.map(task => task.id).join(',') === 'overdue'
    && dueDateGrouped.get('today').tasks.map(task => task.id).join(',') === 'today'
    && dueDateGrouped.get('tomorrow').tasks.map(task => task.id).join(',') === 'tomorrow'
    && dueDateGrouped.get('this_week').tasks.map(task => task.id).join(',') === 'this-week'
    && dueDateGrouped.get('next_week').tasks.map(task => task.id).join(',') === 'next-week-mon,next-week-sun'
    && dueDateGrouped.get('future').tasks.map(task => task.id).join(',') === 'future'
    && dueDateGrouped.get('no_date').tasks.map(task => task.id).join(',') === 'no-date');

context.TaskApp.groupBy = 'priority';
const priorityGrouped = context.groupTasks([
    { id: 'late', title: 'Late', priority: 'urgent', due_date: '2026-05-30' },
    { id: 'none', title: 'No date', priority: 'urgent' },
    { id: 'early', title: 'Early', priority: 'urgent', due_date: '2026-05-10' }
], 'priority');
assert('grouped column tasks default sort by due_date with no-date last',
    priorityGrouped.get('urgent').tasks.map(task => task.id).join(',') === 'early,late,none');

context.TaskApp.currentPlanBuckets = [{ id: 12, name: '作业' }];
const bucketGrouped = context.groupTasks([
    { id: 'b2', title: 'Bucket late', bucket_id: 12, due_date: '2026-06-01' },
    { id: 'b1', title: 'Bucket early', bucket_id: 12, due_date: '2026-04-01' }
], 'bucket');
assert('bucket grouped column tasks also sort by due_date',
    bucketGrouped.get('bucket_12').tasks.map(task => task.id).join(',') === 'b1,b2');
assert('Task Board column header exposes group focus target without adding all-groups UI', (() => {
    const html = context.renderColumnHTML({ key: 'today', title: 'Today', icon: 'today', tasks: [] });
    return html.includes('data-group-focus-target="true"')
        && html.includes('data-column-key="today"')
        && html.includes('role="button"')
        && !html.includes('全部分组')
        && !html.includes('All groups');
})());

assert('Task Board render focuses one selected group column only', (() => {
    const originalDocument = context.document;
    const elements = {
        kanbanBoard: { innerHTML: '' },
        btnGroupBy: { innerHTML: '' },
        btnFilter: { classList: { toggle() {} } }
    };
    context.document = {
        createElement: originalDocument.createElement,
        getElementById: id => elements[id] || null,
        querySelector: selector => ['.bc-parent', '.bc-sep', '.bc-current'].includes(selector)
            ? { textContent: '', style: {} }
            : null
    };
    context.TaskApp.getFilteredTasks = () => [
        { id: 'today', title: 'Today task', due_date: '2026-05-13', priority: 'medium' },
        { id: 'future', title: 'Future task', due_date: '2026-05-25', priority: 'medium' }
    ];
    context.TaskApp.hasActiveFilters = () => false;
    context.TaskApp.getViewTitle = () => 'My Tasks';
    context.TaskApp.getBreadcrumbParent = () => '';
    context.TaskApp.groupBy = 'due_date';
    context.TaskApp.focusedGroupKey = null;
    context.renderKanbanBoard();
    const allHtml = elements.kanbanBoard.innerHTML;
    context.TaskApp.focusedGroupKey = 'today';
    context.renderKanbanBoard();
    const focusedHtml = elements.kanbanBoard.innerHTML;
    context.TaskApp.focusedGroupKey = 'missing';
    context.renderKanbanBoard();
    const invalidHtml = elements.kanbanBoard.innerHTML;
    const invalidCleared = context.TaskApp.focusedGroupKey === null;
    context.document = originalDocument;
    return countOccurrences(allHtml, 'data-column-key=') === 7
        && countOccurrences(focusedHtml, 'data-column-key=') === 1
        && focusedHtml.includes('data-column-key="today"')
        && focusedHtml.includes('Today task')
        && !focusedHtml.includes('Future task')
        && invalidCleared
        && countOccurrences(invalidHtml, 'data-column-key=') === 7;
})());

context.TaskApp.plans = [{ id: 'plan-eng', name: 'English Language Acquisition' }];
context.TimeWhereManageBac = { isManageBacTask: task => task.source === 'managebac' };
const manageBacCardHtml = context.createTaskCardHTML({
    id: 'mb-1',
    title: 'ManageBac sourced task',
    plan_id: 'plan-eng',
    progress: 'not_started',
    priority: 'medium',
    source: 'managebac',
    start_date: '2026-05-18',
    due_date: '2026-05-20'
});
assert('Plan/My Tasks task card shows start_date when present',
    manageBacCardHtml.includes('task-start-badge')
    && manageBacCardHtml.includes('开始 5/18')
    && manageBacCardHtml.includes('play_arrow'));
assert('ManageBac task card shows TimeWhere Plan name where source text used to appear',
    manageBacCardHtml.includes('English Language Acquisition')
    && manageBacCardHtml.includes('status-plan')
    && !manageBacCardHtml.includes('<span class="task-status-badge">ManageBac</span>'));
assert('ManageBac task card uses local MB icon in top-right source marker',
    manageBacCardHtml.includes('task-source-managebac')
    && manageBacCardHtml.includes('../../shared/images/managebac-icon.png')
    && manageBacCardHtml.includes('title="ManageBac"'));
assert('Task card exposes Planner-like more menu copy action entry point',
    manageBacCardHtml.includes('task-card-menu-btn')
    && manageBacCardHtml.includes('more_horiz')
    && boardJs.includes('data-task-menu-action="copy"')
    && boardJs.includes('复制任务'));
assert('Task action menu exposes partial complete for ManageBac tasks too',
    boardJs.includes('data-task-menu-action="partial-complete"')
    && boardJs.includes('部分完成')
    && !/!\s*isManageBacTask\s*\?\s*`[\s\S]*data-task-menu-action="partial-complete"/.test(boardJs));
assert('Board and List no longer expose inline progress toggle buttons',
    !manageBacCardHtml.includes('task-progress-btn')
    && !boardJs.includes('task-progress-btn')
    && !boardJs.includes('task-list-progress-btn')
    && !boardCss.includes('.task-progress-btn')
    && !boardCss.includes('.task-list-progress-btn'));
assert('Board/List event delegation no longer handles progress toggle shortcuts',
    !scriptJs.includes("closest('.task-progress-btn')")
    && !scriptJs.includes("closest('.task-list-progress-btn')")
    && !boardJs.includes('function cycleTaskProgress'));
assert('Task card displays recurrence badge when task belongs to series', (() => {
    const html = context.createTaskCardHTML({
        id: 'recurring-1',
        title: 'Weekly review',
        progress: 'not_started',
        priority: 'medium',
        recurrence_series_id: 'series-1',
        recurrence_frequency: 'weekly',
        recurrence_index: 3,
        recurrence_count: 12
    });
    return html.includes('每周 3/12') && html.includes('task-recurrence-badge');
})());

const normalCardHtml = context.createTaskCardHTML({
    id: 'task-1',
    title: 'Normal task',
    plan_id: 'plan-eng',
    progress: 'not_started',
    priority: 'medium',
    due_date: '2026-05-20'
});
assert('Plan/My Tasks task card omits empty start_date badge', !normalCardHtml.includes('task-start-badge'));
assert('normal task card does not render ManageBac source icon', !normalCardHtml.includes('task-source-managebac'));
assert('Plan/My Tasks task card keeps due date badge while adding start date support',
    manageBacCardHtml.includes('task-due-badge')
    && manageBacCardHtml.includes('5/20'));

assert('Task card menu click is handled before card detail open', /task-card-menu-btn[\s\S]*stopPropagation\(\)[\s\S]*showTaskActionMenu\(taskMenuBtn\)[\s\S]*closest\('\.task-card'\)/.test(scriptJs));
assert('Task action menu delegates copy to copy dialog', scriptJs.includes("closest('[data-task-menu-action]')")
    && scriptJs.includes("taskMenuAction.dataset.taskMenuAction === 'copy'")
    && scriptJs.includes('await showCopyTaskDialog(taskId)'));
assert('Task action menu delegates partial complete to the shared floating panel',
    scriptJs.includes("taskMenuAction.dataset.taskMenuAction === 'partial-complete'")
    && scriptJs.includes('const actionRect = taskMenuAction.getBoundingClientRect()')
    && scriptJs.includes('await openPartialCompleteDialog(taskId, actionRect)'));
assert('Task detail panel exposes same copy menu action', detailPanelJs.includes('task-detail-menu-btn')
    && detailPanelJs.includes('more_horiz')
    && scriptJs.includes("closest('.task-detail-menu-btn')"));
assert('Task detail supports recurrence creation and scoped edits',
    detailPanelJs.includes('data-recurrence-section')
    && detailPanelJs.includes('data-field="recurrence_scope"')
    && detailPanelJs.includes('本次及之后')
    && detailPanelJs.includes('TimeWhereDB.createRecurringTaskSeriesFromTask')
    && detailPanelJs.includes('TimeWhereDB.updateRecurringTaskScope'));
assert('Task detail places Checklist before recurrence settings',
    detailPanelJs.indexOf('<!-- Checklist -->') !== -1
    && detailPanelJs.indexOf('data-recurrence-section') !== -1
    && detailPanelJs.indexOf('<!-- Checklist -->') < detailPanelJs.indexOf('data-recurrence-section'));
assert('Task detail supports resizing recurring series count',
    detailPanelJs.includes('data-field="recurrence_resize_count"')
    && detailPanelJs.includes('min="2" max="12"')
    && detailPanelJs.includes('data-action="resize-recurrence"')
    && detailPanelJs.includes('TimeWhereDB.resizeRecurringTaskSeries(taskId, count)')
    && boardCss.includes('.recurrence-resize-panel'));
assert('Task detail recurring delete dialog supports single future and all scopes',
    detailPanelJs.includes('删除本次')
    && detailPanelJs.includes('删除本次及之后')
    && detailPanelJs.includes('删除全部')
    && detailPanelJs.includes('TimeWhereDB.deleteRecurringTaskScope'));

const copiedPayload = context.buildCopiedTaskPayload({
    id: 'mb-source',
    title: 'ManageBac source',
    plan_id: 'plan-eng',
    bucket_id: 12,
    progress: 'completed',
    status: 'completed',
    priority: 'urgent',
    start_date: '2026-05-18',
    due_date: '2026-05-20',
    deadline: '2026-05-20',
    labels: [7],
    notes: 'Source notes',
    checklist: [{
        id: 'old-1',
        title: 'Read',
        checked: true,
        type: 'partial_completion',
        partial_group_id: 'partial-1',
        partial_role: 'done',
        partial_percent: 30
    }],
    schedule_time: '19:00',
    duration: 60,
    completed_at: '2026-05-19T10:00:00.000Z',
    source: 'managebac',
    source_type: 'managebac_ics',
    source_uid: 'uid-1',
    source_url: 'https://managebac.example/task',
    managebac_subject: 'English',
    readonly: true,
    synced_at: '2026-05-19T09:00:00.000Z',
    google_task_id: 'google-1'
}, {
    title: 'Copied title',
    bucket_id: 12,
    copyDates: true,
    copyNotes: true,
    copyChecklist: true,
    copyLabels: true
});
assert('copied task resets execution state and checklist checked values',
    copiedPayload.title === 'Copied title'
    && copiedPayload.progress === 'not_started'
    && copiedPayload.status === 'pending'
    && copiedPayload.completed_at === null
    && copiedPayload.checklist.length === 1
    && copiedPayload.checklist[0].checked === false
    && copiedPayload.checklist[0].id !== 'old-1'
    && copiedPayload.checklist[0].type === 'partial_completion'
    && copiedPayload.checklist[0].partial_group_id === 'partial-1'
    && copiedPayload.checklist[0].partial_percent === 30);
assert('copied ManageBac task becomes a normal local task',
    copiedPayload.source === null
    && copiedPayload.source_type === null
    && copiedPayload.source_uid === null
    && copiedPayload.source_url === null
    && copiedPayload.managebac_subject === null
    && copiedPayload.readonly === false
    && copiedPayload.synced_at === null
    && copiedPayload.google_task_id === null);
assert('copied task keeps selected same-plan fields by default',
    copiedPayload.plan_id === 'plan-eng'
    && copiedPayload.bucket_id === 12
    && copiedPayload.priority === 'urgent'
    && copiedPayload.start_date === '2026-05-18'
    && copiedPayload.due_date === '2026-05-20'
    && copiedPayload.deadline === '2026-05-20'
    && copiedPayload.notes === 'Source notes'
    && copiedPayload.labels.join(',') === '7');
assert('copy task dialog can create a recurring copied task series',
    dialogsJs.includes('copyTaskRecurrenceFrequency')
    && dialogsJs.includes('copyTaskRecurrenceCount')
    && dialogsJs.includes('TimeWhereDB.addRecurringTaskSeries(payload'));
const copiedNoDatesPayload = context.buildCopiedTaskPayload({
    title: 'No date copy',
    plan_id: 'plan-eng',
    start_date: '2026-05-18',
    due_date: '2026-05-20',
    deadline: '2026-05-20',
    notes: 'Skip',
    labels: [1],
    checklist: [{ id: 'old-2', title: 'Skip me', checked: true }]
}, {
    title: 'No dates copied',
    copyDates: false,
    copyNotes: false,
    copyChecklist: false,
    copyLabels: false
});
assert('copy options can omit dates and optional content before addTask normalization',
    copiedNoDatesPayload.start_date === undefined
    && copiedNoDatesPayload.due_date === undefined
    && copiedNoDatesPayload.deadline === undefined
    && copiedNoDatesPayload.notes === ''
    && copiedNoDatesPayload.labels.length === 0
    && copiedNoDatesPayload.checklist.length === 0);

assert('DB exposes recurring task series helpers and validates count limit', dbJs.includes('async addRecurringTaskSeries')
    && dbJs.includes('async createRecurringTaskSeriesFromTask')
    && dbJs.includes('async updateRecurringTaskScope')
    && dbJs.includes('async deleteRecurringTaskScope')
    && dbJs.includes('async resizeRecurringTaskSeries')
    && dbJs.includes('count < 2 || count > 12'));
assert('DB ManageBac edit boundary allows local execution fields only',
    dbJs.includes('isManageBacLocalStatusUpdate(data = {})')
    && ['notes', 'description', 'schedule_time', 'duration', 'checklist', 'labels', 'bucket_id'].every(field => dbJs.includes(`'${field}'`))
    && dbJs.includes('ManageBac 来源任务不能创建周期任务')
    && dbJs.includes('ManageBac 来源任务不能调整周期任务'));
assert('DB recurring series lookup avoids schema migration for recurrence index',
    dbJs.includes('const allTasks = await db.tasks.toArray()')
    && dbJs.includes('item.recurrence_series_id === task.recurrence_series_id')
    && !/where\(['"]recurrence_series_id['"]\)/.test(dbJs));
assert('DB monthly recurrence clamps to month end without drifting anchor', dbJs.includes('addMonthsClampedISO')
    && dbJs.includes('new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()')
    && dbJs.includes('Math.min(day, lastDay)'));
assert('DB recurring tasks write series metadata onto task records', dbJs.includes('recurrence_series_id')
    && dbJs.includes('recurrence_index')
    && dbJs.includes('recurrence_count')
    && dbJs.includes('recurrence_frequency')
    && dbJs.includes('recurrence_anchor_start_date')
    && dbJs.includes('recurrence_anchor_due_date')
    && dbJs.includes('if (task.recurrence_series_id)')
    && dbJs.includes('Object.assign(newTask'));
assert('Recurring edit scope shifts target dates by delta instead of regenerating series',
    dbJs.includes('buildRecurringScopedUpdates')
    && dbJs.includes('getDayDeltaISO')
    && dbJs.includes('this.addDaysISO(targetTask.start_date, startDelta)')
    && dbJs.includes('this.addDaysISO(targetTask.due_date || targetTask.deadline, dueDelta)'));
assert('Recurring resize appends tail instances from anchor dates',
    dbJs.includes('currentMaxIndex + 1')
    && dbJs.includes('this.getRecurrenceDate(anchorStartDate, frequency, offset)')
    && dbJs.includes('this.getRecurrenceDate(anchorDueDate, frequency, offset)')
    && dbJs.includes('recurrence_index: index')
    && dbJs.includes('recurrence_count: targetCount'));
assert('Recurring resize only deletes unfinished tail instances and updates remaining count',
    dbJs.includes('(item.recurrence_index || 1) > targetCount')
    && dbJs.includes("item.progress === 'completed' || !!item.completed_at")
    && dbJs.includes('不能减少到该次数')
    && dbJs.includes('await this.deleteTask(tailTask.id, options)')
    && dbJs.includes('{ recurrence_count: targetCount }'));
assert('Checklist updates derive task progress semantics in DB layer',
    dbJs.includes('getChecklistProgressUpdate')
    && dbJs.includes("return { progress: 'not_started', status: 'pending', completed_at: null }")
    && dbJs.includes("progress: 'in_progress', status: 'in_progress', completed_at: null")
    && dbJs.includes("progress: 'completed'")
    && dbJs.includes('Object.assign(updateData, this.getChecklistProgressUpdate(data.checklist, existingTask))'));
assert('Checklist progress derivation skips empty checklist and explicit progress changes',
    dbJs.includes('checklist.length === 0') &&
    dbJs.includes("!Object.prototype.hasOwnProperty.call(data, 'progress')") &&
    dbJs.includes("!Object.prototype.hasOwnProperty.call(data, 'status')"));
assert('Detail checklist checkbox updates current task only even for recurring tasks',
    detailPanelJs.includes('await TimeWhereDB.updateChecklist(taskId, checklist)')
    && !/checklist-checkbox[\s\S]*?await updateTaskFromDetail\(\{ checklist \}\)/.test(detailPanelJs));
assert('Partial complete helper marks system checklist items with metadata', (() => {
    const checklist = context.buildPartialCompletionChecklist(30);
    return checklist.length === 2
        && checklist[0].title === '已完成占比 30%'
        && checklist[0].checked === true
        && checklist[0].type === 'partial_completion'
        && checklist[0].partial_role === 'done'
        && checklist[0].partial_percent === 30
        && checklist[1].title === '未完成占比 70%'
        && checklist[1].checked === false
        && checklist[1].partial_group_id === checklist[0].partial_group_id;
})());
assert('Partial complete helper updates existing ratio checklist without duplicate ids', (() => {
    const original = context.buildPartialCompletionChecklist(30);
    const group = context.findPartialCompletionGroup(original);
    const updated = context.buildPartialCompletionChecklist(80, group);
    return updated.length === 2
        && updated[0].id === original[0].id
        && updated[1].id === original[1].id
        && updated[0].title === '已完成占比 80%'
        && updated[1].title === '未完成占比 20%'
        && updated[0].partial_group_id === original[0].partial_group_id
        && context.isPartialCompletionChecklistItem(updated[0]) === true;
})());
assert('Partial complete replacement updates only the existing metadata group', (() => {
    const original = context.buildPartialCompletionChecklist(20);
    const group = context.findPartialCompletionGroup(original);
    const updated = context.buildPartialCompletionChecklist(70, group);
    const next = context.replacePartialCompletionChecklistGroup([
        { id: 'regular', title: 'Normal item', checked: false },
        ...original
    ], group, updated);
    return next.length === 3
        && next[0].id === 'regular'
        && next.filter(item => item.type === 'partial_completion').length === 2
        && next.some(item => item.title === '已完成占比 70%')
        && next.some(item => item.title === '未完成占比 30%');
})());
assert('Partial complete panel supports checklist and ratio immediate save paths',
    detailPanelJs.includes('function openPartialCompleteDialog')
    && detailPanelJs.includes('partial-complete-floating-panel')
    && detailPanelJs.includes('renderPartialCompleteChecklistPanel(task, checklist)')
    && detailPanelJs.includes('renderPartialCompleteRatioPanel(task, partialGroup)')
    && detailPanelJs.includes('data-partial-action="checklist"')
    && detailPanelJs.includes('data-partial-action="ratio"')
    && detailPanelJs.includes('data-mode="checklist"')
    && detailPanelJs.includes('data-mode="ratio"')
    && detailPanelJs.includes('savePartialCompleteRatio')
    && detailPanelJs.includes('savePartialCompleteChecklistItem')
    && detailPanelJs.includes('TimeWhereDB.updateChecklist(taskId, nextChecklist)'));
assert('Partial complete dialog supports ManageBac local checklist writes',
    !detailPanelJs.includes("showToast('ManageBac 来源任务不能使用部分完成', 'error')")
    && detailPanelJs.includes('TimeWhereDB.updateChecklist(taskId, nextChecklist)')
    && detailPanelJs.includes('TimeWhereDB.updateChecklist(taskId, checklist)'));
assert('Task detail notes render safe external HTTP link preview',
    tasksHtml.includes('shared/js/external-links.js')
    && tasksHtml.indexOf('shared/js/platform.js') < tasksHtml.indexOf('shared/js/external-links.js')
    && tasksHtml.indexOf('shared/js/external-links.js') < tasksHtml.indexOf('<script src="detail-panel.js"></script>')
    && detailPanelJs.includes('data-notes-link-preview')
    && detailPanelJs.includes('renderTaskNotesExternalLinks(task.notes || task.description || \'\')')
    && detailPanelJs.includes('refreshTaskNotesExternalLinks(panel, notesEl.value)')
    && detailPanelJs.includes('openTaskNotesExternalLink(linkButton)')
    && externalLinksJs.includes('data-action="open-external-link"')
    && boardCss.includes('.external-link-item'));
assert('Task detail allows ManageBac local execution fields while protecting source facts',
    detailPanelJs.includes('ManageBac 来源标题、截止日期和来源元数据只读')
    && detailPanelJs.includes('const titleEditable = isManageBacTask ? \'false\' : \'true\'')
    && /data-field="due_date"[\s\S]*\$\{sourceDisabledAttr\}/.test(detailPanelJs)
    && /<select class="detail-select" data-field="bucket_id">/.test(detailPanelJs)
    && /data-field="schedule_time"[\s\S]{0,120}>/.test(detailPanelJs)
    && /data-field="duration"[\s\S]{0,140}>/.test(detailPanelJs)
    && /data-field="notes"[\s\S]{0,120}>/.test(detailPanelJs)
    && detailPanelJs.includes('await updateTaskFromDetail({ labels })')
    && detailPanelJs.includes('await updateTaskFromDetail({ checklist: newChecklist })')
    && detailPanelJs.includes("if (input.disabled || (isManageBacTask && field === 'due_date')) return;"));

context.TaskApp.groupBy = 'priority';
context.TaskApp.viewMode = 'plan';
const priorityColumnHtml = context.renderColumnHTML({ key: 'urgent', title: 'Urgent', tasks: [] });
assert('priority grouping uses Planner-like column header and add row without management menu', priorityColumnHtml.includes('planner-column')
    && priorityColumnHtml.includes('planner-add-row')
    && priorityColumnHtml.includes('添加任务')
    && !priorityColumnHtml.includes('bucket-menu-btn'));

context.TaskApp.groupBy = 'progress';
const progressColumnHtml = context.renderColumnHTML({ key: 'not_started', title: 'Not started', icon: 'radio_button_unchecked', tasks: [] });
assert('progress grouping uses Planner-like column header and add row without management menu', progressColumnHtml.includes('planner-column')
    && progressColumnHtml.includes('planner-add-row')
    && progressColumnHtml.includes('添加任务')
    && !progressColumnHtml.includes('bucket-menu-btn'));

context.TaskApp.groupBy = 'labels';
const labelColumnHtml = context.renderColumnHTML({ key: 'label_5', title: 'Writing', labelId: 5, tasks: [] });
assert('labels grouping uses Planner-like column header and add row without management menu', labelColumnHtml.includes('planner-column')
    && labelColumnHtml.includes('planner-add-row')
    && labelColumnHtml.includes('添加任务')
    && !labelColumnHtml.includes('bucket-menu-btn'));

context.TaskApp.groupBy = 'bucket';
context.TaskApp.viewMode = 'my_tasks';
const crossPlanBucketHtml = context.renderColumnHTML({ key: 'bucket_12', title: '作业', bucketId: 12, tasks: [] });
assert('cross-plan bucket grouping does not expose bucket management menu', !crossPlanBucketHtml.includes('bucket-menu-btn'));

const noBucketHtml = context.renderColumnHTML({ key: 'no_bucket', title: 'No bucket', bucketId: null, tasks: [] });
assert('No bucket system column does not expose rename/delete menu', !noBucketHtml.includes('bucket-menu-btn'));

context.TaskApp.groupBy = 'bucket';
context.TaskApp.viewMode = 'my_tasks';
context.TaskApp.currentPlanId = null;
context.normalizeTaskBoardGroupBy();
assert('cross-plan My Tasks cannot stay grouped by bucket', context.TaskApp.groupBy === 'due_date');

context.TaskApp.groupBy = 'bucket';
context.TaskApp.viewMode = 'my_day';
context.normalizeTaskBoardGroupBy();
assert('cross-plan My Day cannot stay grouped by bucket and falls back to progress', context.TaskApp.groupBy === 'progress');

context.TaskApp.groupBy = 'bucket';
context.TaskApp.viewMode = 'plan';
context.TaskApp.currentPlanId = 9;
context.normalizeTaskBoardGroupBy();
assert('concrete Plan view may stay grouped by bucket', context.TaskApp.groupBy === 'bucket');

assert('Group By menu hides Bucket outside concrete Plan views', dialogsJs.includes(".filter(([key]) => key !== 'bucket' || isBucketGroupingAllowed())")
    && dialogsJs.includes("opt.dataset.groupby === 'bucket' && !isBucketGroupingAllowed()"));

assert('bucket menu supports rename and delete actions', boardJs.includes('function showBucketColumnMenu')
    && boardJs.includes('data-bucket-action="rename"')
    && boardJs.includes('data-bucket-action="delete"'));

assert('bucket rename uses updateBucket and rejects empty names', /renameBucketColumn[\s\S]*Bucket 名称不能为空[\s\S]*TimeWhereDB\.updateBucket/.test(boardJs));

const deleteBucketFunction = boardJs.match(/function confirmDeleteBucketColumn[\s\S]*?\n\}/)?.[0] || '';
assert('bucket delete confirms unlink behavior and never deletes tasks directly', deleteBucketFunction.includes('任务不会被删除，会变为 No bucket')
    && deleteBucketFunction.includes('TimeWhereDB.deleteBucket(bucketId)')
    && !deleteBucketFunction.includes('deleteTask'));

assert('Task Board event delegation wires bucket menu actions', scriptJs.includes('showBucketColumnMenu(bucketMenuBtn)')
    && scriptJs.includes('renameBucketColumn(bucketId)')
    && scriptJs.includes('confirmDeleteBucketColumn(bucketId)'));

assert('Plan list items are draggable for manual ordering', sidebarJs.includes('class="context-item plan-link')
    && sidebarJs.includes('draggable="true"')
    && sidebarJs.includes('setupPlanReorderHandlers(container)'));

assert('Plan drag/drop persists order through DB reorderPlans', sidebarJs.includes('dragstart')
    && sidebarJs.includes('dragover')
    && sidebarJs.includes('drop')
    && sidebarJs.includes('reorderPlanNearTarget')
    && sidebarJs.includes('TimeWhereDB.reorderPlans(orderedIds)'));

assert('Plan context menu exposes move top/up/down/bottom fallback actions', sidebarJs.includes('data-action="move_top"')
    && sidebarJs.includes('data-action="move_up"')
    && sidebarJs.includes('data-action="move_down"')
    && sidebarJs.includes('data-action="move_bottom"')
    && sidebarJs.includes("movePlanToSidebarEdge(plan.id, 'top')")
    && sidebarJs.includes('movePlanInSidebar(plan.id, -1)')
    && sidebarJs.includes('movePlanInSidebar(plan.id, 1)')
    && sidebarJs.includes("movePlanToSidebarEdge(plan.id, 'bottom')"));

assert('DB getPlans sorts by sort_order before created_at', dbJs.includes('async getPlans()')
    && dbJs.includes('a.sort_order')
    && dbJs.includes('Number.MAX_SAFE_INTEGER')
    && dbJs.includes("localeCompare(b.created_at || '')"));

assert('DB addPlan assigns new plans to the end of current order', dbJs.includes('baseSortOrder')
    && dbJs.includes('sort_order: plan.sort_order ?? baseSortOrder'));

assert('DB exposes reorderPlans without schema migration', dbJs.includes('async reorderPlans(orderedIds)')
    && dbJs.includes('sort_order: i')
    && !/db\.version\(5\)\.stores\(\{[^;]*sort_order/.test(dbJs));

assert('Plan reorder UI has local icon mappings', iconsJs.includes("'arrow_upward'")
    && iconsJs.includes("'arrow_downward'")
    && iconsJs.includes("'vertical_align_top'")
    && iconsJs.includes("'vertical_align_bottom'"));

const createPlanBlock = boardCss.match(/\.btn-create-plan\s*\{([\s\S]*?)\}/)?.[1] || '';
const iconOverrideBlock = iconsJs.match(/const TIMEWHERE_ICON_OVERRIDES = \{([\s\S]*?)\n\};/)?.[1] || '';
const taskIconMatch = iconOverrideBlock.match(/'task':\s*'([^']+)'/);
const calendarIconMatch = iconOverrideBlock.match(/'calendar_today':\s*'([^']+)'/);
assert('Planner Create a plan button uses blue brand accent instead of purple',
    createPlanBlock.includes('background: var(--accent);')
    && !createPlanBlock.includes('background: var(--color-purple);')
    && !/rgba\(124,\s*77,\s*255/.test(createPlanBlock)
    && createPlanBlock.includes('rgba(29, 140, 248, 0.24)'));
assert('Tasks and Calendar navigation icons are distinct local SVG concepts',
    taskIconMatch && calendarIconMatch
    && taskIconMatch[1] !== calendarIconMatch[1]
    && taskIconMatch[1].includes('M8 4H16L18 6V20H6V6L8 4Z')
    && taskIconMatch[1].includes('M9 12L10.5 13.5L14 10')
    && calendarIconMatch[1].includes('<rect x="4" y="6" width="16" height="14"')
    && calendarIconMatch[1].includes('<rect x="8" y="14" width="3" height="3"'));

assert('Plan reorder has visible drag styling and disabled menu styling', boardCss.includes('.plan-link.dragging')
    && boardCss.includes('.plan-link.drag-over')
    && boardCss.includes('.ctx-menu-item:disabled'));

assert('Task Board loads saved preferences before initial plan render', scriptJs.includes('await TaskApp.loadPreferences()')
    && scriptJs.indexOf('await TaskApp.loadPreferences()') < scriptJs.indexOf('await TaskApp.loadMyTasks()'));

assert('Task Board default secondary view is My Tasks', scriptJs.includes('await TaskApp.loadMyTasks()')
    && !scriptJs.includes('await TaskApp.loadPlan(TaskApp.plans[0].id)')
    && /else\s*\{\s*await TaskApp\.loadMyTasks\(\);[\s\S]*?updateSidebarActiveState\('my_tasks'\)/.test(scriptJs));
assert('Planner opening triggers automatic Task Arrange review without confirmation page', tasksHtml.includes('../../shared/js/task-arrange-auto.js')
    && scriptJs.includes('runPlannerTaskArrangeCheck()')
    && scriptJs.includes('TimeWhereTaskArrangeAuto.runTaskArrangeAutoReview')
    && scriptJs.includes("source: 'planner_auto'")
    && !scriptJs.includes('task-arrange.html?source=planner_auto'));

assert('Planner exposes diagnostic snapshot copy action', tasksHtml.includes('id="btnCopyPlannerDebugSnapshot"')
    && tasksHtml.includes('复制 Plan 诊断快照')
    && tasksHtml.includes('诊断快照')
    && boardCss.includes('.planner-debug-snapshot-btn')
    && scriptJs.includes('copyPlannerDebugSnapshot(debugSnapshotBtn)'));

assert('Planner diagnostic snapshot includes task, plan, event, arrange, and DOM context', scriptJs.includes('async function buildPlannerDebugSnapshot()')
    && scriptJs.includes("schema: 'timewhere-planner-debug-v1'")
    && scriptJs.includes('sanitizePlannerTask')
    && scriptJs.includes('sanitizePlannerPlan')
    && scriptJs.includes('sanitizePlannerEvent')
    && scriptJs.includes('sanitizePlannerArrangeChange')
    && scriptJs.includes('change.title || task.title')
    && scriptJs.includes('change.source || task.source')
    && scriptJs.includes('change.old_start_date || task.start_date')
    && scriptJs.includes('getPlannerDomSnapshot')
    && scriptJs.includes('TaskApp.getFilteredTasks()')
    && scriptJs.includes('TimeWhereScheduling.arrangeTasks(TimeWhereDB, now, { apply: false })')
    && scriptJs.includes('navigator.clipboard.writeText(text)'));

assert('Planner diagnostic snapshot redacts private source details and keeps safe setting summaries', scriptJs.includes('has_source_url: Boolean(task.source_url)')
    && !scriptJs.includes('source_url: task.source_url')
    && scriptJs.includes('managebac_pending_event_count')
    && scriptJs.includes('matrixview_subject_mappings')
    && !scriptJs.includes('managebac_ics_url')
    && !scriptJs.includes('managebac_ics_token'));
assert('Shared Task Arrange auto helper runs every open and writes review log', taskArrangeAutoJs.includes("const DIRTY_KEY = 'task_arrange_dirty_at'")
    && taskArrangeAutoJs.includes('async function runTaskArrangeAutoReview')
    && taskArrangeAutoJs.includes('async function shouldRunTaskArrange')
    && taskArrangeAutoJs.includes('return { run: true, dirty: Boolean(dirtyAt), last: last || null }')
    && !taskArrangeAutoJs.includes("reason: 'fresh'")
    && !taskArrangeAutoJs.includes('DEFAULT_INTERVAL_HOURS')
    && taskArrangeAutoJs.includes('appendTaskArrangeReviewRecord')
    && taskArrangeAutoJs.includes('clearTaskArrangeDirty(db)')
    && taskArrangeAutoJs.includes('no_changes: true'));

assert('Shared Task Arrange auto helper no longer performs fresh-window preview fallback', !taskArrangeAutoJs.includes("const preview = await global.TimeWhereScheduling.arrangeTasks(db, now, { apply: false })")
    && taskArrangeAutoJs.includes("const result = await global.TimeWhereScheduling.arrangeTasks(db, now, { apply: true })"));

assert('Task Board preferences are stored in settings', stateJs.includes("const TASK_BOARD_PREFS_KEY = 'task_board_preferences'")
    && stateJs.includes('TimeWhereDB.getSetting(TASK_BOARD_PREFS_KEY)')
    && stateJs.includes('TimeWhereDB.setSetting(TASK_BOARD_PREFS_KEY, this.preferences)'));

assert('Task Board preferences are scoped by plan or aggregate view', stateJs.includes('getPreferenceKey')
    && stateJs.includes('`plan:${planId}`')
    && stateJs.includes('return viewMode ==='));

assert('Task Board restores group and filters after each view load', stateJs.includes("this.applySavedViewPreferences('plan', planId)")
    && stateJs.includes("this.applySavedViewPreferences('my_day')")
    && stateJs.includes("this.applySavedViewPreferences('my_tasks')")
    && stateJs.includes("this.applySavedViewPreferences('my_managebac')"));

assert('Task Board saved bucket group is not applied to cross-plan views', stateJs.includes("viewMode !== 'plan' && this.groupBy === 'bucket'")
    && stateJs.includes('this.groupBy = this.getDefaultGroupBy(viewMode)'));
assert('Task Board group focus is temporary and cleared by navigation and controls',
    stateJs.includes('focusedGroupKey: null')
    && /async loadMyTasks\(\) \{[\s\S]*?this\.focusedGroupKey = null;/.test(stateJs)
    && /async loadPlan\(planId\) \{[\s\S]*?this\.focusedGroupKey = null;/.test(stateJs)
    && /clearFilters\(\) \{[\s\S]*?this\.focusedGroupKey = null;/.test(stateJs)
    && /TaskApp\.groupBy = opt\.dataset\.groupby;[\s\S]*?TaskApp\.focusedGroupKey = null;/.test(dialogsJs)
    && /filterApply'[\s\S]*?TaskApp\.focusedGroupKey = null;/.test(dialogsJs)
    && /TaskApp\.currentView = tab\.dataset\.view;[\s\S]*?TaskApp\.focusedGroupKey = null;/.test(scriptJs));

assert('Task Board group focus click handler runs after task add and bucket menu actions',
    /closest\('\.col-add-task'\)[\s\S]*?showQuickAdd\(column\)[\s\S]*?closest\('\.bucket-menu-btn'\)[\s\S]*?showBucketColumnMenu\(bucketMenuBtn\)[\s\S]*?closest\('\[data-group-focus-target\]'\)/.test(scriptJs)
    && /closest\('\.task-card'\)[\s\S]*?openDetailPanel\(taskId\)[\s\S]*?closest\('\.col-add-task'\)/.test(scriptJs)
    && /TaskApp\.focusedGroupKey !== groupKey[\s\S]*?TaskApp\.focusedGroupKey = groupKey[\s\S]*?TaskApp\.renderBoard\(\)/.test(scriptJs));

assert('Planner visible sidebar label is My ManageBac', tasksHtml.includes('My ManageBac') && stateJs.includes("return 'My ManageBac'"));

assert('Planner top toolbar no longer owns ManageBac sync button', !tasksHtml.includes('btnSyncManageBac'));

assert('Planner sidebar owns ManageBac sync and pending count controls', tasksHtml.includes('id="sidebarSyncManageBacBtn"')
    && tasksHtml.includes('id="managebacPendingCountBtn"')
    && /sidebarSyncManageBacBtn[\s\S]*sync[\s\S]*同步/.test(tasksHtml));

assert('Planner my ManageBac opening no longer runs six-hour automatic sync', !scriptJs.includes('checkManageBacSyncWhenOpening()')
    && scriptJs.includes('refreshManageBacPendingCount()'));

assert('Planner manual ManageBac sync forces refresh and persists pending rows', scriptJs.includes('force: true')
    && scriptJs.includes('savePendingEventMappings')
    && !scriptJs.includes('management_review_pending'));

assert('Planner manual ManageBac sync does not open confirmation when no new task exists',
    scriptJs.includes('pendingRows.length === 0')
    && scriptJs.includes('ManageBac 没有新增任务')
    && /pendingRows\.length === 0[\s\S]*return;[\s\S]*openManageBacPendingConfirmation\(\)/.test(scriptJs));

assert('Planner supports opening task detail from task_id URL parameter', scriptJs.includes('function getInitialTaskIdFromUrl')
    && scriptJs.includes("new URLSearchParams(window.location.search).get('task_id')")
    && scriptJs.includes('await TaskApp.loadMyTasks()')
    && scriptJs.includes('openDetailPanel(initialTaskId)'));

assert('Filter apply and clear persist preferences', dialogsJs.includes('await TaskApp.saveCurrentViewPreferences();')
    && /filterApply'[\s\S]*?await TaskApp\.saveCurrentViewPreferences/.test(dialogsJs)
    && /filterClear'[\s\S]*?await TaskApp\.saveCurrentViewPreferences/.test(dialogsJs));

assert('Group By changes persist preferences', dialogsJs.includes("menu.addEventListener('click', async")
    && /TaskApp\.groupBy = opt\.dataset\.groupby;[\s\S]*?await TaskApp\.saveCurrentViewPreferences/.test(dialogsJs));

console.log('\n' + '='.repeat(44));
console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
if (failed > 0) process.exit(1);





