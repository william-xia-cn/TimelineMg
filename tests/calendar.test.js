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

    const weeklyPayload = helpers._repeatPayload({ repeat: 'weekly', weeklyDay: 4 });
    assertEqual('weekly event repeat payload persists repeat day', weeklyPayload.repeat_days, [4]);
    const customPayload = helpers._repeatPayload({ repeat: 'custom', repeatDays: [1, 5] });
    assertEqual('custom event repeat payload persists selected days', customPayload.repeat_days, [1, 5]);
    const nonePayload = helpers._repeatPayload({ repeat: 'none' });
    assertEqual('default event repeat payload can persist none', nonePayload.repeat, 'none');

    const calendarHtml = fs.readFileSync(path.join(root, 'extension', 'pages', 'calendar', 'calendar.html'), 'utf8');
    const calendarScript = fs.readFileSync(path.join(root, 'extension', 'pages', 'calendar', 'script.js'), 'utf8');
    const calendarStyles = fs.readFileSync(path.join(root, 'extension', 'pages', 'calendar', 'styles.css'), 'utf8');
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
    assert('container edit save payload updates normal fields on original record', /updateContainer\(_modal\.id,\s*\{[\s\S]*name:\s*v\.name[\s\S]*color:\s*v\.color[\s\S]*time_start:\s*v\.start[\s\S]*time_end:\s*v\.end[\s\S]*layer:\s*v\.layer[\s\S]*\.\.\._repeatPayload\(v\)/.test(calendarScript));
    assert('event edit save payload updates normal fields on original record', /updateEvent\(_modal\.id,\s*\{[\s\S]*title:\s*v\.name[\s\S]*date:\s*v\.date \|\| _modal\.date[\s\S]*time_start:\s*v\.allDay \? null : v\.start[\s\S]*time_end:\s+v\.allDay \? null : v\.end[\s\S]*color:\s*v\.color[\s\S]*\.\.\._repeatPayload\(v\)/.test(calendarScript));
    assert('container edit derives legacy layer before save', calendarScript.includes('const selectedLayer = data ? getContainerLayer(data) : 1')
        && calendarScript.includes('selectedLayer === 1')
        && calendarScript.includes('selectedLayer === 2'));
    assert('created and existing week containers share old layer-aware createEventCard rendering path', calendarScript.includes('const containerEvents = dayContainers.map')
        && calendarScript.includes('createEventCard(item)')
        && calendarScript.includes("event.className = 'gcal-event layer-1'")
        && calendarScript.includes("event.className = 'gcal-event layer-2'")
        && calendarScript.includes("event.style.backgroundColor = color + '40'")
        && calendarScript.includes("event.style.border = `2px dashed ${darkenColor(color, 0.15)}`")
        && calendarScript.includes("event.style.border = `2px dashed ${color}`"));
    assert('month view container items carry type source and layer', calendarScript.includes("type: 'container'")
        && calendarScript.includes("source: 'container'")
        && calendarScript.includes('layer: getContainerLayer(c)')
        && calendarScript.includes('eventEl.dataset.layer'));
    assert('month view override/timetable/manual events remain event style inputs', calendarScript.includes("source: 'container_override'")
        && calendarScript.includes("type: 'event'")
        && calendarScript.includes("source: e.source || 'manual'"));
    assert('week timed columns filter all-day events out of timed layout', /const dateEvents = dbEvents\.filter[\s\S]*source: e\.source \|\| 'manual'[\s\S]*\}\)\)\.filter\(e => e\.time_start && e\.time_end\)/.test(calendarScript));
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
