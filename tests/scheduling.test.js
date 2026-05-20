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
    assert("普通溢出进入 Layer2", c2Info.tasks.length, 1);
    assert("Layer2 接收普通溢出后无未分配", r.unassigned.length, 0);
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
    assert("普通溢出优先进入 before Layer2", c2aInfo.tasks.length, 2);
    assert("before Layer2 接收完后 after Layer2 无需填充", c2bInfo.tasks.length, 0);
    assert("普通溢出被 Layer2 接收后无未分配", r.unassigned.length, 0);
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

section('TC-S-10 dailySettle — 场景J：定时任务只进入覆盖时间的 Layer1 容器');
{
    const morning = { id:'morning', name:'上午学习', time_start:'09:00', time_end:'10:00', repeat:'daily', layer:1 };
    const evening = { id:'evening', name:'晚间学习', time_start:'20:00', time_end:'21:00', repeat:'daily', layer:1 };
    const tasks = [
        { id:'timed', priority:'low', duration:30, progress:'not_started', start_date:'2026-04-15', schedule_time:'20:30' },
        { id:'normal', priority:'urgent', duration:30, progress:'not_started', start_date:'2026-04-15' }
    ];
    const now = new Date('2026-04-15T08:00:00');
    const r = S.dailySettle(tasks, [morning, evening], now);
    assert("定时任务不进入不覆盖时间的上午容器", r.result.get('morning').tasks.map(t => t.id), ['normal']);
    assert("定时任务进入覆盖 20:30 的晚间容器", r.result.get('evening').tasks.map(t => t.id), ['timed']);
    assert("匹配容器存在时无未分配定时任务", r.unassigned.map(t => t.id), []);
}

section('TC-S-10 dailySettle — 场景K：定时任务不匹配任何容器时保持未分配');
{
    const c1 = { id:'c1', name:'学习', time_start:'18:00', time_end:'19:00', repeat:'daily', layer:1 };
    const tasks = [
        { id:'timed-outside', priority:'urgent', duration:30, progress:'not_started', start_date:'2026-04-15', schedule_time:'21:00' }
    ];
    const now = new Date('2026-04-15T12:00:00');
    const r = S.dailySettle(tasks, [c1], now);
    assert("不匹配容器 → 容器内不放入定时任务", r.result.get('c1').tasks.map(t => t.id), []);
    assert("不匹配容器 → unassigned 保留定时任务", r.unassigned.map(t => t.id), ['timed-outside']);
    assert("无活跃容器 → currentTasks 仍按完整日池显示", r.currentTasks.map(t => t.id), ['timed-outside']);
}

section('TC-S-10 dailySettle — 场景L：Layer2 接收普通溢出定时任务');
{
    const l1 = { id:'l1', name:'学习', time_start:'18:00', time_end:'19:00', repeat:'daily', layer:1 };
    const l2 = { id:'l2', name:'自由', time_start:'20:00', time_end:'21:00', repeat:'daily', layer:2 };
    const tasks = [
        { id:'timed-layer2', priority:'low', duration:30, progress:'not_started', start_date:'2026-04-15', schedule_time:'20:15' },
        { id:'normal', priority:'urgent', duration:30, progress:'not_started', start_date:'2026-04-15' }
    ];
    const now = new Date('2026-04-15T17:00:00');
    const r = S.dailySettle(tasks, [l1, l2], now);
    assert("普通任务优先填入 Layer1", r.result.get('l1').tasks.map(t => t.id), ['normal']);
    assert("Layer2 接收普通定时溢出任务", r.result.get('l2').tasks.map(t => t.id), ['timed-layer2']);
    assert("普通 Layer2 定时任务不再留在 unassigned", r.unassigned.map(t => t.id), []);
}

