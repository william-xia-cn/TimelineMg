/**
 * Focus Dashboard static safety checks.
 * Run: node tests/focus.test.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const focusHtml = fs.readFileSync(path.join(root, 'extension', 'pages', 'focus', 'focus.html'), 'utf8');
const focusCss = fs.readFileSync(path.join(root, 'extension', 'pages', 'focus', 'styles.css'), 'utf8');
const focusScript = fs.readFileSync(path.join(root, 'extension', 'pages', 'focus', 'script.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(root, 'extension', 'popup', 'popup.html'), 'utf8');
const popupCss = fs.readFileSync(path.join(root, 'extension', 'popup', 'popup.css'), 'utf8');
const popupScript = fs.readFileSync(path.join(root, 'extension', 'popup', 'popup.js'), 'utf8');
const calendarScript = fs.readFileSync(path.join(root, 'extension', 'pages', 'calendar', 'script.js'), 'utf8');

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

console.log('\nTimeWhere Focus Dashboard tests\n' + '='.repeat(44));

assert('Focus dynamic UI does not use inline onclick handlers', !/onclick\s*=/.test(focusScript));
assert('Focus dynamic UI does not use inline onchange handlers', !/onchange\s*=/.test(focusScript));
assert('Popup UI does not use inline onclick/onchange handlers', !/onclick\s*=|onchange\s*=/.test(popupHtml + popupScript));
assert('Dashboard title uses 当前任务 and not 当下任务', focusHtml.includes('<h2>当前任务</h2>')
    && !/当下任务/.test(focusHtml + focusScript));
assert('Focus pomodoro widget and init path are removed', !/pomodoroWidget|pomo|Pomodoro|initPomodoro|renderPomodoro|togglePomodoro/.test(focusHtml + focusScript + focusCss));
assert('Focus static add task buttons use delegated action', !/onclick\s*=/.test(focusHtml)
    && /class="add-task-btn"[^>]*data-action="add-task"/.test(focusHtml));
assert('current task card actions use data-action', /data-action="start"/.test(focusScript)
    && /data-action="pause"/.test(focusScript)
    && /data-action="complete"/.test(focusScript));
assert('current task defer buttons use data-task-id and data-days', /data-action="defer"[\s\S]*data-task-id/.test(focusScript)
    && /data-days="1"/.test(focusScript)
    && /data-days="3"/.test(focusScript)
    && /data-days="7"/.test(focusScript));
assert('delegated click listener handles Focus actions', focusScript.includes("document.addEventListener('click', handleFocusDelegatedClick)")
    && focusScript.includes('function handleFocusDelegatedClick'));
assert('Dashboard weekly task list opens Planner task detail instead of toggling completion', focusScript.includes('data-action="open-task-detail"')
    && focusScript.includes('openTaskDetailInPlanner')
    && focusScript.includes('../tasks/tasks.html?task_id=')
    && !focusScript.includes('data-action="week-toggle"')
    && !focusScript.includes('toggleWeekTask'));
assert('ManageBac source tasks render non-clickable defer blocked text', focusScript.includes('isManageBacSourceTask')
    && focusScript.includes('defer-blocked-text')
    && focusScript.includes('ManageBac 来源任务不能延后'));
assert('ManageBac source defer branch does not render defer buttons', /const deferHtml = isManageBacSource \?[\s\S]*defer-blocked-text[\s\S]*<\/div>` : `[\s\S]*data-action="defer"/.test(focusScript));
assert('async task actions use try/catch and toast failure paths', /async function startTaskNow[\s\S]*try[\s\S]*catch/.test(focusScript)
    && /async function pauseTask[\s\S]*try[\s\S]*catch/.test(focusScript)
    && /async function completeTaskNow[\s\S]*try[\s\S]*catch/.test(focusScript)
    && /async function deferTask[\s\S]*try[\s\S]*catch/.test(focusScript)
    && focusScript.includes('showToast(`操作失败：'));
assert('Focus action runner prevents duplicate clicks', focusScript.includes('dataset.busy')
    && focusScript.includes('control.disabled = true')
    && focusScript.includes('control.disabled = false'));
assert('Focus no longer exports handlers for inline events', !/window\.(startTaskNow|pauseTask|completeTaskNow|deferTask|toggleWeekTask|openAddTaskModal|saveNewTask)/.test(focusScript));
assert('Dashboard owns unified six-hour management review trigger', focusHtml.includes('../../shared/js/managebac.js')
    && focusScript.includes('runManagementReviewCheck()')
    && focusScript.includes('management_review_pending')
    && focusScript.includes('management_review_last_checked_at')
    && focusScript.includes('managebac-sync.html?source=dashboard_auto'));
assert('Dashboard management review previews Arrange without direct confirm/apply', focusScript.includes('TimeWhereScheduling.arrangeTasks(TimeWhereDB, now, { apply: false })')
    && !focusScript.includes('maybeRunTaskArrange'));
assert('Popup and Calendar do not run automatic Arrange on open', !popupScript.includes('maybeRunTaskArrange')
    && !popupScript.includes('runTaskArrangeInBackground')
    && !calendarScript.includes('maybeRunTaskArrange')
    && !calendarScript.includes('runTaskArrangeInBackground'));
assert('Focus layout has four independent top-level board columns', /<section class="board-column column-now"/.test(focusHtml)
    && /<section class="board-column column-calendar/.test(focusHtml)
    && /<section class="board-column column-week"/.test(focusHtml)
    && /<section class="board-column column-feed"/.test(focusHtml));
assert('Focus layout does not use merged column-side layout', !/column-side|side-panel/.test(focusHtml + focusCss));
assert('Focus layout expresses overall 2:2:1:1 ratio', focusCss.includes('总布局 2:2:1:1')
    && /column-calendar[\s\S]*\* 2 \/ 5/.test(focusCss)
    && /column-week[\s\S]*column-feed[\s\S]*\* 1 \/ 5/.test(focusCss));
assert('Focus first viewport target remains 2:2:1', focusCss.includes('首屏优先显示前 2:2:1')
    && focusCss.includes('--focus-first-viewport-width: calc(100vw - 124px)'));
assert('Focus board allows horizontal scrolling to feed column', /board-layout[\s\S]*overflow-x:\s*auto/.test(focusCss)
    && /column-feed[\s\S]*flex:\s*0 0 calc\(var\(--focus-first-viewport-width\) \* 1 \/ 5\)/.test(focusCss));
assert('Focus week and feed are not stacked inside one column', focusHtml.indexOf('column-week') > focusHtml.indexOf('column-calendar')
    && focusHtml.indexOf('column-feed') > focusHtml.indexOf('column-week')
    && (focusHtml.match(/<section class="board-column column-/g) || []).length === 4
    && !/<div class="side-panel column-feed"/.test(focusHtml));
assert('Focus calendar render path calls dailySettle for container task fill', /function renderDayColumn\([^)]*allTasks/.test(focusScript)
    && focusScript.includes('const dayTaskPool = buildDailyTaskPool(allTasks, dayReferenceTime)')
    && focusScript.includes('const settle = dailySettle(dayTaskPool, dayContainers, dayReferenceTime)'));
assert('Focus calendar container item carries settled tasks into render', focusScript.includes("tasks: settle.result.get(c.id)?.tasks || []")
    && focusScript.includes('renderContainerTasks(item.tasks)'));
assert('Focus calendar container card renders task list markup', focusScript.includes('function renderContainerTasks')
    && focusScript.includes('container-tasks')
    && focusScript.includes('container-task-item')
    && focusScript.includes('task-priority-dot')
    && focusScript.includes('task-item-dur')
    && focusScript.includes('task-timed'));
assert('Focus regular calendar events do not render container task list', focusScript.includes("isContainer: false")
    && focusScript.includes("item.isContainer ? renderContainerTasks(item.tasks) : ''"));
assert('Focus calendar uses Calendar-like layer-aware event card rendering', focusScript.includes('function createFocusCalendarCard')
    && focusScript.includes("div.className = 'gcal-event layer-1'")
    && focusScript.includes("div.className = 'gcal-event layer-2'")
    && focusScript.includes("div.style.backgroundColor = color + '40'")
    && focusScript.includes("div.style.border = `2px dashed ${darkenColor(color, 0.15)}`")
    && focusScript.includes("div.style.border = `2px dashed ${color}`")
    && focusScript.includes("div.style.borderLeft = '3px solid rgba(255,255,255,0.4)'"));
assert('Focus calendar cards carry type/source/layer metadata like Calendar', focusScript.includes("type: 'container'")
    && focusScript.includes("source: 'container'")
    && focusScript.includes('layer: getContainerLayer(c)')
    && focusScript.includes("type: 'event'")
    && focusScript.includes("source: e.source || 'manual'")
    && focusScript.includes('div.dataset.source = source')
    && focusScript.includes('div.dataset.layer = String(layer)'));
assert('Focus calendar cards use Calendar-style localized time labels', focusScript.includes('function formatTime')
    && focusScript.includes('上午')
    && focusScript.includes('下午')
    && focusScript.includes('const startTime = formatTime(item.time_start)'));
assert('Popup HTML removes quick actions and stats sections', !/quick-actions|stats-section/.test(popupHtml));
assert('Popup header includes completion and pending summary target', popupHtml.includes('id="taskSummary"')
    && popupHtml.includes('今日完成')
    && popupHtml.includes('todayCompletedCount')
    && popupHtml.includes('今日待办')
    && popupHtml.includes('todayPendingCount'));
assert('Popup header pending count uses today Daily Settle task pool', popupScript.includes('buildDailyTaskPool(allTasks, now)')
    && popupScript.includes('const todayPendingCount = taskPool.length')
    && !popupScript.includes('getPendingCount('));
assert('Popup no-task copy uses 暂无待办任务 only', popupHtml.includes('暂无待办任务')
    && popupScript.includes('暂无待办任务')
    && !/暂无进行中的任务/.test(popupHtml + popupScript));
assert('Popup renders Daily Settle currentTasks list', popupScript.includes('settle.currentTasks || []')
    && popupScript.includes('renderCurrentTaskList(currentTasks)')
    && popupScript.includes('tasks.map((task, index) => renderCurrentTaskCard(task, index, expandedIndex))'));
assert('Popup does not fallback to one current task or sorted pool', !popupScript.includes('currentTasks[0] || sortedPool[0]')
    && !popupScript.includes('sortedPool[0]'));
assert('Popup current task list expands only one task, preferring in-progress task', popupScript.includes('const inProgressIndex = tasks.findIndex')
    && popupScript.includes('const expandedIndex = inProgressIndex >= 0 ? inProgressIndex : 0')
    && popupScript.includes('const isExpanded = index === expandedIndex')
    && popupScript.includes('class="task-card popup-task-card"'));
assert('Popup expanding one task collapses other tasks and auto-scrolls it into view', popupScript.includes("taskList.addEventListener('toggle', handleTaskCardToggle, true)")
    && popupScript.includes("querySelectorAll('.popup-task-card[open]')")
    && popupScript.includes('if (other !== card) other.open = false')
    && popupScript.includes('ensureExpandedTaskVisible')
    && popupScript.includes("scrollIntoView({ block: 'nearest'"));
assert('Popup expanded task cards do not clip core task content', popupCss.includes('.task-list')
    && /task-list[\s\S]*overflow-y:\s*auto/.test(popupCss)
    && /task-list[\s\S]*scroll-behavior:\s*smooth/.test(popupCss)
    && /popup-task-card[\s\S]*overflow:\s*visible/.test(popupCss)
    && /task-card-summary \.task-title[\s\S]*white-space:\s*normal/.test(popupCss)
    && /task-notes[\s\S]*max-height:\s*none/.test(popupCss)
    && /task-notes[\s\S]*overflow:\s*visible/.test(popupCss));
assert('Popup current task render includes Dashboard-like card semantics', popupScript.includes('task-title-row')
    && popupScript.includes('task-notes')
    && popupScript.includes('priority-badge')
    && popupScript.includes('duration')
    && popupScript.includes('deadline')
    && popupScript.includes('task-tags')
    && popupScript.includes('task-actions')
    && popupScript.includes('defer-row'));
assert('Popup normal task actions and defer buttons are inside card', popupScript.includes('data-action="start"')
    && popupScript.includes('data-action="pause"')
    && popupScript.includes('data-action="complete"')
    && popupScript.includes('data-action="defer"')
    && popupScript.includes('data-days="1"')
    && popupScript.includes('data-days="3"')
    && popupScript.includes('data-days="7"'));
assert('Popup ManageBac branch renders blocked defer text and no defer buttons', popupScript.includes('isManageBacSourceTask')
    && popupScript.includes('defer-blocked-text')
    && /const deferHtml = isManageBacSource \?[\s\S]*defer-blocked-text[\s\S]*<\/div>` : `[\s\S]*data-action="defer"/.test(popupScript));
assert('Popup action success reloads task and header counts', popupScript.includes('await reloadPopup()'));
assert('Popup action failure shows toast', popupScript.includes('showToast(`操作失败：${error.message}`'));
assert('Popup CSS no longer contains quick action or stat card styles', !/quick-actions|stats-section|stat-card|action-btn/.test(popupCss));

console.log('\n' + '='.repeat(44));
console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
if (failed > 0) process.exit(1);
