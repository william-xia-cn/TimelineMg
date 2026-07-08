const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(name, condition) {
    if (condition) {
        passed++;
        console.log(`  PASS ${name}`);
    } else {
        failed++;
        console.log(`  FAIL ${name}`);
    }
}

function assertEqual(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    assert(`${name} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`, ok);
}

function loadCalendarHelpers() {
    const context = {
        console,
        window: {},
        document: {
            addEventListener() {},
            getElementById() { return null; },
            querySelectorAll() { return []; },
            querySelector() { return null; },
            createElement() { return { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} } }; },
            body: { appendChild() {} }
        },
        localStorage: {
            getItem() { return null; },
            removeItem() {},
            setItem() {}
        },
        setInterval() { return 0; },
        clearInterval() {},
        setTimeout() { return 0; },
        clearTimeout() {},
        confirm() { return true; },
        URLSearchParams,
        Date
    };
    vm.createContext(context);
    const schedulingSource = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'scheduling.js'), 'utf8');
    vm.runInContext(schedulingSource, context, { filename: 'scheduling.js' });
    const calendarSource = fs.readFileSync(path.join(root, 'extension', 'pages', 'calendar', 'script.js'), 'utf8');
    vm.runInContext(calendarSource, context, { filename: 'calendar-script.js' });
    return context.window.TimeWhereCalendarTest;
}