section('TC-S-10 dailySettle — 场景L2：当前容器为空时显示后续已安排任务');
{
    const l1 = { id:'l1', name:'学习', time_start:'18:00', time_end:'19:00', repeat:'daily', layer:1 };
    const l2 = { id:'l2', name:'自由', time_start:'20:00', time_end:'21:00', repeat:'daily', layer:2 };
    const tasks = [
        { id:'timed-layer2', priority:'low', duration:30, progress:'not_started', start_date:'2026-04-15', schedule_time:'20:15' }
    ];
    const now = new Date('2026-04-15T18:30:00');
    const r = S.dailySettle(tasks, [l1, l2], now);
    assert("当前仍处于 l1", r.activeContainer.id, 'l1');
    assert("l1 当前容器无任务", r.containerInfo.tasks.map(t => t.id), []);
    assert("后续 l2 有任务时 currentTasks 不为空", r.currentTasks.map(t => t.id), ['timed-layer2']);
    assert("currentContainerInfo 指向后续有任务容器", r.currentContainerInfo.container.id, 'l2');
}

section('TC-S-10 dailySettle — 场景L3：已结束容器不再吃掉当前任务，当前容器接收并溢出');
{
    const past = { id:'past', name:'已结束学习', time_start:'16:00', time_end:'17:00', repeat:'daily', layer:1 };
    const active = { id:'active', name:'当前学习', time_start:'18:00', time_end:'19:00', repeat:'daily', layer:1 };
    const later = { id:'later', name:'后续自由', time_start:'20:00', time_end:'21:00', repeat:'daily', layer:2 };
    const tasks = [
        { id:'t1', priority:'urgent', duration:30, progress:'not_started', start_date:'2026-04-15' },
        { id:'t2', priority:'urgent', duration:30, progress:'not_started', start_date:'2026-04-15' },
        { id:'t3', priority:'medium', duration:30, progress:'not_started', start_date:'2026-04-15' }
    ];
    const now = new Date('2026-04-15T18:30:00');
    const r = S.dailySettle(tasks, [past, active, later], now);
    assert("已结束容器不分配任务", r.result.get('past').tasks.map(t => t.id), []);
    assert("当前容器先接收任务", r.result.get('active').tasks.map(t => t.id), ['t1', 't2']);
    assert("当前容器容量外任务溢出到后续容器", r.result.get('later').tasks.map(t => t.id), ['t3']);
    assert("当前显示仍指向当前容器", r.currentContainerInfo.container.id, 'active');
    assert("当前任务显示当前容器任务", r.currentTasks.map(t => t.id), ['t1', 't2']);
    assert("displayTasks 显示当天所有任务并按当前/后续排序", r.displayTasks.map(t => t.id), ['t1', 't2', 't3']);
    assert("displayTasks 当前任务标记 current", r.displayTasks[0].assignment.status, 'current');
    assert("displayTasks 溢出任务标记 upcoming", r.displayTasks[2].assignment.status, 'upcoming');
}

section('TC-S-10 dailySettle — 场景L4：未分配任务仍进入 displayTasks 并排在最后');
{
    const active = { id:'active', name:'当前学习', time_start:'18:00', time_end:'19:00', repeat:'daily', layer:1 };
    const later = { id:'later', name:'后续自由', time_start:'20:00', time_end:'21:00', repeat:'daily', layer:2 };
    const tasks = [
        { id:'active-task', priority:'urgent', duration:30, progress:'not_started', start_date:'2026-04-15' },
        { id:'later-task', priority:'medium', duration:45, progress:'not_started', start_date:'2026-04-15' },
        { id:'unassigned-timed', priority:'low', duration:30, progress:'not_started', start_date:'2026-04-15', schedule_time:'22:00' }
    ];
    const now = new Date('2026-04-15T18:30:00');
    const r = S.dailySettle(tasks, [active, later], now);
    assert("displayTasks 包含已分配和未分配任务", r.displayTasks.map(t => t.id), ['active-task', 'later-task', 'unassigned-timed']);
    assert("当前容器任务标记 current", r.displayTasks[0].assignment.status, 'current');
    assert("后续容器任务标记 upcoming", r.displayTasks[1].assignment.status, 'upcoming');
    assert("无法匹配时间容器的任务标记 unassigned", r.displayTasks[2].assignment.status, 'unassigned');
    assert("未分配任务保留在 unassigned 结果中", r.unassigned.map(t => t.id), ['unassigned-timed']);
}

