/**
 * scheduling.js 单元测试
 * 运行：node tests/scheduling.test.js
 */

// 加载 scheduling.js（Node.js 环境）
const g = {};
const src = require('fs').readFileSync(
    require('path').join(__dirname, '../extension/shared/js/scheduling.js'), 'utf8'
);
const fn = new Function('global', src);
fn.call(g, g);
const S = g.TimeWhereScheduling;

// ─── 测试框架（极简）────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];

function assert(desc, got, expected) {
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    if (ok) {
        passed++;
        results.push(`  ✅ ${desc}`);
    } else {
        failed++;
        results.push(`  ❌ ${desc}\n     期望: ${JSON.stringify(expected)}\n     实际: ${JSON.stringify(got)}`);
    }
}

function assertBool(desc, got, expected) {
    const ok = got === expected;
    if (ok) { passed++; results.push(`  ✅ ${desc}`); }
    else { failed++; results.push(`  ❌ ${desc}\n     期望: ${expected}\n     实际: ${got}`); }
}

function section(name) {
    results.push(`\n── ${name} ──`);
}

// ─── TC-S-01 timeToMinutes ───────────────────────────────────────
section('TC-S-01 timeToMinutes');
assert('00:00 → 0',        S.timeToMinutes('00:00'),    0);
assert('01:00 → 60',       S.timeToMinutes('01:00'),   60);
assert('18:30 → 1110',     S.timeToMinutes('18:30'), 1110);
assert('23:59 → 1439',     S.timeToMinutes('23:59'), 1439);
assert('null → 0',         S.timeToMinutes(null),       0);
assert('undefined → 0',    S.timeToMinutes(undefined),  0);
assert('9:05 → 545',       S.timeToMinutes('9:05'),   545);

// ─── TC-S-02 prioritySortValue ───────────────────────────────────
section('TC-S-02 prioritySortValue');
assert("'urgent' → 0",    S.prioritySortValue('urgent'),    0);
assert("'P1' → 0",        S.prioritySortValue('P1'),        0);
assert("'important' → 1", S.prioritySortValue('important'), 1);
assert("'P2' → 1",        S.prioritySortValue('P2'),        1);
assert("'medium' → 2",    S.prioritySortValue('medium'),    2);
assert("'P3' → 2",        S.prioritySortValue('P3'),        2);
assert("'low' → 3",       S.prioritySortValue('low'),       3);
assert("'P4' → 3",        S.prioritySortValue('P4'),        3);
assert("'unknown' → 2",   S.prioritySortValue('unknown'),   2);

// ─── TC-S-03 priorityLabel ───────────────────────────────────────
section('TC-S-03 priorityLabel');
assert("'urgent' → 'P1'",    S.priorityLabel('urgent'),    'P1');
assert("'important' → 'P2'", S.priorityLabel('important'), 'P2');
assert("'medium' → 'P3'",    S.priorityLabel('medium'),    'P3');
assert("'low' → 'P4'",       S.priorityLabel('low'),       'P4');
assert("'P1' → 'P1'",        S.priorityLabel('P1'),        'P1');
assert("'P4' → 'P4'",        S.priorityLabel('P4'),        'P4');
assert("undefined → 'P3'",   S.priorityLabel(undefined),   'P3');

// ─── TC-S-04 priorityClass ───────────────────────────────────────
section('TC-S-04 priorityClass');
assert("urgent → priority-high",   S.priorityClass('urgent'),    'priority-high');
assert("P1 → priority-high",       S.priorityClass('P1'),        'priority-high');
assert("important → priority-medium", S.priorityClass('important'), 'priority-medium');
assert("P2 → priority-medium",     S.priorityClass('P2'),        'priority-medium');
assert("medium → priority-low",    S.priorityClass('medium'),    'priority-low');
assert("P3 → priority-low",        S.priorityClass('P3'),        'priority-low');
assert("low → priority-low",       S.priorityClass('low'),       'priority-low');
assert("P4 → priority-low",        S.priorityClass('P4'),        'priority-low');

