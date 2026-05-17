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
assert('Dashboard current task card renders status labels for all progress states',
    focusScript.includes('function getTaskStatusLabel')
    && focusScript.includes("text: '未开始', className: 'not-started'")
    && focusScript.includes("text: '进行中', className: 'in-progress'")
    && focusScript.includes("text: '已完成', className: 'completed'")
    && focusScript.includes('task-status-label'));
assert('Dashboard current task card renders existing checklist only',
    focusScript.includes('function renderTaskChecklist')
    && focusScript.includes('if (checklist.length === 0) return')
    && focusScript.includes('current-task-checklist-item')
    && focusScript.includes('data-action="toggle-current-checklist"'));
assert('Dashboard checklist toggle uses delegated action and updateChecklist',
    focusScript.includes("action === 'toggle-current-checklist'")
    && focusScript.includes('toggleCurrentTaskChecklist')
    && focusScript.includes('TimeWhereDB.updateChecklist(taskId, checklist)'));
assert('Dashboard defer buttons are in right-aligned action controls',
    focusScript.includes('task-action-controls')
    && focusScript.includes('defer-button-group')
    && focusScript.includes('defer-label')
    && focusScript.includes('defer-options')
    && focusScript.includes('>1天</button>')
    && /task-action-controls[\s\S]*progressBtns[\s\S]*deferHtml/.test(focusScript));
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
assert('ManageBac source defer branch does not render defer buttons',
    /const deferHtml = isManageBacSource[\s\S]*defer-blocked-text[\s\S]*: `<div class="defer-button-group"[\s\S]*data-action="defer"/.test(focusScript));
assert('Dashboard current task CSS defines status checklist and action alignment',
    focusCss.includes('.task-status-label.not-started')
    && focusCss.includes('.task-status-label.in-progress')
    && focusCss.includes('.task-status-label.completed')
    && focusCss.includes('.current-task-checklist')
    && focusCss.includes('.task-action-controls')
    && focusCss.includes('.defer-button-group')
    && focusCss.includes('.defer-options')
    && /\.defer-button-group\s*\{[\s\S]*border: 1px dashed/.test(focusCss)
    && focusCss.includes('min-height: 24px'));
assert('async task actions use try/catch and toast failure paths', /async function startTaskNow[\s\S]*try[\s\S]*catch/.test(focusScript)
    && /async function pauseTask[\s\S]*try[\s\S]*catch/.test(focusScript)
    && /async function completeTaskNow[\s\S]*try[\s\S]*catch/.test(focusScript)
    && /async function deferTask[\s\S]*try[\s\S]*catch/.test(focusScript)
    && focusScript.includes('showToast(`操作失败：'));
assert('Dashboard defer updates due_date instead of start_date', /async function deferTask[\s\S]*baseDate = task\?\.due_date \|\| task\?\.deadline \|\| formatDateISO\(today\)/.test(focusScript)
    && /async function deferTask[\s\S]*updateTask\(taskId, \{ due_date: targetStr \}\)/.test(focusScript)
    && !/async function deferTask[\s\S]*updateTask\(taskId, \{ start_date: targetStr \}\)/.test(focusScript));
assert('Focus action runner prevents duplicate clicks', focusScript.includes('dataset.busy')
    && focusScript.includes('control.disabled = true')
    && focusScript.includes('control.disabled = false'));
assert('Focus no longer exports handlers for inline events', !/window\.(startTaskNow|pauseTask|completeTaskNow|deferTask|toggleWeekTask|openAddTaskModal|saveNewTask)/.test(focusScript));
assert('Dashboard owns six-hour automatic Task Arrange review trigger', focusHtml.includes('../../shared/js/managebac.js')
    && focusHtml.includes('../../shared/js/task-arrange-auto.js')
    && focusScript.includes('runManagementReviewCheck()')
    && focusScript.includes('TimeWhereTaskArrangeAuto.runTaskArrangeAutoReview')
    && !focusScript.includes('fetchManageBacPreviewForManagementReview'));
assert('Dashboard management review auto-applies Arrange through shared helper without confirmation redirect', focusScript.includes("source: 'dashboard_auto'")
    && focusScript.includes('refreshTaskArrangeReviewEntry')
    && !focusScript.includes('task-arrange.html?source=dashboard_auto')
    && !focusScript.includes('maybeRunTaskArrange'));
assert('Dashboard calendar column places Task Arrange Review between title and date navigation', focusHtml.includes('gcal-container custom-scrollbar')
    && focusHtml.includes('task-arrange-review-entry')
    && focusHtml.indexOf('<h2>日程 (今日 & 明日)</h2>') < focusHtml.indexOf('task-arrange-review-entry')
    && focusHtml.indexOf('task-arrange-review-entry') < focusHtml.indexOf('class="cal-actions"')
    && focusHtml.includes('data-action="open-task-arrange-review"')
    && focusHtml.includes('taskArrangeReviewBadge')
    && focusHtml.includes('暂无新的自动调整')
    && focusCss.includes('.column-calendar .task-arrange-review-entry'));
assert('Dashboard Task Arrange Review modal marks unread records viewed', focusScript.includes('openTaskArrangeReviewModal')
    && focusScript.includes('renderTaskArrangeReviewRows')
    && focusScript.includes('markUnreadTaskArrangeReviewsViewed')
    && focusScript.includes('record.viewed_at')
    && focusScript.includes('TimeWhereTaskArrangeAuto.saveTaskArrangeReviewLog')
    && focusScript.includes('data-action="close-task-arrange-review"'));
assert('Popup does not run automatic Arrange on open', !popupScript.includes('maybeRunTaskArrange')
    && !popupScript.includes('runTaskArrangeInBackground')
    && !popupScript.includes('runTaskArrangeInBackground'));
assert('Calendar opening triggers automatic Arrange review logging only', calendarScript.includes('runCalendarArrangeCheck()')
    && calendarScript.includes('TimeWhereTaskArrangeAuto.runTaskArrangeAutoReview')
    && calendarScript.includes("source: 'calendar_auto'")
    && !calendarScript.includes('task-arrange.html?source=calendar_auto')
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
assert('Focus calendar render path uses exact date task display instead of Daily Settle projection', /function renderDayColumn\([^)]*allTasks/.test(focusScript)
    && focusScript.includes('const dateTasks = getDateTasksForDisplay(allTasks, dateStr)')
    && focusScript.includes('assignDateTasksToContainers(dateTasks, dayContainers)')
    && !focusScript.includes('const dayTaskPool = buildDailyTaskPool(allTasks, dayReferenceTime)')
    && !focusScript.includes('const settle = dailySettle(dayTaskPool, dayContainers, dayReferenceTime)'));
assert('Focus calendar container item carries exact date tasks into render', focusScript.includes('function getDateTasksForDisplay')
    && focusScript.includes("calendar_item_type: 'due'")
    && focusScript.includes("calendar_item_type: 'start'")
    && focusScript.includes('tasks: taskAssignments.get(c.id) || []')
    && focusScript.includes('renderContainerTasks(item.tasks)'));
assert('Focus calendar container card renders task list markup', focusScript.includes('function renderContainerTasks')
    && focusScript.includes('container-tasks')
    && focusScript.includes('container-task-item')
    && focusScript.includes('task-item-title')
    && focusScript.includes('task-item-type task-item-${type}')
    && focusScript.includes("type === 'due' ? '结束' : '开始'")
    && !focusScript.includes('task-priority-dot')
    && !focusScript.includes('task-item-dur'));
assert('Focus today tomorrow task display matches Calendar start marker style',
    focusCss.includes('.task-item-type')
    && focusCss.includes('.task-item-start')
    && focusCss.includes('color: #047857')
    && focusCss.includes('.container-task-item.start')
    && focusCss.includes('.container-task-item.due')
    && focusCss.includes('.task-item-due')
    && focusCss.includes('color: #b91c1c')
    && !focusCss.includes('.task-priority-dot'));
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
assert('Dashboard task_id URL opens matching current task card', focusScript.includes("new URLSearchParams(window.location.search).get('task_id')")
    && focusScript.includes('data-task-card-id')
    && focusScript.includes("scrollIntoView({ block: 'center'"));
assert('Dashboard current task card details show start_date when present',
    focusScript.includes('const startDate = task.start_date')
    && focusScript.includes('startDateText')
    && focusScript.includes('start-date-item')
    && focusScript.includes('开始 ${startDateText}'));
assert('Dashboard current task card omits empty start_date meta',
    focusScript.includes("startDateText ? `<span class=\"meta-item start-date-item\"")
    && focusCss.includes('.start-date-item'));
assert('Dashboard current task column appends today journal entry', focusScript.includes('renderTodayJournalEntry(todayStr, now)')
    && focusScript.includes('daily-journal-entry')
    && focusScript.includes('data-action="open-today-journal"')
    && focusScript.includes('今日总结'));
assert('Dashboard current task body scrolls separately from fixed today journal entry', focusScript.includes('current-task-scroll-body custom-scrollbar')
    && /current-task-scroll-body custom-scrollbar[\s\S]*\$\{html\}[\s\S]*<\/div>[\s\S]*\$\{journalEntryHTML\}/.test(focusScript)
    && /current-task-scroll-body custom-scrollbar[\s\S]*empty-state[\s\S]*<\/div>[\s\S]*\$\{journalEntryHTML\}/.test(focusScript));
assert('Dashboard today journal uses delegated actions and URL parameter', focusScript.includes("action === 'open-today-journal'")
    && focusScript.includes("new URLSearchParams(window.location.search).get('journal_date')")
    && focusScript.includes('openDailyJournalModal(date)'));
assert('Dashboard today journal modal supports draft and submit actions', focusScript.includes('data-action="save-daily-journal-draft"')
    && focusScript.includes('data-action="submit-daily-journal"')
    && focusScript.includes('TimeWhereDB.saveDailyJournalDraft')
    && focusScript.includes('TimeWhereDB.submitDailyJournal'));
assert('Dashboard today journal CSS exists for entry and modal', focusCss.includes('.daily-journal-entry')
    && focusCss.includes('.daily-journal-modal')
    && focusCss.includes('.journal-review-layout')
    && focusCss.includes('.journal-note-card'));
assert('Dashboard today journal modal uses aligned review layout', focusScript.includes('journal-review-layout')
    && focusScript.includes('renderJournalPlannedTaskReview')
    && focusScript.includes('journal-summary-field')
    && focusScript.includes('journal-note-card')
    && focusScript.includes('journal-note-title')
    && focusScript.includes('data-journal-field="${escapeAttribute(name)}"')
    && focusScript.includes('aria-label="${escapeAttribute(label)}"')
    && focusScript.includes('placeholder="补充说明..."')
    && focusScript.includes('计划延误说明')
    && focusScript.includes('计划外完成说明')
    && focusCss.includes('grid-template-columns: repeat(2, minmax(0, 1fr))')
    && /journal-section[\s\S]*height:\s*100%/.test(focusCss)
    && /journal-note-card[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column[\s\S]*min-height:\s*120px[\s\S]*height:\s*100%/.test(focusCss)
    && /journal-note-title[\s\S]*flex-shrink:\s*0/.test(focusCss)
    && /journal-note-card textarea[\s\S]*flex:\s*1/.test(focusCss)
    && /journal-summary-field[\s\S]*grid-column:\s*1 \/ -1/.test(focusCss)
    && /@media \(max-width:\s*720px\)[\s\S]*journal-review-layout[\s\S]*grid-template-columns:\s*1fr/.test(focusCss));
assert('Dashboard today journal task statuses use green completed and red delayed markers', focusScript.includes("statusClass = 'completed'")
    && focusScript.includes("statusIcon = 'check_circle'")
    && focusScript.includes("statusClass = 'delayed'")
    && focusScript.includes("statusIcon = 'close'")
    && focusCss.includes('.journal-task-status.completed')
    && focusCss.includes('color: #047857')
    && focusCss.includes('.journal-task-status.delayed')
    && focusCss.includes('color: #dc2626'));
assert('Dashboard week progress includes weekly journal summary area', focusHtml.includes('weekly-journal-section')
    && focusHtml.includes('本周总结')
    && focusHtml.includes('weekly-journal-grid'));
assert('Dashboard week progress body scrolls separately from fixed weekly journal summary', focusHtml.includes('weekly-progress-scroll-body custom-scrollbar')
    && focusHtml.indexOf('weekly-progress-scroll-body') < focusHtml.indexOf('weekly-journal-section')
    && /<\/div>\s*<div class="weekly-journal-section">/.test(focusHtml));
assert('Dashboard weekly journal renders Monday through Sunday', focusScript.includes("const weekLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];")
    && focusScript.includes('weekLabels.map((label, index) =>'));
assert('Dashboard weekly journal days open matching journal date with delegated action', focusScript.includes('data-action="open-today-journal"')
    && focusScript.includes('data-journal-date="${escapeAttribute(dateStr)}"')
    && focusScript.includes("action === 'open-today-journal'"));
assert('Dashboard weekly journal submitted pending and overdue states exist', focusScript.includes("journal?.status === 'submitted'")
    && focusScript.includes("'submitted'")
    && focusScript.includes("'overdue'")
    && focusScript.includes("'pending'")
    && focusCss.includes('.weekly-journal-day.submitted')
    && focusCss.includes('.weekly-journal-day.overdue')
    && focusCss.includes('.weekly-journal-day.pending'));
assert('Dashboard summary entries stay fixed while middle content scrolls', /column-now \.column-content,\s*\.column-week \.column-content[\s\S]*overflow:\s*hidden/.test(focusCss)
    && /current-task-scroll-body,[\s\S]*weekly-progress-scroll-body[\s\S]*overflow-y:\s*auto/.test(focusCss)
    && /daily-journal-entry[\s\S]*flex-shrink:\s*0/.test(focusCss)
    && /weekly-journal-section[\s\S]*flex-shrink:\s*0/.test(focusCss));
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
    && popupScript.includes('task-action-controls'));
assert('Popup current task card renders status labels for all progress states',
    popupScript.includes('function getPopupTaskStatusLabel')
    && popupScript.includes("text: '未开始', className: 'not-started'")
    && popupScript.includes("text: '进行中', className: 'in-progress'")
    && popupScript.includes("text: '已完成', className: 'completed'")
    && popupScript.includes('popup-task-status-label'));
assert('Popup current task card renders existing checklist only',
    popupScript.includes('function renderPopupTaskChecklist')
    && popupScript.includes('if (checklist.length === 0) return')
    && popupScript.includes('popup-task-checklist-item')
    && popupScript.includes('data-action="toggle-popup-checklist"'));
assert('Popup checklist toggle uses delegated action and updateChecklist',
    popupScript.includes("action === 'toggle-popup-checklist'")
    && popupScript.includes('togglePopupTaskChecklist')
    && popupScript.includes('TimeWhereDB.updateChecklist(taskId, checklist)'));
assert('Popup normal task actions and defer buttons are inside card', popupScript.includes('data-action="start"')
    && popupScript.includes('data-action="pause"')
    && popupScript.includes('data-action="complete"')
    && popupScript.includes('defer-label')
    && popupScript.includes('defer-options')
    && popupScript.includes('data-action="defer"')
    && popupScript.includes('data-days="1"')
    && popupScript.includes('data-days="3"')
    && popupScript.includes('data-days="7"'));
assert('Popup defer updates due_date instead of start_date', /async function deferTask[\s\S]*baseDate = task\?\.due_date \|\| task\?\.deadline \|\| formatDateISO\(today\)/.test(popupScript)
    && /async function deferTask[\s\S]*updateTask\(taskId, \{ due_date: formatDateISO\(target\) \}\)/.test(popupScript)
    && !/async function deferTask[\s\S]*updateTask\(taskId, \{ start_date: nextStartDate \}\)/.test(popupScript));
assert('Popup ManageBac branch renders blocked defer text and no defer buttons', popupScript.includes('isManageBacSourceTask')
    && popupScript.includes('defer-blocked-text')
    && /const deferHtml = isManageBacSource[\s\S]*defer-blocked-text[\s\S]*: `<div class="popup-defer-group"[\s\S]*data-action="defer"/.test(popupScript));
assert('Popup CSS defines status checklist and compact action controls',
    popupCss.includes('.popup-task-status-label.not-started')
    && popupCss.includes('.popup-task-status-label.in-progress')
    && popupCss.includes('.popup-task-status-label.completed')
    && popupCss.includes('.popup-task-checklist')
    && popupCss.includes('.task-action-controls')
    && popupCss.includes('.popup-defer-group')
    && popupCss.includes('.defer-options')
    && /\.popup-defer-group\s*\{[\s\S]*border: 1px dashed/.test(popupCss)
    && popupCss.includes('min-height: 32px'));
assert('Popup action success reloads task and header counts', popupScript.includes('await reloadPopup()'));
assert('Popup action failure shows toast', popupScript.includes('showToast(`操作失败：${error.message}`'));
assert('Popup CSS no longer contains quick action or stat card styles', !/quick-actions|stats-section|stat-card|action-btn/.test(popupCss));

console.log('\n' + '='.repeat(44));
console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
if (failed > 0) process.exit(1);