section('TC-S-10 dailySettle — 场景M：多 Layer1 + Layer2 before/between/after 下按时间匹配定时任务');
{
    const l2Before = { id:'l2Before', name:'早自由', time_start:'07:00', time_end:'08:00', repeat:'daily', layer:2 };
    const l1Morning = { id:'l1Morning', name:'上午学习', time_start:'09:00', time_end:'10:00', repeat:'daily', layer:1 };
    const l2Between = { id:'l2Between', name:'午间自由', time_start:'12:00', time_end:'13:00', repeat:'daily', layer:2 };
    const l1Evening = { id:'l1Evening', name:'晚间学习', time_start:'18:00', time_end:'19:00', repeat:'daily', layer:1 };
    const l2After = { id:'l2After', name:'晚自由', time_start:'20:00', time_end:'21:00', repeat:'daily', layer:2 };
    const tasks = [
        { id:'early', priority:'low', duration:20, progress:'not_started', start_date:'2026-04-15', schedule_time:'07:30' },
        { id:'morning', priority:'low', duration:20, progress:'not_started', start_date:'2026-04-15', schedule_time:'09:30' },
        { id:'midday', priority:'low', duration:20, progress:'not_started', start_date:'2026-04-15', schedule_time:'12:30' },
        { id:'evening', priority:'low', duration:20, progress:'not_started', start_date:'2026-04-15', schedule_time:'18:30' },
        { id:'late', priority:'low', duration:20, progress:'not_started', start_date:'2026-04-15', schedule_time:'20:30' }
    ];
    const now = new Date('2026-04-15T06:00:00');
    const r = S.dailySettle(tasks, [l2Before, l1Morning, l2Between, l1Evening, l2After], now);
    assert("Layer2 before 接收对应定时任务", r.result.get('l2Before').tasks.map(t => t.id), ['early']);
    assert("第一个 Layer1 接收对应定时任务", r.result.get('l1Morning').tasks.map(t => t.id), ['morning']);
    assert("Layer2 between 接收对应定时任务", r.result.get('l2Between').tasks.map(t => t.id), ['midday']);
    assert("第二个 Layer1 接收对应定时任务", r.result.get('l1Evening').tasks.map(t => t.id), ['evening']);
    assert("Layer2 after 接收对应定时任务", r.result.get('l2After').tasks.map(t => t.id), ['late']);
    assert("Layer2 普通定时任务分配后无未分配", r.unassigned.map(t => t.id), []);
}

section('TC-S-10 dailySettle — 场景N：urgent / overdue 可溢出到 Layer2');
{
    const l1 = { id:'l1', name:'学习', time_start:'18:00', time_end:'19:00', repeat:'daily', layer:1 };
    const l2 = { id:'l2', name:'自由', time_start:'20:00', time_end:'21:00', repeat:'daily', layer:2 };
    const tasks = [
        { id:'u1', priority:'urgent', duration:30, progress:'not_started', start_date:'2026-04-15' },
        { id:'u2', priority:'urgent', duration:30, progress:'not_started', start_date:'2026-04-15' },
        { id:'u3', priority:'urgent', duration:30, progress:'not_started', start_date:'2026-04-15' },
        { id:'od', priority:'medium', duration:30, progress:'not_started', start_date:'2026-04-15', due_date:'2026-04-14' }
    ];
    const r = S.dailySettle(tasks, [l1, l2], new Date('2026-04-15T17:00:00'));
    assert("Layer1 先填 urgent", r.result.get('l1').tasks.map(t => t.id), ['u1', 'u2']);
    assert("Layer2 接收 urgent/overdue 溢出", r.result.get('l2').tasks.map(t => t.id), ['u3', 'od']);
    assert("urgent/overdue 溢出后无未分配", r.unassigned.map(t => t.id), []);
}