async function run() {
    console.log('\nTimeWhere Calendar tests\n' + '='.repeat(32));

    const helpers = loadCalendarHelpers();

    const weeklyEvent = {
        id: 'event-weekly',
        title: 'Weekly study sync',
        date: '2026-05-12',
        time_start: '09:00',
        time_end: '10:00',
        source: 'manual',
        repeat: 'weekly',
        repeat_days: [2]
    };
    const noneEvent = {
        id: 'event-none',
        title: 'One date event',
        date: '2026-05-13',
        time_start: '11:00',
        time_end: '12:00',
        source: 'manual',
        repeat: 'none'
    };
    const customEvent = {
        id: 'event-custom',
        title: 'Custom days event',
        date: '2026-05-11',
        time_start: '14:00',
        time_end: '15:00',
        source: 'manual',
        repeat: 'custom',
        repeat_days: [1, 3]
    };

    const expanded = helpers.expandEventsForDateRange([weeklyEvent, noneEvent, customEvent], '2026-05-11', '2026-05-26');
    const weeklyDates = expanded.filter(event => event.id === 'event-weekly').map(event => event.date);
    assertEqual('weekly schedule event expands at render time', weeklyDates, ['2026-05-12', '2026-05-19', '2026-05-26']);
    const noneDates = expanded.filter(event => event.id === 'event-none').map(event => event.date);
    assertEqual('non-repeating schedule event renders only on original date', noneDates, ['2026-05-13']);
    const customDates = expanded.filter(event => event.id === 'event-custom').map(event => event.date);
    assertEqual('custom repeat schedule event expands on selected days', customDates, ['2026-05-11', '2026-05-13', '2026-05-18', '2026-05-20', '2026-05-25']);

    const beforeStart = helpers.expandEventsForDateRange([weeklyEvent], '2026-05-01', '2026-05-11');
    assertEqual('recurring schedule event does not render before its start date', beforeStart.length, 0);

    const activeRangeWeekly = { ...weeklyEvent, active_start_date: '2026-05-19', active_end_date: '2026-05-26' };
    assertEqual(
        'recurring event renders only inside active date range including boundaries',
        helpers.expandEventsForDateRange([activeRangeWeekly], '2026-05-12', '2026-06-02').map(event => event.date),
        ['2026-05-19', '2026-05-26']
    );
    assertEqual(
        'legacy recurring event without active range keeps old expansion behavior',
        helpers.expandEventsForDateRange([weeklyEvent], '2026-05-12', '2026-05-26').map(event => event.date),
        ['2026-05-12', '2026-05-19', '2026-05-26']
    );
    assertEqual(
        'non-repeating event does not expand across active date range',
        helpers.expandEventsForDateRange([{ ...noneEvent, active_start_date: '2026-05-01', active_end_date: '2026-05-31' }], '2026-05-01', '2026-05-31').map(event => event.date),
        ['2026-05-13']
    );
    assertEqual(
        'container override event ignores active range and remains date-exact',
        helpers.expandEventsForDateRange([{ id: 'override', date: '2026-05-13', source: 'container_override', active_start_date: '2026-05-14', active_end_date: '2026-05-31' }], '2026-05-13', '2026-05-14').map(event => event.date),
        ['2026-05-13']
    );
    const arrangedTasks = [
        { id: 'today-start', title: 'Today start', progress: 'not_started', start_date: '2026-05-18' },
        { id: 'today-due', title: 'Today due', progress: 'not_started', due_date: '2026-05-18' },
        { id: 'same-day', title: 'Same day', progress: 'not_started', start_date: '2026-05-18', due_date: '2026-05-18' },
        { id: 'past-start', title: 'Past start', progress: 'not_started', start_date: '2026-05-17' },
        { id: 'future-start', title: 'Future start', progress: 'not_started', start_date: '2026-05-19' },
        { id: 'completed', title: 'Completed', progress: 'completed', start_date: '2026-05-18' },
        { id: 'status-completed', title: 'Status completed', status: 'completed', start_date: '2026-05-18' },
        { id: 'no-start', title: 'No start', progress: 'not_started', start_date: null }
    ];
    assertEqual(
        'Calendar task display uses exact start and due date items with due priority',
        helpers.getCalendarTasksForDate(arrangedTasks, '2026-05-18').map(task => task.id),
        ['same-day', 'today-due', 'today-start']
    );
    assertEqual(
        'Calendar same-day start and due is marked as due once',
        helpers.getCalendarTasksForDate(arrangedTasks, '2026-05-18').find(task => task.id === 'same-day').calendar_item_type,
        'due'
    );

    const dayContainers = [
        { id: 'free', name: 'Free', time_start: '09:00', time_end: '10:00', layer: 2, repeat: 'daily' },
        { id: 'study', name: 'Study', time_start: '18:00', time_end: '20:00', layer: 1, repeat: 'daily' },
        { id: 'late', name: 'Late', time_start: '20:00', time_end: '21:00', layer: 1, repeat: 'daily' }
    ];
    const assignments = helpers.assignCalendarTasksToContainers([
        { id: 'unscheduled', start_date: '2026-05-18' },
        { id: 'due-unscheduled', due_date: '2026-05-18', calendar_item_type: 'due' },
        { id: 'timed', start_date: '2026-05-18', schedule_time: '20:15' }
    ], dayContainers);
    assertEqual('Calendar unscheduled date tasks render once in first study container using Daily Settle sort order', assignments.get('study').map(task => task.id), ['due-unscheduled', 'unscheduled']);
    assertEqual('Calendar timed start-date tasks render in matching container only', assignments.get('late').map(task => task.id), ['timed']);
    assertEqual('Calendar task assignment helper marks normal container tasks assigned', assignments.get('study').map(task => task.calendar_assignment), ['assigned', 'assigned']);

    const weeklyPayload = helpers._repeatPayload({ repeat: 'weekly', weeklyDay: 4 });
    assertEqual('weekly event repeat payload persists repeat day', weeklyPayload.repeat_days, [4]);
    const customPayload = helpers._repeatPayload({ repeat: 'custom', repeatDays: [1, 5] });
    assertEqual('custom event repeat payload persists selected days', customPayload.repeat_days, [1, 5]);
    const nonePayload = helpers._repeatPayload({ repeat: 'none' });
    assertEqual('default event repeat payload can persist none', nonePayload.repeat, 'none');
    assertEqual('container active end default clamps one month later', helpers.addMonthsClampedISO('2026-01-31', 1), '2026-02-28');

    const calendarHtml = fs.readFileSync(path.join(root, 'extension', 'pages', 'calendar', 'calendar.html'), 'utf8');
    const calendarScript = fs.readFileSync(path.join(root, 'extension', 'pages', 'calendar', 'script.js'), 'utf8');
    const calendarStyles = fs.readFileSync(path.join(root, 'extension', 'pages', 'calendar', 'styles.css'), 'utf8');
    const googleSyncStatusUi = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'google-sync-status-ui.js'), 'utf8');
    const schedulingScript = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'scheduling.js'), 'utf8');
    const dbScript = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'db.js'), 'utf8');
    assert('Calendar product UI no longer contains visible 单次事件 wording', !/单次事件/.test(calendarHtml + calendarScript + calendarStyles));
    assert('Calendar modal type toggle uses 日程事件 wording', calendarScript.includes('>日程事件</button>'));
    assert('create mode renders switchable type toggle', /const typeToggle = isCreate \?[\s\S]*id="modalTypeToggle"[\s\S]*data-type="container"[\s\S]*data-type="event"/.test(calendarScript));
    assert('edit mode renders read-only type label instead of switchable buttons', calendarScript.includes('id="modalTypeReadonly"')
        && calendarScript.includes("类型：${isContainer ? '时间容器' : '日程事件'}"));
    assert('edit type control does not render disabled segmented type buttons', !/data-type="container"[^>]*disabled/.test(calendarScript)
        && !/data-type="event"[^>]*disabled/.test(calendarScript));
    assert('edit mode keeps container normal fields editable', /id="modalName"[^>]*(?!disabled|readonly)/.test(calendarScript)
        && /id="modalStart"[^>]*(?!disabled|readonly)/.test(calendarScript)
        && /id="modalEnd"[^>]*(?!disabled|readonly)/.test(calendarScript)
        && /id="modalRepeat"[\s\S]*<\/select>/.test(calendarScript)
        && calendarScript.includes('id="layerToggle"')
        && calendarScript.includes('id="modalColorPicker"')
        && !/id="modalName"[^>]*(disabled|readonly)/.test(calendarScript)
        && !/id="modalStart"[^>]*(disabled|readonly)/.test(calendarScript)
        && !/id="modalEnd"[^>]*(disabled|readonly)/.test(calendarScript));
    assert('edit mode keeps event normal fields editable', /id="modalDate"[^>]*(?!disabled|readonly)/.test(calendarScript)
        && /id="modalAllDay"[^>]*(?!disabled|readonly)/.test(calendarScript)
        && calendarScript.includes('id="modalTimeRow"')
        && calendarScript.includes('TimeWhereDB.updateEvent')
        && !/id="modalDate"[^>]*(disabled|readonly)/.test(calendarScript)
        && !/id="modalAllDay"[^>]*(disabled|readonly)/.test(calendarScript));
    assert('event edit mode shows disabled only-this scope instead of faking event override', calendarScript.includes('日程事件暂不支持仅修改此次'));
    assert('addContainer payload includes layer', /addContainer\(\{[\s\S]*layer:\s*v\.layer/.test(calendarScript));
    assert('Calendar container modal includes active date range inputs and default helper', calendarScript.includes('id="modalActiveStartDate"')
        && calendarScript.includes('id="modalActiveEndDate"')
        && calendarScript.includes('addMonthsClampedISO(activeStartDate, 1)'));
    assert('Calendar active date inputs render for container and event forms', (calendarScript.match(/id="modalActiveStartDate"/g) || []).length === 2
        && (calendarScript.match(/id="modalActiveEndDate"/g) || []).length === 2);
    assert('Calendar container create payload persists active range', /addContainer\(\{[\s\S]*active_start_date:\s*v\.active_start_date[\s\S]*active_end_date:\s*v\.active_end_date/.test(calendarScript));
    assert('Calendar event create payload persists active range', /addEvent\(\{[\s\S]*source:\s*'manual'[\s\S]*active_start_date:\s*v\.active_start_date[\s\S]*active_end_date:\s*v\.active_end_date/.test(calendarScript));
    assert('container edit save payload updates normal fields on original record', /updateContainer\(_modal\.id,\s*\{[\s\S]*name:\s*v\.name[\s\S]*color:\s*v\.color[\s\S]*time_start:\s*v\.start[\s\S]*time_end:\s*v\.end[\s\S]*layer:\s*v\.layer[\s\S]*\.\.\._repeatPayload\(v\)/.test(calendarScript));
    assert('container edit save payload updates active range on original record', /updateContainer\(_modal\.id,\s*\{[\s\S]*active_start_date:\s*v\.active_start_date[\s\S]*active_end_date:\s*v\.active_end_date/.test(calendarScript));
    assert('event edit save payload updates normal fields on original record', /updateEvent\(_modal\.id,\s*\{[\s\S]*title:\s*v\.name[\s\S]*date:\s*v\.date \|\| _modal\.date[\s\S]*time_start:\s*v\.allDay \? null : v\.start[\s\S]*time_end:\s+v\.allDay \? null : v\.end[\s\S]*color:\s*v\.color[\s\S]*\.\.\._repeatPayload\(v\)/.test(calendarScript));
    assert('event edit save payload updates active range on original record', /updateEvent\(_modal\.id,\s*\{[\s\S]*active_start_date:\s*v\.active_start_date[\s\S]*active_end_date:\s*v\.active_end_date/.test(calendarScript));
    assert('container edit derives legacy layer before save', calendarScript.includes('const selectedLayer = data ? getContainerLayer(data) : 1')
        && calendarScript.includes('selectedLayer === 1')
        && calendarScript.includes('selectedLayer === 2'));
    const sharedProjection = helpers.buildCalendarDayProjection({
        date: new Date('2026-05-18T00:00:00'),
        dateStr: '2026-05-18',
        containers: dayContainers,
        events: helpers.expandEventsForDateRange([weeklyEvent, noneEvent, customEvent], '2026-05-18', '2026-05-18'),
        tasks: arrangedTasks
    });
    assertEqual(
        'shared day projection expands recurring events into the same timed item stream',
        sharedProjection.timedItems.map(item => item.id),
        ['free', 'event-custom', 'study', 'late']
    );
    assertEqual(
        'shared day projection fills first study container up to capacity',
        sharedProjection.timedItems.find(item => item.id === 'study').tasks.map(task => task.id),
        ['same-day', 'today-due']
    );
    assertEqual(
        'shared day projection shifts non-timed overflow to the next available container',
        sharedProjection.timedItems.find(item => item.id === 'late').tasks.map(task => task.id),
        ['today-start']
    );

    assert('created and existing week containers share old layer-aware createEventCard rendering path', calendarScript.includes('const projection = buildCalendarDayProjection({')
        && calendarScript.includes('createEventCard(item)')
        && calendarScript.includes("event.className = 'gcal-event layer-1'")
        && calendarScript.includes("event.className = 'gcal-event layer-2'")
        && calendarScript.includes("event.style.backgroundColor = color + '40'")
        && calendarScript.includes("event.style.border = `2px dashed ${darkenColor(color, 0.15)}`")
        && calendarScript.includes("event.style.border = `2px dashed ${color}`"));
    assert('month view container items carry type source and layer', schedulingScript.includes("type: 'container'")
        && schedulingScript.includes("source: 'container'")
        && schedulingScript.includes('layer: getContainerLayer(container)')
        && calendarScript.includes('eventEl.dataset.layer'));
    assert('month view override/timetable/manual events remain event style inputs', schedulingScript.includes("event.source === 'container_override'")
        && schedulingScript.includes("type: 'event'")
        && schedulingScript.includes("source: event.source || 'manual'"));
    assert('week timed columns filter all-day events out of timed layout', calendarScript.includes('const allItems = projection.timedItems')
        && schedulingScript.includes('eventItems.filter(event => event.time_start && event.time_end)'));
    assert('week blank grid clicks can create schedules through fallback pointer handling', calendarScript.includes('function openCreateModalFromWeekPointer')
        && calendarScript.includes('function getWeekColumnFromPointer')
        && calendarScript.includes('function getCreateSlotFromPointer')
        && calendarScript.includes("document.querySelector('#weekView .calendar-body')?.addEventListener('click'")
        && calendarScript.includes('openCreateModal(col.dataset.date, slot.timeStart, slot.timeEnd)'));
    assert('empty calendar guide does not intercept blank-grid creation clicks', calendarScript.includes('emptyEl.onclick = null')
        && calendarScript.includes("emptyEl.style.cursor = 'default'")
        && /calendar-empty-state[\s\S]*pointer-events:\s*none/.test(calendarStyles));
    assert('week columns cover the full time grid so blank areas are clickable', calendarStyles.includes('min-height: calc(17 * 40px)')
        && /columns-layer[\s\S]*min-height:\s*calc\(17 \* 40px\)/.test(calendarStyles)
        && /day-col[\s\S]*min-height:\s*calc\(17 \* 40px\)/.test(calendarStyles));
    assert('Calendar open auto-applies Arrange through shared review helper', calendarScript.includes('runCalendarArrangeCheck()')
        && calendarHtml.includes('../../shared/js/task-arrange-auto.js')
        && calendarScript.includes('TimeWhereTaskArrangeAuto.runTaskArrangeAutoReview')
        && calendarScript.includes("source: 'calendar_auto'")
        && !calendarScript.includes('maybeRunTaskArrange')
        && !calendarScript.includes('task-arrange.html?source=calendar_auto'));
    assert('Calendar exposes diagnostic snapshot copy action', calendarHtml.includes('id="btnCopyCalendarDebugSnapshot"')
        && calendarHtml.includes('复制 Calendar 诊断快照')
        && calendarHtml.includes('诊断快照')
        && calendarStyles.includes('.calendar-debug-snapshot-btn')
        && calendarScript.includes('copyCalendarDebugSnapshot(debugSnapshotBtn)'));
    assert('Calendar diagnostic snapshot includes events containers tasks arrange and DOM context', calendarScript.includes('async function buildCalendarDebugSnapshot()')
        && calendarScript.includes("schema: 'timewhere-calendar-debug-v1'")
        && calendarScript.includes('sanitizeCalendarTask')
        && calendarScript.includes('sanitizeCalendarContainer')
        && calendarScript.includes('sanitizeCalendarEvent')
        && calendarScript.includes('sanitizeCalendarArrangeChange')
        && calendarScript.includes('change.title || task.title')
        && calendarScript.includes('change.source || task.source')
        && calendarScript.includes('change.old_start_date || task.start_date')
        && calendarScript.includes('getCalendarDomSnapshot')
        && calendarScript.includes('getCalendarVisibleRange')
        && calendarScript.includes('TimeWhereScheduling.arrangeTasks(TimeWhereDB, now, { apply: false })')
        && calendarScript.includes('navigator.clipboard.writeText(text)'));
    assert('Calendar diagnostic snapshot redacts private source details and keeps safe setting summaries', calendarScript.includes('has_source_url: Boolean(task.source_url)')
        && !calendarScript.includes('source_url: task.source_url')
        && calendarScript.includes('managebac_pending_event_count')
        && calendarScript.includes('matrixview_subject_mappings')
        && !calendarScript.includes('managebac_ics_url')
        && !calendarScript.includes('managebac_ics_token'));
    assert('Calendar loads and initializes avatar-based Google sync status entry',
        calendarHtml.includes('shared/styles/google-sync-status.css')
        && calendarHtml.includes('shared/js/google-sync-status-ui.js')
        && calendarHtml.indexOf('desktop-sync-service.js') < calendarHtml.indexOf('google-sync-status-ui.js')
        && calendarHtml.includes('class="user-avatar"')
        && calendarScript.includes('TimeWhereGoogleSyncStatusUI?.init?.()')
        && calendarScript.includes('TimeWhereGoogleSyncStatusUI?.refreshAll?.()')
        && !calendarScript.includes('setTransientStatus')
        && googleSyncStatusUi.includes('attachSidebarAvatar'));
    assert('Calendar week task display no longer uses Daily Settle rolling task pool', !calendarScript.includes('buildDailyTaskPool')
        && !calendarScript.includes('dailySettle')
        && calendarScript.includes('buildCalendarDayProjection({')
        && schedulingScript.includes('getCalendarTasksForDate(tasks, normalizedDateStr)')
        && schedulingScript.includes('assignCalendarTasksToContainers(dateTasks, dayContainers, dateObj)'));
    assert('Calendar week view renders display-only capacity assignment markers', calendarScript.includes('calendar-assignment-${assignment}')
        && calendarScript.includes('超出容量')
        && calendarScript.includes('未安排')
        && calendarStyles.includes('.container-task-item.calendar-assignment-overflow')
        && calendarStyles.includes('.container-task-item.calendar-assignment-unassigned')
        && schedulingScript.includes('calendar_assignment')
        && schedulingScript.includes('unassignedTasks')
        && !calendarScript.includes('TimeWhereDB.updateTask'));
    assert('Calendar task display uses the same start marker structure as Dashboard today tomorrow',
        calendarScript.includes('task-item-title')
        && calendarScript.includes('task-item-type task-item-${itemType}')
        && calendarScript.includes("itemType === 'due' ? '结束' : '开始'")
        && schedulingScript.includes("calendar_item_type: 'due'")
        && !calendarScript.includes('task-priority-dot')
        && !calendarScript.includes('task-item-dur')
        && calendarStyles.includes('.task-item-start')
        && calendarStyles.includes('color: #047857')
        && calendarStyles.includes('.container-task-item.start')
        && calendarStyles.includes('.container-task-item.due')
        && calendarStyles.includes('.task-item-due')
        && calendarStyles.includes('color: #b91c1c')
        && !calendarStyles.includes('.task-priority-dot'));
    assertEqual('month view layer 1 container uses old layer-aware container class', helpers.getMonthItemClass({ type: 'container', source: 'container', layer: 1 }), 'month-event month-container layer-1');
    assertEqual('month view layer 2 container uses old layer-aware container class', helpers.getMonthItemClass({ type: 'container', source: 'container', layer: 2 }), 'month-event month-container layer-2');
    assertEqual('month view event item remains normal event style', helpers.getMonthItemClass({ type: 'event', source: 'manual' }), 'month-event');
    assertEqual('month view container override remains normal event style', helpers.getMonthItemClass({ type: 'event', source: 'container_override', layer: 1 }), 'month-event');
    const monthContainerCss = calendarStyles.slice(
        calendarStyles.indexOf('.month-event.month-container'),
        calendarStyles.indexOf('.month-more')
    );
    assert('month view container styles preserve old month-event color template while distinguishing layer', calendarStyles.includes('.month-event.month-container.layer-1')
        && calendarStyles.includes('.month-event.month-container.layer-2')
        && /\.month-event\.month-container\.layer-1\s*\{[\s\S]*border:\s*1px dashed/.test(calendarStyles)
        && !/background-color:\s*transparent\s*!important/.test(monthContainerCss)
        && !/color:\s*var\(--text-main\)/.test(monthContainerCss));
    assert('DB addEvent preserves all-day null time with nullish coalescing', dbScript.includes('time_start: event.time_start ??'));
    assert('DB addEvent persists event repeat fields', /repeat:\s*event\.repeat/.test(dbScript) && dbScript.includes('once_date: event.once_date'));

    console.log('\n' + '='.repeat(32));
    console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
    if (failed > 0) process.exit(1);
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