// ─── TC-S-04B safe HTML helpers ─────────────────────────────────
section('TC-S-04B safe HTML helpers');
assert("escapeHTML escapes markup and quotes",
    S.escapeHTML(`<img src=x onerror="alert('x')">&`),
    '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;');
assert("escapeHTML null → empty string", S.escapeHTML(null), '');
assert("escapeAttribute delegates to HTML escaping",
    S.escapeAttribute(`a"b'c`),
    'a&quot;b&#39;c');

// ─── TC-S-05 getContainerLayer ───────────────────────────────────
section('TC-S-05 getContainerLayer');
assert("layer:1 → 1",                      S.getContainerLayer({ layer: 1 }), 1);
assert("layer:2 → 2",                      S.getContainerLayer({ layer: 2 }), 2);
assert("layer:null, name含'学习' → 1",      S.getContainerLayer({ layer: null, name: '学习时间' }), 1);
assert("layer:null, name不含'学习' → 2",    S.getContainerLayer({ layer: null, name: '自由时间' }), 2);
assert("无layer, name含'学习' → 1",         S.getContainerLayer({ name: '学习时间ABC' }), 1);
assert("无layer, name不含'学习' → 2",       S.getContainerLayer({ name: '自习' }), 2);
assert("空对象 → 2",                        S.getContainerLayer({}), 2);
assert("layer:0 → 0（透传）",               S.getContainerLayer({ layer: 0 }), 0);

// ─── TC-S-06 getContainerCapacity ────────────────────────────────
section('TC-S-06 getContainerCapacity');
assert("18:30-21:30 → 180", S.getContainerCapacity({ time_start:'18:30', time_end:'21:30' }), 180);
assert("09:00-10:00 → 60",  S.getContainerCapacity({ time_start:'09:00', time_end:'10:00' }),  60);
assert("00:00-23:59 → 1439",S.getContainerCapacity({ time_start:'00:00', time_end:'23:59' }),1439);
assert("21:30-22:00 → 30",  S.getContainerCapacity({ time_start:'21:30', time_end:'22:00' }),  30);

// ─── TC-S-07 containerAppliesToDate ──────────────────────────────
section('TC-S-07 containerAppliesToDate');
const date = new Date('2026-04-15T00:00:00'); // 周三
const dateStr = '2026-04-15';
const wed = 3; // Wednesday

assertBool("none → false",    S.containerAppliesToDate({repeat:'none'}, date, dateStr, wed, true, false), false);
assertBool("daily → true",    S.containerAppliesToDate({repeat:'daily'}, date, dateStr, wed, true, false), true);
assertBool("weekday + 周三 → true",  S.containerAppliesToDate({repeat:'weekday'}, date, dateStr, wed, true, false), true);
assertBool("weekday + 周六 → false", S.containerAppliesToDate({repeat:'weekend'}, date, '2026-04-15', wed, true, false), false);

const sat = new Date('2026-04-18T00:00:00');
assertBool("weekend + 周六 → true",  S.containerAppliesToDate({repeat:'weekend'}, sat, '2026-04-18', 6, false, true), true);
assertBool("weekend + 周三 → false", S.containerAppliesToDate({repeat:'weekday'}, sat, '2026-04-18', 6, false, true), false);

assertBool("weekly repeat_days:[3] + 周三 → true",
    S.containerAppliesToDate({repeat:'weekly', repeat_days:[3]}, date, dateStr, 3, true, false), true);
assertBool("weekly repeat_days:[1] + 周三 → false",
    S.containerAppliesToDate({repeat:'weekly', repeat_days:[1]}, date, dateStr, 3, true, false), false);

assertBool("once 2026-04-15 + 匹配 → true",
    S.containerAppliesToDate({repeat:'once', once_date:'2026-04-15'}, date, '2026-04-15', 3, true, false), true);
