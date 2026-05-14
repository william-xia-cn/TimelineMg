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
const sidebarJs = fs.readFileSync(path.join(root, 'extension', 'pages', 'tasks', 'sidebar.js'), 'utf8');
const stateJs = fs.readFileSync(path.join(root, 'extension', 'pages', 'tasks', 'state.js'), 'utf8');
const scriptJs = fs.readFileSync(path.join(root, 'extension', 'pages', 'tasks', 'script.js'), 'utf8');
const tasksHtml = fs.readFileSync(path.join(root, 'extension', 'pages', 'tasks', 'tasks.html'), 'utf8');
const dbJs = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'db.js'), 'utf8');
const iconsJs = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'icons.js'), 'utf8');
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

console.log('\nTimeWhere Task Board tests\n' + '='.repeat(44));

const context = {
    console,
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
    requestAnimationFrame: (fn) => fn(),
    TaskApp: {
        groupBy: 'due_date',
        currentPlanBuckets: [],
        plans: [],
        getBucketName: () => '',
        getLabelInfo: () => null
    },
    TimeWhereDB: {},
    TimeWhereManageBac: null
};
vm.runInNewContext(boardJs, context);

assert('manual task payload requires due_date', (() => {
    try {
        context.normalizeManualTaskPayload({ title: 'No date' });
        return false;
    } catch (error) {
        return error.message === '请选择截止日期';
    }
})());

const normalized = context.normalizeManualTaskPayload({
    title: 'With due date',
    due_date: '2026-05-20',
    start_date: null
});
assert('manual task start_date defaults to due_date', normalized.start_date === '2026-05-20');

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

assert('quick-add creation uses normalized manual payload before addTask', /TimeWhereDB\.addTask\(normalizeManualTaskPayload\(payload\)\)/.test(boardJs));

assert('quick-add prevents duplicate forms while async bucket options load', boardJs.includes('dataset.quickAddOpening')
    && boardJs.includes("delete columnEl.dataset.quickAddOpening"));

assert('quick-add has a visible missing due_date error path', boardJs.includes('请选择截止日期')
    && boardJs.includes('showQuickAddError(form, error.message'));

assert('quick-add renders required due date input when needed', /data-field="due_date" required/.test(boardJs));

assert('quick-add renders bucket selector for due_date and other groupings', boardJs.includes('showBucketSelect')
    && boardJs.includes('renderQuickAddBucketOptions'));

assert('quick-add form has compact inline styling', /\.quick-add-form/.test(boardCss)
    && /\.quick-add-error/.test(boardCss)
    && /\.quick-add-actions/.test(boardCss));

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

context.TaskApp.plans = [{ id: 'plan-eng', name: 'English Language Acquisition' }];
context.TimeWhereManageBac = { isManageBacTask: task => task.source === 'managebac' };
const manageBacCardHtml = context.createTaskCardHTML({
    id: 'mb-1',
    title: 'ManageBac sourced task',
    plan_id: 'plan-eng',
    progress: 'not_started',
    priority: 'medium',
    source: 'managebac',
    due_date: '2026-05-20'
});
assert('ManageBac task card shows TimeWhere Plan name where source text used to appear',
    manageBacCardHtml.includes('English Language Acquisition')
    && manageBacCardHtml.includes('status-plan')
    && !manageBacCardHtml.includes('<span class="task-status-badge">ManageBac</span>'));
assert('ManageBac task card uses local MB icon in top-right source marker',
    manageBacCardHtml.includes('task-source-managebac')
    && manageBacCardHtml.includes('../../shared/images/managebac-icon.png')
    && manageBacCardHtml.includes('title="ManageBac"'));

const normalCardHtml = context.createTaskCardHTML({
    id: 'task-1',
    title: 'Normal task',
    plan_id: 'plan-eng',
    progress: 'not_started',
    priority: 'medium',
    due_date: '2026-05-20'
});
assert('normal task card does not render ManageBac source icon', !normalCardHtml.includes('task-source-managebac'));

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
    && !dbJs.includes('db.version(5)'));

assert('Plan reorder UI has local icon mappings', iconsJs.includes("'arrow_upward'")
    && iconsJs.includes("'arrow_downward'")
    && iconsJs.includes("'vertical_align_top'")
    && iconsJs.includes("'vertical_align_bottom'"));

assert('Plan reorder has visible drag styling and disabled menu styling', boardCss.includes('.plan-link.dragging')
    && boardCss.includes('.plan-link.drag-over')
    && boardCss.includes('.ctx-menu-item:disabled'));

assert('Task Board loads saved preferences before initial plan render', scriptJs.includes('await TaskApp.loadPreferences()')
    && scriptJs.indexOf('await TaskApp.loadPreferences()') < scriptJs.indexOf('await TaskApp.loadPlan(TaskApp.plans[0].id)'));

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

assert('Planner visible sidebar label is my ManageBac', tasksHtml.includes('my ManageBac') && stateJs.includes("return 'my ManageBac'"));

assert('Planner top toolbar no longer owns ManageBac sync button', !tasksHtml.includes('btnSyncManageBac'));

assert('Planner sidebar owns ManageBac sync and pending count controls', tasksHtml.includes('id="sidebarSyncManageBacBtn"')
    && tasksHtml.includes('id="managebacPendingCountBtn"')
    && /sidebarSyncManageBacBtn[\s\S]*sync[\s\S]*同步/.test(tasksHtml));

assert('Planner my ManageBac stale check uses six-hour freshness window', scriptJs.includes('isManageBacSyncFresh(config, new Date(), 6)')
    && scriptJs.includes('checkManageBacSyncWhenOpening()'));

assert('Planner manual ManageBac sync forces refresh and persists pending rows', scriptJs.includes('force: true')
    && scriptJs.includes('savePendingEventMappings')
    && scriptJs.includes('pending_event_mappings'));

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