// ─── TC-S-11 arrangeTasks ───────────────────────────────────────
async function runAsyncChecks() {
    section('TC-S-11 Task Date Arrange — 默认 start_date / priority / subject timetable');
    assert("普通任务默认 start_date=max(today,due-7)",
        S.getDefaultStartDate({ due_date:'2026-05-20' }, '2026-05-10'),
        '2026-05-13');
    assert("普通任务默认 start_date 不落到过去",
        S.getDefaultStartDate({ due_date:'2026-05-20' }, '2026-05-18'),
        '2026-05-18');
    assert("ManageBac 任务默认 start_date=max(today,due-14)",
        S.getDefaultStartDate({ due_date:'2026-05-20', source:'managebac' }, '2026-05-01'),
        '2026-05-06');
    assert("ManageBac 任务默认 start_date 不落到过去",
        S.getDefaultStartDate({ due_date:'2026-05-20', source:'managebac' }, '2026-05-12'),
        '2026-05-12');
    assert("3 天内升级 important",
        S.getEscalatedPriority({ due_date:'2026-05-17', priority:'medium' }, '2026-05-14'),
        'important');
    assert("1 天内升级 urgent",
        S.getEscalatedPriority({ due_date:'2026-05-15', priority:'medium' }, '2026-05-14'),
        'urgent');
    assert("逾期升级 urgent",
        S.getEscalatedPriority({ due_date:'2026-05-13', priority:'low' }, '2026-05-14'),
        'urgent');
    assert("已有 urgent 不降级",
        S.getEscalatedPriority({ due_date:'2026-06-01', priority:'urgent' }, '2026-05-14'),
        'urgent');

    const timetable = [
        { id:'e1', source:'timetable', subject_in_matrixview:'English Language Acquisition Phase 5', title:'English Language', date:'2026-05-16' },
        { id:'e2', source:'timetable', title:'Math Analysis', date:'2026-05-17' },
        { id:'e3', source:'timetable', title:'General Study Block', date:'2026-05-26' }
    ];
    const plan = S.arrangeTaskStartDates([
        { id:'subject', subject:'English Language Acquisition Phase 5', progress:'not_started', priority:'medium', due_date:'2026-06-01' },
        { id:'urgent', subject:'English', progress:'not_started', priority:'medium', due_date:'2026-05-15', start_date:'2026-05-15' },
        { id:'explicit-important', subject:'English', progress:'not_started', priority:'medium', due_date:'2026-05-17', start_date:'2026-05-16' },
        { id:'nosubject', progress:'not_started', priority:'medium', due_date:'2026-05-30' },
        { id:'unmatched-subject', subject:'Chemistry', progress:'not_started', priority:'medium', due_date:'2026-06-01' },
        { id:'unmatched-subject-due-start', subject:'Chemistry', progress:'not_started', priority:'medium', due_date:'2026-06-01', start_date:'2026-06-01' },
        { id:'unmatched-managebac', subject:'Chemistry', source:'managebac', progress:'not_started', priority:'medium', due_date:'2026-06-01' },
        { id:'no-due', progress:'not_started', priority:'medium', start_date:'2026-05-20' },
        { id:'overdue-no-start', progress:'not_started', priority:'medium', due_date:'2026-05-13' },
        { id:'done', subject:'Math', progress:'completed', priority:'urgent', due_date:'2026-05-15' }
    ], timetable, '2026-05-14');
    const byId = new Map(plan.map(row => [row.task_id, row]));
    assert("有 subject 普通任务先初始化，早于初始化日的课表不生效，改走后续可用课表日", byId.get('subject').start_date, '2026-05-26');
    const tolerantMatch = S.arrangeTaskStartDates([
        { id:'tolerant', subject:'English: Language Acquisition Phase 5', progress:'not_started', priority:'medium', due_date:'2026-06-01' }
    ], timetable, '2026-05-14');
    assert("SubjectInMatrixView 标准化后仍受初始化开始日期下界约束并向后寻找可用课表日", tolerantMatch[0].start_date, '2026-05-26');
    assert("start_date 等于 due_date 视为未初始化，urgent 不能早于初始化日期", byId.get('urgent').start_date, '2026-05-14');
    assert("important/urgent 任务写入 urgent priority", byId.get('urgent').priority, 'urgent');
    assert("明确开始日期窗口的 important 任务不能被拉早到今天，且当天同学科课表可原地匹配", byId.get('explicit-important').start_date, '2026-05-16');
    assert("明确开始日期窗口的 important 任务仍可升级 priority", byId.get('explicit-important').priority, 'important');
    assert("无 subject 任务也使用下一个可用课表日", byId.get('nosubject').start_date, '2026-05-26');
    assert("有 subject 但无课表匹配的任务使用下一个可用课表日", byId.get('unmatched-subject').start_date, '2026-05-26');
    assert("有 subject 且 start_date 等于 due_date 时先初始化再排到下一个可用课表日", byId.get('unmatched-subject-due-start').start_date, '2026-05-26');
    assert("ManageBac 无课表匹配不再使用 14 天 fallback，而是排到下一个可用课表日", byId.get('unmatched-managebac').start_date, '2026-05-26');
    assertBool("无 due_date 任务不参与 Task Arrange", byId.has('no-due'), false);
    assertBool("逾期未完成任务不参与 Task Arrange", byId.has('overdue-no-start'), false);
    assertBool("completed 任务不参与 Arrange", byId.has('done'), false);

    const broadTitleMatch = S.arrangeTaskStartDates([
        { id:'managebac-engla-broad-title', subject:'English Language Acquisition Phase 5', source:'managebac', progress:'not_started', priority:'medium', due_date:'2026-06-05' }
    ], [
        { id:'generic-english', source:'timetable', title:'English', date:'2026-05-19' },
        { id:'future-general', source:'timetable', title:'General Study Block', date:'2026-05-25' }
    ], '2026-05-19');
    assert("短泛称课表标题不能误匹配完整 EngLA 学科，改走下一个可用课表日", broadTitleMatch[0].start_date, '2026-05-25');

    const exactMatrixMatch = S.arrangeTaskStartDates([
        { id:'managebac-engla-exact', subject:'English Language Acquisition Phase 5', source:'managebac', progress:'not_started', priority:'medium', due_date:'2026-06-05' }
    ], [
        { id:'exact-engla', source:'timetable', subject_in_matrixview:'English Language Acquisition Phase 5', date:'2026-05-25' }
    ], '2026-05-19');
    assert("SubjectInMatrixView 精确匹配仍可作为课表日期来源", exactMatrixMatch[0].start_date, '2026-05-25');

    const subjectIdMismatch = S.arrangeTaskStartDates([
        { id:'managebac-engla-id', subject:'English Language Acquisition Phase 5', subject_in_matrixview:'English Language Acquisition Phase 5', source:'managebac', progress:'not_started', priority:'medium', due_date:'2026-06-05' }
    ], [
        { id:'generic-title-wrong-id', source:'timetable', subject_in_matrixview:'Mathematics Analysis HL', title:'English', date:'2026-05-19' },
        { id:'future-general-wrong-id', source:'timetable', subject_in_matrixview:'Mathematics Analysis HL', title:'General Study Block', date:'2026-05-25' }
    ], '2026-05-19');
    assert("有 Subject ID 时不再用泛称 title 误匹配不同课表学科，改走下一个可用课表日", subjectIdMismatch[0].start_date, '2026-05-25');

    const explicitWindow = S.arrangeTaskStartDates([
        { id:'subject-window', subject:'English Language Acquisition Phase 5', progress:'not_started', priority:'medium', due_date:'2026-05-25', start_date:'2026-05-18' },
        { id:'clamp-due', subject:'Math', progress:'not_started', priority:'medium', due_date:'2026-05-25', start_date:'2026-05-18' },
        { id:'invalid-window', progress:'not_started', priority:'medium', due_date:'2026-05-15', start_date:'2026-05-20' }
    ], [
        { id:'early', source:'timetable', subject_in_matrixview:'English Language Acquisition Phase 5', date:'2026-05-16' },
        { id:'late', source:'timetable', title:'Math Analysis', date:'2026-05-30' }
    ], '2026-05-14');
    const explicitById = new Map(explicitWindow.map(row => [row.task_id, row]));
    assert("明确开始日期窗口不能被课表调早；无后续匹配时按后续可用课表日并受 due 约束", explicitById.get('subject-window').start_date, '2026-05-25');
    assert("明确开始日期窗口允许在窗口内向后移动", explicitById.get('clamp-due').start_date, '2026-05-25');
    assert("start_date 晚于 due_date 的异常窗口限制到 due_date", explicitById.get('invalid-window').start_date, '2026-05-15');
    assert("异常窗口仍可更新 priority", explicitById.get('invalid-window').priority, 'urgent');

    const expiredWindow = S.arrangeTaskStartDates([
        { id:'move-today', subject:'Chemistry', progress:'not_started', priority:'medium', due_date:'2026-05-25', start_date:'2026-05-18' },
        { id:'late-class-clamp', subject:'Math', progress:'not_started', priority:'medium', due_date:'2026-06-01', start_date:'2026-05-18' }
    ], [
        { id:'too-late', source:'timetable', title:'Math Analysis', date:'2026-06-10' }
    ], '2026-05-20');
    const expiredById = new Map(expiredWindow.map(row => [row.task_id, row]));
    assert("明确窗口且 today 晚于 start_date 时仍按下一个可用课表日向后安排", expiredById.get('move-today').start_date, '2026-05-25');
    assert("明确窗口且候选晚于 due_date 时限制到 due_date", expiredById.get('late-class-clamp').start_date, '2026-06-01');

    const sameDayAnyTimetable = S.arrangeTaskStartDates([
        { id:'music-no-subject-match', subject:'Music', source:'managebac', progress:'not_started', priority:'medium', due_date:'2026-05-28', start_date:'2026-05-20' }
    ], [
        { id:'same-day-math', source:'timetable', subject_in_matrixview:'Mathematics Analysis HL', title:'Math', date:'2026-05-20' }
    ], '2026-05-20');
    assert("无学科匹配时当天任意课表不能作为原地 fallback", sameDayAnyTimetable[0].start_date, '2026-05-25');

    const sameDaySubjectTimetable = S.arrangeTaskStartDates([
        { id:'music-same-day-subject', subject:'Music', subject_in_matrixview:'Music', source:'managebac', progress:'not_started', priority:'medium', due_date:'2026-05-28', start_date:'2026-05-20' }
    ], [
        { id:'same-day-music', source:'timetable', subject_in_matrixview:'Music', title:'Music', date:'2026-05-20' }
    ], '2026-05-20');
    assert("当天同学科课表可作为 Arrange 依据且原地不动", sameDaySubjectTimetable[0].start_date, '2026-05-20');
    assertBool("当天同学科课表原地不动不产生日期变更", sameDaySubjectTimetable[0].changed, false);

    const sameDayInitializedSubject = S.arrangeTaskStartDates([
        { id:'chinese-uninitialized', subject:'Chinese Language & Literature 9', subject_in_matrixview:'Chinese - Chinese Language & Literature 9', progress:'not_started', priority:'medium', due_date:'2026-05-22', start_date:'2026-05-22' }
    ], [
        { id:'same-day-chinese', source:'timetable', subject_in_matrixview:'Chinese - Chinese Language & Literature 9', title:'Chinese', date:'2026-05-20' }
    ], '2026-05-20');
    assert("未初始化任务可排到初始化基准日当天同学科课表", sameDayInitializedSubject[0].start_date, '2026-05-20');

    const laterSubjectTimetable = S.arrangeTaskStartDates([
        { id:'music-later-subject', subject:'Music', subject_in_matrixview:'Music', source:'managebac', progress:'not_started', priority:'medium', due_date:'2026-05-28', start_date:'2026-05-20' }
    ], [
        { id:'later-music', source:'timetable', subject_in_matrixview:'Music', title:'Music', date:'2026-05-22' }
    ], '2026-05-20');
    assert("start_date 之后的同学科课表仍可作为 Arrange 日期", laterSubjectTimetable[0].start_date, '2026-05-22');

    const noTimetable = S.arrangeTaskStartDates([
        { id:'keep', subject:'Chemistry', progress:'not_started', priority:'medium', due_date:'2026-06-01', start_date:'2026-05-22' },
        { id:'short-window', subject:'Chemistry', progress:'not_started', priority:'medium', due_date:'2026-06-01', start_date:'2026-05-30' },
        { id:'fallback-urgent', subject:'Chemistry', progress:'not_started', priority:'medium', due_date:'2026-05-16', start_date:'2026-05-22' }
    ], [], '2026-05-14');
    const noTableById = new Map(noTimetable.map(row => [row.task_id, row]));
    assert("无 timetable 且开始到截止大于等于 3 天时调整到截止前 3 天", noTableById.get('keep').start_date, '2026-05-29');
    assert("无 timetable 且开始到截止小于 3 天时调整到截止前 1 天", noTableById.get('short-window').start_date, '2026-05-31');
    assert("无 timetable 且异常明确窗口的 urgent 任务限制到 due_date", noTableById.get('fallback-urgent').start_date, '2026-05-16');

    section('TC-S-12 arrangeTasks / maybeRunTaskArrange — preview/apply 与无节流自动检查');
    const fakeDb = {
        settings: {},
        tasks: [
            { id:'a', subject:'Math', progress:'not_started', priority:'medium', due_date:'2026-06-01' },
            { id:'b', source:'managebac', progress:'not_started', priority:'medium', due_date:'2026-05-16', start_date:'2026-05-20' },
            { id:'inactive', plan_id: 9, subject:'Archived Subject', progress:'not_started', priority:'medium', due_date:'2026-06-01', start_date:'2026-05-22' },
            { id:'c', subject:'Math', progress:'completed', priority:'medium', due_date:'2026-05-15', start_date:'2026-05-20' }
        ],
        events: [{ id:'m1', source:'timetable', title:'Math Analysis', date:'2026-05-18' }],
        plans: [{ id: 9, name: 'Archived Subject', subject: 'Archived Subject', subject_active: false }],
        async getAllTasks() { return this.tasks.map(t => ({ ...t })); },
        async getEvents() { return this.events.map(e => ({ ...e })); },
        async getPlans() { return this.plans.map(p => ({ ...p })); },
        async updateTask(id, updates) {
            const task = this.tasks.find(t => t.id === id);
            Object.assign(task, updates);
        },
        async setSetting(key, value) { this.settings[key] = value; },
        async getSetting(key) { return this.settings[key]; }
    };
    const previewResult = await S.arrangeTasks(fakeDb, new Date('2026-05-14T09:00:00'));
    assert("arrangeTasks 默认只 preview 两个未完成任务变更", previewResult.proposed, 2);
    assertBool("arrangeTasks preview 不写 task", fakeDb.tasks.find(t => t.id === 'a').start_date == null, true);
    assertBool("arrangeTasks preview 不写 last_run_at", !!fakeDb.settings.task_arrange_last_run_at, false);
    assert("arrangeTasks preview 汇总日期调整", previewResult.summary.date_changes, 2);
    assert("arrangeTasks preview 汇总 priority 升级", previewResult.summary.priority_changes, 1);
    assert("arrangeTasks preview 汇总 ManageBac 变更", previewResult.summary.managebac_changes, 1);

    const cancelled = await S.maybeRunTaskArrange(fakeDb, {
        now: new Date('2026-05-14T09:30:00'),
        confirmFn: () => false
    });
    assertBool("用户取消 Arrange 不 apply", cancelled.cancelled, true);
    assertBool("用户取消 Arrange 不写 task", fakeDb.tasks.find(t => t.id === 'a').start_date == null, true);
    assertBool("用户取消 Arrange 不写 last_run_at", !!fakeDb.settings.task_arrange_last_run_at, false);

    const arrangeResult = await S.maybeRunTaskArrange(fakeDb, {
        now: new Date('2026-05-14T10:00:00'),
        confirmFn: () => true
    });
    assert("用户确认后 Arrange 更新两个未完成任务", arrangeResult.arranged, 2);
    assert("arrangeTasks subject 任务先初始化且不被课表拉早，无后续课表时走 due-relative fallback", fakeDb.tasks.find(t => t.id === 'a').start_date, '2026-05-29');
    assert("arrangeTasks ManageBac 异常明确窗口限制到 due_date", fakeDb.tasks.find(t => t.id === 'b').start_date, '2026-05-16');
    assert("arrangeTasks ManageBac 异常明确窗口仍升级 priority", fakeDb.tasks.find(t => t.id === 'b').priority, 'important');
    assert("arrangeTasks 不处理 completed", fakeDb.tasks.find(t => t.id === 'c').start_date, '2026-05-20');
    assert("arrangeTasks 不处理停用学科 Plan 下任务", fakeDb.tasks.find(t => t.id === 'inactive').start_date, '2026-05-22');
    assertBool("用户确认后写入 last_run_at", !!fakeDb.settings.task_arrange_last_run_at, true);

    const mappingDb = {
        settings: {
            matrixview_subject_mappings: [
                { plan_name: 'EngLA', subject: 'English Language Acquisition Phase 5', subject_in_matrixview: 'English Language Acquisition Phase 5' }
            ]
        },
        tasks: [{ id:'legacy-task', plan_id: 1, subject:'English Language Acquisition Phase 5', source:'managebac', progress:'not_started', priority:'medium', due_date:'2026-06-05' }],
        events: [{ id:'engla-class', source:'timetable', subject_in_matrixview:'English Language Acquisition Phase 5', title:'English', date:'2026-05-25' }],
        plans: [{ id: 1, name: 'EngLA', subject: 'English Language Acquisition Phase 5' }],
        async getAllTasks() { return this.tasks.map(t => ({ ...t })); },
        async getEvents() { return this.events.map(e => ({ ...e })); },
        async getPlans() { return this.plans.map(p => ({ ...p })); },
        async getSetting(key) { return this.settings[key]; }
    };
    const mappingResult = await S.arrangeTasks(mappingDb, new Date('2026-05-19T09:00:00'));
    assert("旧任务可通过 Plan/MatrixView mapping 解析 Subject ID 后匹配课表", mappingResult.changes[0].start_date, '2026-05-25');

    const eventDerivedSubjectDb = {
        settings: {},
        tasks: [{ id:'legacy-music-task', plan_id: 3, subject:'Chinese Performing Arts: Music 9', source:'managebac', progress:'not_started', priority:'medium', due_date:'2026-05-28', start_date:'2026-05-20' }],
        events: [
            { id:'music-class', source:'timetable', subject_in_matrixview:'Arts - Chinese Performing Arts: Music 9', title:'Arts', date:'2026-05-21' },
            { id:'generic-next', source:'timetable', subject_in_matrixview:'ComTime - Community Time', title:'ComTime', date:'2026-05-22' }
        ],
        plans: [{ id: 3, name: 'Chinese Arts: Music 9', subject: 'Chinese Performing Arts: Music 9' }],
        async getAllTasks() { return this.tasks.map(t => ({ ...t })); },
        async getEvents() { return this.events.map(e => ({ ...e })); },
        async getPlans() { return this.plans.map(p => ({ ...p })); },
        async getSetting(key) { return this.settings[key]; }
    };
    const eventDerivedResult = await S.arrangeTasks(eventDerivedSubjectDb, new Date('2026-05-20T09:00:00'));
    assert("旧 Plan/Task 没有 Subject ID 时可从课表 subject_in_matrixview 后缀解析并精确匹配", eventDerivedResult.changes[0].start_date, '2026-05-21');

    const rerunNoChanges = await S.maybeRunTaskArrange(fakeDb, { now: new Date('2026-05-14T12:00:00') });
    assertBool("6 小时内仍执行 Arrange 检测", rerunNoChanges.ran, true);
    assertBool("重复执行无变更时返回 no_changes", rerunNoChanges.no_changes, true);
    const laterNoThrottle = await S.maybeRunTaskArrange(fakeDb, {
        now: new Date('2026-05-14T16:00:00'),
        confirmFn: () => true
    });
    assertBool("超过 6 小时同样执行 Arrange 检测", laterNoThrottle.ran, true);

    const failingDb = {
        settings: {},
        tasks: [{ id:'fail', progress:'not_started', priority:'medium', due_date:'2026-05-15', start_date:'2026-05-20' }],
        async getAllTasks() { return this.tasks.map(t => ({ ...t })); },
        async getEvents() { return []; },
        async updateTask() { throw new Error('write failed'); },
        async setSetting(key, value) { this.settings[key] = value; },
        async getSetting(key) { return this.settings[key]; }
    };
    const failedApply = await S.maybeRunTaskArrange(failingDb, {
        now: new Date('2026-05-14T10:00:00'),
        confirmFn: () => true
    });
    assert("部分/全部 apply 失败返回错误", failedApply.errors.length, 1);
    assertBool("apply 失败不写 last_run_at", !!failingDb.settings.task_arrange_last_run_at, false);
}

// ─── 汇总 ────────────────────────────────────────────────────────
runAsyncChecks()
    .then(() => {
        console.log('\nTimeWhere scheduling.js 单元测试结果\n' + '='.repeat(40));
        results.forEach(r => console.log(r));
        console.log('\n' + '='.repeat(40));
        console.log(`总计: ${passed + failed} 个用例   ✅ ${passed} 通过   ${failed > 0 ? '❌' : '✅'} ${failed} 失败`);
        if (failed > 0) process.exit(1);
    })
    .catch(err => {
        failed++;
        console.error(err);
        process.exit(1);
    });