assertBool("once 2026-04-15 + 不匹配 → false",
    S.containerAppliesToDate({repeat:'once', once_date:'2026-04-15'}, date, '2026-04-16', 3, true, false), false);

assertBool("yearly month=4 dom=15 + 4月15 → true",
    S.containerAppliesToDate({repeat:'yearly', yearly_month:4, yearly_dom:15}, date, '2026-04-15', 3, true, false), true);
assertBool("yearly month=4 dom=15 + 4月16 → false",
    S.containerAppliesToDate({repeat:'yearly', yearly_month:4, yearly_dom:15}, date, '2026-04-16', 3, true, false), false);

// ─── TC-S-08 _nthWeekdayOfMonth ──────────────────────────────────
section('TC-S-08 _nthWeekdayOfMonth');
assert("2026-04-06 → 第1个周一", S._nthWeekdayOfMonth('2026-04-06'), { dayOfWeek:1, nth:1 });
assert("2026-04-13 → 第2个周一", S._nthWeekdayOfMonth('2026-04-13'), { dayOfWeek:1, nth:2 });
assert("2026-04-01 → 第1个周三", S._nthWeekdayOfMonth('2026-04-01'), { dayOfWeek:3, nth:1 });
assert("2026-04-29 → 第5个周三", S._nthWeekdayOfMonth('2026-04-29'), { dayOfWeek:3, nth:5 });

// ─── TC-S-09 containerAppliesOn ──────────────────────────────────
section('TC-S-09 containerAppliesOn');
const monday = new Date('2026-04-13T10:00:00'); // 周一
const saturday = new Date('2026-04-18T10:00:00'); // 周六
assertBool("daily + 任意 → true",       S.containerAppliesOn({repeat:'daily'}, monday), true);
assertBool("weekday + 周一 → true",     S.containerAppliesOn({repeat:'weekday'}, monday), true);
assertBool("weekday + 周六 → false",    S.containerAppliesOn({repeat:'weekday'}, saturday), false);

// ─── TC-S-09B buildDailyTaskPool / getDeferredStartDate ─────────
section('TC-S-09B Daily Settle task-pool helpers');
{
    const now = new Date('2026-04-15T12:00:00');
    const tasks = [
        { id:'null-start', progress:'not_started', start_date:null },
        { id:'today', progress:'not_started', start_date:'2026-04-15' },
        { id:'overdue', progress:'in_progress', start_date:'2026-04-14' },
        { id:'future', progress:'not_started', start_date:'2026-04-16' },
        { id:'done', progress:'completed', start_date:'2026-04-15' },
        { id:'deferred-future', progress:'not_started', start_date:'2026-04-15', deferred_until:'2026-04-15T13:00:00' },
        { id:'deferred-past', progress:'not_started', start_date:'2026-04-15', deferred_until:'2026-04-15T11:00:00' }
    ];
    assert(
        "task pool includes null/today/overdue and excludes completed/future/deferred future",
        S.buildDailyTaskPool(tasks, now).map(t => t.id),
        ['null-start', 'today', 'overdue', 'deferred-past']
    );
    assert("延后 1 天 → next start_date", S.getDeferredStartDate(1, now), '2026-04-16');
}

// ─── TC-S-10 dailySettle ─────────────────────────────────────────
section('TC-S-10 dailySettle — 场景A：无容器');
{
    const tasks = [
        { id:'t1', title:'Task1', priority:'medium', duration:45, progress:'not_started', start_date:'2026-04-15' },
        { id:'t2', title:'Task2', priority:'urgent', duration:45, progress:'not_started', start_date:'2026-04-15' }
    ];
    const now = new Date('2026-04-15T19:00:00');
    const r = S.dailySettle(tasks, [], now);
    assertBool("无容器 → activeContainer=null", r.activeContainer === null, true);
    assert("无容器 → currentTasks=sortedPool", r.currentTasks, r.sortedPool);
    // 无容器时所有任务均未被分配到任何容器，unassigned = 全部任务（按优先级排序）
    assert("无容器 → unassigned.length=2", r.unassigned.length, 2);
}

section('TC-S-10 dailySettle — 场景B：单容器，当前时间在容器内');
{
    const c1 = { id:'c1', name:'学习时间', time_start:'18:30', time_end:'21:30', repeat:'daily', layer:1 };
    const tasks = [
        { id:'t1', priority:'medium', duration:45, progress:'not_started', start_date:'2026-04-15' },
        { id:'t2', priority:'urgent', duration:45, progress:'not_started', start_date:'2026-04-15' }
    ];
    const now = new Date('2026-04-15T19:00:00');
    const r = S.dailySettle(tasks, [c1], now);
    assertBool("活跃容器存在", r.activeContainer !== null, true);
    assert("activeContainer.id", r.activeContainer.id, 'c1');
    assert("容器内 2 个任务", r.currentTasks.length, 2);
    assert("unassigned 为空", r.unassigned.length, 0);
}

section('TC-S-10 dailySettle — 场景C：容器超容溢出');
{
    const c1 = { id:'c1', name:'学习时间', time_start:'18:30', time_end:'19:30', repeat:'daily', layer:1 };
    const tasks = [
        { id:'t1', priority:'urgent', duration:30, progress:'not_started', start_date:'2026-04-15' },
        { id:'t2', priority:'urgent', duration:30, progress:'not_started', start_date:'2026-04-15' },
        { id:'t3', priority:'low',    duration:30, progress:'not_started', start_date:'2026-04-15' }
    ];
    const now = new Date('2026-04-15T17:00:00');
    const r = S.dailySettle(tasks, [c1], now);
    const cInfo = r.result.get('c1');
    assert("容器分到 2 个任务（60min ≤ 60min）", cInfo.tasks.length, 2);
    assert("unassigned 1 个", r.unassigned.length, 1);
}

section('TC-S-10 dailySettle — 场景D：优先级排序');
{
    const tasks = [
        { id:'t1', priority:'low',    duration:30, progress:'not_started', start_date:'2026-04-15' },
        { id:'t2', priority:'urgent', duration:30, progress:'not_started', start_date:'2026-04-15' },
        { id:'t3', priority:'medium', duration:30, progress:'not_started', start_date:'2026-04-15' }
    ];
    const now = new Date('2026-04-15T17:00:00');
    const r = S.dailySettle(tasks, [], now);
    assert("sortedPool[0] = urgent", r.sortedPool[0].id, 't2');
    assert("sortedPool[1] = medium", r.sortedPool[1].id, 't3');
    assert("sortedPool[2] = low",    r.sortedPool[2].id, 't1');
}

section('TC-S-10 dailySettle — 场景E：定时任务置顶（未来）');
{
    const tasks = [
        { id:'t1', priority:'urgent', duration:30, progress:'not_started', start_date:'2026-04-15' },
        { id:'t2', priority:'low',    duration:30, progress:'not_started', start_date:'2026-04-15', schedule_time:'20:00' }
    ];
    const now = new Date('2026-04-15T18:00:00'); // 20:00 未到
    const r = S.dailySettle(tasks, [], now);
    assert("定时未到任务置顶", r.sortedPool[0].id, 't2');
}

section('TC-S-10 dailySettle — 场景E2：定时任务已过则不置顶');
{
    const tasks = [
        { id:'t1', priority:'urgent', duration:30, progress:'not_started', start_date:'2026-04-15' },
        { id:'t2', priority:'low',    duration:30, progress:'not_started', start_date:'2026-04-15', schedule_time:'16:00' }
    ];
    const now = new Date('2026-04-15T18:00:00'); // 16:00 已过
    const r = S.dailySettle(tasks, [], now);
    assert("定时已过不置顶，urgent 排前", r.sortedPool[0].id, 't1');
}

section('TC-S-10 dailySettle — 场景F：逾期任务提前');
{
    const today = '2026-04-15';
    const tasks = [
        { id:'t1', priority:'medium', duration:30, progress:'not_started', start_date:'2026-04-15', due_date:'2026-04-20' },
        { id:'t2', priority:'medium', duration:30, progress:'not_started', start_date:'2026-04-15', due_date:'2026-04-10' }
    ];
    const now = new Date('2026-04-15T17:00:00');
    const r = S.dailySettle(tasks, [], now);
    assert("逾期任务(t2)排前", r.sortedPool[0].id, 't2');
}

section('TC-S-10 dailySettle — 场景G：Layer1 优先，Layer2 接收溢出');
{
    const c1 = { id:'c1', name:'学习', time_start:'18:30', time_end:'21:30', repeat:'daily', layer:1 }; // 180min
    const c2 = { id:'c2', name:'自由', time_start:'21:30', time_end:'22:30', repeat:'daily', layer:2 }; // 60min
    const tasks = Array.from({length:5}, (_,i) => ({
        id:`t${i+1}`, priority:'medium', duration:40, progress:'not_started', start_date:'2026-04-15'
    }));
    const now = new Date('2026-04-15T17:00:00');
    const r = S.dailySettle(tasks, [c1, c2], now);
    const c1Info = r.result.get('c1');
    const c2Info = r.result.get('c2');
    assert("Layer1 分到 4 个任务(160min ≤ 180min)", c1Info.tasks.length, 4);
    assert("Layer2 接收溢出 1 个", c2Info.tasks.length, 1);
    assert("无未分配", r.unassigned.length, 0);
}

section('TC-S-10 dailySettle — 场景H：Layer2 溢出方向（前 before 后）');
{
    // Layer2A 在 Layer1 之前（早），Layer2B 在 Layer1 之后（晚）
    const c1  = { id:'c1',  name:'学习', time_start:'12:00', time_end:'13:00', repeat:'daily', layer:1 };  // 60min
    const c2a = { id:'c2a', name:'早自由', time_start:'09:00', time_end:'10:00', repeat:'daily', layer:2 }; // 60min (before L1)
    const c2b = { id:'c2b', name:'晚自由', time_start:'18:00', time_end:'19:00', repeat:'daily', layer:2 }; // 60min (after L1)
    const tasks = Array.from({length:4}, (_,i) => ({
        id:`t${i+1}`, priority:'medium', duration:30, progress:'not_started', start_date:'2026-04-15'
    })); // 总 120min，L1 只能放 2 个
    const now = new Date('2026-04-15T08:00:00');
    const r = S.dailySettle(tasks, [c1, c2a, c2b], now);
    const c2aInfo = r.result.get('c2a');
    const c2bInfo = r.result.get('c2b');
    // 溢出应先填 c2a（before L1）
    assertBool("溢出先填 Layer2A（before）", c2aInfo.tasks.length > 0, true);
}

section('TC-S-10 dailySettle — 场景I：单任务超容允许放入');
{
    const c1 = { id:'c1', name:'学习', time_start:'18:30', time_end:'18:45', repeat:'daily', layer:1 }; // 15min
    const tasks = [
        { id:'t1', priority:'urgent', duration:60, progress:'not_started', start_date:'2026-04-15' } // 60min > 15min
    ];
    const now = new Date('2026-04-15T17:00:00');
    const r = S.dailySettle(tasks, [c1], now);
    const cInfo = r.result.get('c1');
    assert("单任务超容仍可放入（容器为空）", cInfo.tasks.length, 1);
    assert("unassigned 为空", r.unassigned.length, 0);
}

// ─── 汇总 ────────────────────────────────────────────────────────
console.log('\nTimeWhere scheduling.js 单元测试结果\n' + '='.repeat(40));
results.forEach(r => console.log(r));
console.log('\n' + '='.repeat(40));
console.log(`总计: ${passed + failed} 个用例   ✅ ${passed} 通过   ${failed > 0 ? '❌' : '✅'} ${failed} 失败`);
if (failed > 0) process.exit(1);
