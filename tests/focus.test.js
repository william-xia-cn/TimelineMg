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
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
const backgroundScript = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(root, 'extension', 'popup', 'popup.html'), 'utf8');
const sidepanelHtml = fs.readFileSync(path.join(root, 'extension', 'popup', 'sidepanel.html'), 'utf8');
const popupCss = fs.readFileSync(path.join(root, 'extension', 'popup', 'popup.css'), 'utf8');
const popupScript = fs.readFileSync(path.join(root, 'extension', 'popup', 'popup.js'), 'utf8');
const calendarScript = fs.readFileSync(path.join(root, 'extension', 'pages', 'calendar', 'script.js'), 'utf8');
const dashboardQuickAddPanelBlock = (focusScript.match(/async function openDashboardQuickAddTaskPanel[\s\S]*?function closeDashboardQuickAddTaskPanel/) || [''])[0];

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
assert('Extension action opens Side Panel by default, not default popup',
    manifest.permissions.includes('sidePanel')
    && manifest.side_panel?.default_path === 'popup/sidepanel.html'
    && !Object.prototype.hasOwnProperty.call(manifest.action || {}, 'default_popup'));
assert('Background configures toolbar click to open Side Panel with capability guard',
    backgroundScript.includes('chrome.sidePanel?.setPanelBehavior')
    && backgroundScript.includes('openPanelOnActionClick: true')
    && backgroundScript.includes('configureSidePanel()'));
assert('Side Panel page reuses Popup assets and runtime dependencies',
    sidepanelHtml.includes('class="popup-body sidepanel-body"')
    && sidepanelHtml.includes('<link rel="stylesheet" href="popup.css">')
    && sidepanelHtml.includes('../shared/js/icons.js')
    && sidepanelHtml.includes('../shared/js/dexie.js')
    && sidepanelHtml.includes('../shared/js/db.js')
    && sidepanelHtml.includes('../shared/js/google-sync.js')
    && sidepanelHtml.includes('../shared/js/scheduling.js')
    && sidepanelHtml.includes('<script src="popup.js"></script>'));
assert('Side Panel keeps Popup menu content and exposes four bottom navigation entries',
    sidepanelHtml.includes('id="taskSummary"')
    && sidepanelHtml.includes('id="currentTaskList"')
    && sidepanelHtml.includes('id="sidepanelBottomActions"')
    && sidepanelHtml.includes('id="btnOpenDashboard"')
    && sidepanelHtml.includes('仪表盘')
    && sidepanelHtml.includes('id="btnOpenTasks"')
    && sidepanelHtml.includes('任务')
    && sidepanelHtml.includes('id="btnOpenCalendar"')
    && sidepanelHtml.includes('日历')
    && sidepanelHtml.includes('id="btnSettings"')
    && sidepanelHtml.includes('设置')
    && !sidepanelHtml.includes('btnOpenPopup')
    && !sidepanelHtml.includes('打开浮窗')
    && !sidepanelHtml.includes('btnOpenFull')
    && popupScript.includes('function openExtensionPage')
    && popupScript.includes("openExtensionPage('pages/focus/focus.html')")
    && popupScript.includes("openExtensionPage('pages/tasks/tasks.html')")
    && popupScript.includes("openExtensionPage('pages/calendar/calendar.html')")
    && popupScript.includes('chrome.runtime.openOptionsPage()'));
assert('Side Panel renders Dashboard-style temporary task and journal entries before footer only in sidepanel',
    /id="currentTaskList"[\s\S]*id="sidepanelBottomActions"[\s\S]*<footer class="popup-footer sidepanel-footer"/.test(sidepanelHtml)
    && !popupHtml.includes('sidepanelBottomActions')
    && popupScript.includes('function renderSidepanelBottomActions')
    && popupScript.includes('未计划的任务添加')
    && popupScript.includes('比如课后作业及其他临时任务')
    && popupScript.includes('临时添加任务')
    && popupScript.includes('今日总结')
    && popupScript.includes('整理今日总结')
    && popupScript.includes('查看今日总结'));
assert('Side Panel temporary task add runs in place with English homework defaults',
    popupScript.includes("const SIDEPANEL_QUICK_ADD_DEFAULT_PLAN_KEYWORD = 'English'")
    && popupScript.includes("const SIDEPANEL_QUICK_ADD_BUCKET_NAME = '作业'")
    && popupScript.includes("actionEl.dataset.action === 'quick-add-current-task'")
    && popupScript.includes('openSidepanelQuickAddTaskModal')
    && popupScript.includes('saveSidepanelQuickAddTask')
    && popupScript.includes('TimeWhereDB.ensureBucketTemplateForPlan(plan.id, getSidepanelQuickAddBucketTemplateForPlan(plan))')
    && /const payload|await TimeWhereDB\.addTask\(\{[\s\S]*plan_id:\s*planId[\s\S]*bucket_id:\s*bucketValue \? parseInt\(bucketValue, 10\) : null[\s\S]*start_date:\s*document\.getElementById\('sidepanelQuickAddStartDate'\)\?\.value \|\| todayStr[\s\S]*due_date:\s*document\.getElementById\('sidepanelQuickAddDueDate'\)\?\.value \|\| todayStr[\s\S]*duration:\s*parseInt\(document\.getElementById\('sidepanelQuickAddDuration'\)\?\.value \|\| '30', 10\) \|\| 30/.test(popupScript));
assert('Side Panel today journal opens and saves in place', popupScript.includes("actionEl.dataset.action === 'open-today-journal'")
    && popupScript.includes('openDailyJournalModal')
    && popupScript.includes('buildDailyJournalDraft')
    && popupScript.includes('data-action="save-daily-journal-draft"')
    && popupScript.includes('data-action="submit-daily-journal"')
    && popupScript.includes('TimeWhereDB.saveDailyJournalDraft')
    && popupScript.includes('TimeWhereDB.submitDailyJournal'));
assert('Popup and Side Panel current task cards use expandable partial complete panels',
    popupScript.includes('const partialCompleteBtn = !isManageBacSource')
    && popupScript.includes('data-action="toggle-partial-complete-menu"')
    && popupScript.includes('data-partial-complete-menu-for')
    && popupScript.includes('popup-partial-complete-panel')
    && popupScript.includes("actionEl.dataset.action === 'toggle-partial-complete-menu'")
    && popupScript.includes('togglePopupTaskPartialCompleteMenu(actionEl.dataset.taskId)')
    && popupScript.includes("actionEl.dataset.action === 'partial-complete-ratio'")
    && popupScript.includes('savePopupTaskPartialCompleteRatio')
    && popupScript.includes('data-action="toggle-partial-complete-checklist"')
    && popupScript.includes('savePopupTaskPartialCompleteChecklistItem')
    && popupScript.includes('const checklistActionEl = event.target.closest(\'[data-action="toggle-partial-complete-checklist"]\')')
    && popupScript.includes('checklistActionEl.checked'));
assert('Popup partial complete uses checklist metadata and updateChecklist',
    popupScript.includes('const PARTIAL_COMPLETION_RATIOS = [10, 20, 30, 50, 70, 80, 90]')
    && popupScript.includes("type: 'partial_completion'")
    && popupScript.includes('partial_group_id')
    && popupScript.includes("partial_role: 'done'")
    && popupScript.includes("partial_role: 'remaining'")
    && popupScript.includes('partial_percent: safePercent')
    && popupScript.includes('replacePartialCompletionChecklistGroup')
    && popupScript.includes('TimeWhereDB.updateChecklist(taskId, nextChecklist)')
    && popupScript.includes("showToast('ManageBac 来源任务不能使用部分完成', 'error')"));
assert('Popup partial complete checklist saves only from change with current checked state',
    popupScript.includes("if (actionEl.dataset.action === 'toggle-partial-complete-checklist')")
    && !/actionEl\.dataset\.action === 'toggle-partial-complete-checklist'[\s\S]{0,240}savePopupTaskPartialCompleteChecklistItem/.test(popupScript)
    && !popupScript.includes('!actionEl.checked')
    && /const checklistActionEl = event\.target\.closest\('\[data-action="toggle-partial-complete-checklist"\]'\)[\s\S]*savePopupTaskPartialCompleteChecklistItem\([\s\S]*checklistActionEl\.checked/.test(popupScript));
assert('Popup CSS keeps fixed popup size and adds Side Panel adaptive layout',
    /body\s*\{[\s\S]*width:\s*360px;[\s\S]*height:\s*560px;/.test(popupCss)
    && popupCss.includes('body.sidepanel-body')
    && popupCss.includes('width: 100vw')
    && popupCss.includes('height: 100vh')
    && popupCss.includes('min-width: 320px')
    && popupCss.includes('.sidepanel-body .popup-container')
    && popupCss.includes('grid-template-columns: repeat(4, minmax(0, 1fr))')
    && popupCss.includes('.sidepanel-body .footer-btn')
    && popupCss.includes('flex-direction: row')
    && popupCss.includes('background: rgba(29, 140, 248, 0.08)')
    && popupCss.includes('.sidepanel-fixed-actions')
    && popupCss.includes('.sidepanel-body .current-task-quick-add')
    && popupCss.includes('.sidepanel-body .daily-journal-entry')
    && popupCss.includes('.sidepanel-daily-journal-modal')
    && /sidepanel-daily-journal-modal[\s\S]*height:\s*calc\(100vh - 24px\)/.test(popupCss)
    && /sidepanel-journal-body[\s\S]*flex:\s*1 1 auto[\s\S]*min-height:\s*0[\s\S]*overflow-y:\s*auto/.test(popupCss)
    && /sidepanel-daily-journal-modal \.popup-modal-footer[\s\S]*position:\s*sticky[\s\S]*bottom:\s*0/.test(popupCss)
    && popupCss.includes('.sidepanel-body .popup-task-detail-modal')
    && popupCss.includes('.popup-partial-complete-panel')
    && popupCss.includes('.partial-complete-ratio-grid'));
assert('Dashboard title uses 当前任务 and not 当下任务', focusHtml.includes('<h2>当前任务</h2>')
    && !/当下任务/.test(focusHtml + focusScript));
assert('Focus pomodoro widget and init path are removed', !/pomodoroWidget|pomo|Pomodoro|initPomodoro|renderPomodoro|togglePomodoro/.test(focusHtml + focusScript + focusCss));
assert('Focus static add task buttons use delegated action', !/onclick\s*=/.test(focusHtml)
    && /class="add-task-btn"[^>]*data-action="add-task"/.test(focusHtml));
assert('current task card actions use data-action', /data-action="start"/.test(focusScript)
    && /data-action="pause"/.test(focusScript)
    && /data-action="complete"/.test(focusScript));
assert('Current task action buttons are neutral by default and only busy/pressed turns dark',
    !focusScript.includes('btn-micro primary" data-action="start"')
    && !focusScript.includes('btn-micro primary" data-action="complete"')
    && !popupScript.includes('btn-micro primary" data-action="start"')
    && !popupScript.includes('btn-micro primary" data-action="complete"')
    && focusCss.includes('.task-action-controls .btn-micro[data-busy="true"]')
    && focusCss.includes('.task-action-controls .btn-micro:active')
    && popupCss.includes('.task-action-controls .btn-micro[data-busy="true"]')
    && popupCss.includes('.task-action-controls .btn-micro:active')
    && focusScript.includes('btn-micro primary current-task-quick-add-action')
    && popupScript.includes('btn-micro primary current-task-quick-add-action')
    && focusScript.includes('btn-micro primary" data-action="open-today-journal"')
    && popupScript.includes('btn-micro primary" data-action="open-today-journal"'));
assert('Dashboard current task cards expose partial complete for local tasks',
    focusScript.includes('data-action="toggle-partial-complete-menu"')
    && focusScript.includes('data-partial-complete-menu-for')
    && focusScript.includes('partial-complete-panel')
    && focusScript.includes('部分完成')
    && focusScript.includes('!isManageBacSource')
    && focusScript.includes("action === 'toggle-partial-complete-menu'")
    && focusScript.includes('toggleCurrentTaskPartialCompleteMenu(taskId)')
    && focusScript.includes("action === 'partial-complete-ratio'")
    && focusScript.includes('saveCurrentTaskPartialCompleteRatio')
    && focusScript.includes('data-action="toggle-partial-complete-checklist"')
    && focusScript.includes('saveCurrentTaskPartialCompleteChecklistItem'));
assert('Dashboard partial complete uses checklist metadata and immediate updateChecklist',
    focusScript.includes('const PARTIAL_COMPLETION_RATIOS = [10, 20, 30, 50, 70, 80, 90]')
    && focusScript.includes("type: 'partial_completion'")
    && focusScript.includes('partial_group_id')
    && focusScript.includes("partial_role: 'done'")
    && focusScript.includes("partial_role: 'remaining'")
    && focusScript.includes('partial_percent: safePercent')
    && focusScript.includes('replacePartialCompletionChecklistGroup')
    && focusScript.includes('TimeWhereDB.updateChecklist(taskId, nextChecklist)')
    && focusScript.includes('TimeWhereDB.updateChecklist(taskId, checklist)')
    && focusScript.includes("showToast('ManageBac 来源任务不能使用部分完成', 'error')"));
assert('Current task partial complete preserves expanded task while reloading',
    focusScript.includes('let dashboardCurrentTaskExpandedTaskId = null')
    && focusScript.includes('const requestedExpandedTaskId = targetTaskId || dashboardCurrentTaskExpandedTaskId')
    && focusScript.includes('dashboardCurrentTaskExpandedTaskId = String(taskId)')
    && focusScript.includes('reopenCurrentTaskPartialCompleteMenu(taskId)')
    && focusScript.includes('ensureDashboardCurrentTaskVisible(taskId)')
    && popupScript.includes('let popupCurrentTaskExpandedTaskId = null')
    && popupScript.includes('const anchoredIndex = popupCurrentTaskExpandedTaskId')
    && popupScript.includes('const expandedIndex = anchoredIndex >= 0 ? anchoredIndex : (inProgressIndex >= 0 ? inProgressIndex : 0)')
    && popupScript.includes('popupCurrentTaskExpandedTaskId = String(taskId)')
    && popupScript.includes('popupPartialCompleteReopenTaskId = String(taskId)'));
assert('Dashboard current task defer uses expandable menu with dated options', focusScript.includes('data-action="toggle-defer-menu"')
    && focusScript.includes('aria-expanded="false"')
    && focusScript.includes('data-defer-menu-for')
    && focusScript.includes('延后会向后修改任务截止日期')
    && focusScript.includes("action === 'toggle-defer-menu'")
    && focusScript.includes('toggleCurrentTaskDeferMenu(taskId)')
    && /data-action="defer"[\s\S]*data-task-id/.test(focusScript)
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
assert('Dashboard defer toggle is in right-aligned action controls and options render below',
    focusScript.includes('task-action-controls')
    && focusScript.includes('task-action-stack')
    && focusScript.includes('deferToggleHtml')
    && focusScript.includes('deferMenuHtml')
    && focusScript.includes('defer-options-panel')
    && focusScript.includes('defer-options')
    && focusScript.includes('>1天</button>')
    && /task-action-controls[\s\S]*progressBtns[\s\S]*deferToggleHtml/.test(focusScript)
    && /task-action-stack[\s\S]*task-action-controls[\s\S]*deferMenuHtml/.test(focusScript));
assert('Dashboard current task card opens local detail modal from content area',
    focusScript.includes('task-detail-open-zone')
    && focusScript.includes('data-action="open-current-task-detail"')
    && /<div class="task-title" data-task-id="\$\{taskId\}">/.test(focusScript)
    && !/<div class="task-title"[^>]*data-action="open-current-task-detail"/.test(focusScript)
    && focusScript.includes("const detailZone = actionEl.closest('.task-detail-open-zone')")
    && focusScript.includes("const taskDetails = actionEl.closest('details')")
    && focusScript.includes('if (!detailZone || !taskDetails?.open) return')
    && focusScript.includes('openCurrentTaskDetailModal')
    && focusScript.includes('saveCurrentTaskDetailModal')
    && focusScript.includes('currentTaskDetailModal')
    && focusCss.includes('.task-detail-open-zone')
    && !focusScript.includes('btn-task-detail'));
assert('Dashboard exposes copyable debug snapshot for current runtime data',
    focusHtml.includes('data-action="copy-debug-snapshot"')
    && focusHtml.includes('诊断快照')
    && focusScript.includes('async function buildFocusDebugSnapshot')
    && focusScript.includes('daily_settle')
    && focusScript.includes('arrange_preview')
    && focusScript.includes('matrixview_subject_mappings')
    && focusScript.includes('navigator.clipboard.writeText')
    && focusScript.includes("action === 'copy-debug-snapshot'")
    && focusCss.includes('.debug-snapshot-btn'));
assert('Dashboard debug snapshot avoids obvious secret and raw link settings',
    focusScript.includes("task_arrange_dirty_at")
    && focusScript.includes("task_arrange_last_checked_at")
    && focusScript.includes("task_arrange_last_run_at")
    && !focusScript.includes("safeSettings.google")
    && !focusScript.includes("safeSettings.token")
    && !focusScript.includes("safeSettings.managebac_ics_url")
    && !focusScript.includes("safeSettings.managebac_link"));
assert('delegated click listener handles Focus actions', focusScript.includes("document.addEventListener('click', handleFocusDelegatedClick)")
    && focusScript.includes('function handleFocusDelegatedClick'));
assert('Dashboard weekly task list opens local task detail modal instead of toggling or leaving Dashboard', focusScript.includes('data-action="open-task-detail"')
    && focusScript.includes("action === 'open-task-detail'")
    && focusScript.includes('openCurrentTaskDetailModal(taskId)')
    && !focusScript.includes('openTaskDetailInPlanner')
    && !focusScript.includes('../tasks/tasks.html?task_id=')
    && !focusScript.includes('data-action="week-toggle"')
    && !focusScript.includes('toggleWeekTask'));
assert('ManageBac source tasks render non-clickable defer blocked text', focusScript.includes('isManageBacSourceTask')
    && focusScript.includes('defer-blocked-text')
    && focusScript.includes('ManageBac 来源任务不能延后'));
assert('ManageBac source defer branch does not render defer buttons',
    /const deferBlockedHtml = isManageBacSource[\s\S]*defer-blocked-text/.test(focusScript)
    && /const deferToggleHtml = !isManageBacSource[\s\S]*data-action="toggle-defer-menu"/.test(focusScript)
    && /const deferMenuHtml = !isManageBacSource[\s\S]*data-action="defer"/.test(focusScript));
assert('Dashboard current task CSS defines status checklist and action alignment',
    focusCss.includes('.task-status-label.not-started')
    && focusCss.includes('.task-status-label.in-progress')
    && focusCss.includes('.task-status-label.completed')
    && focusCss.includes('.current-task-checklist')
    && focusCss.includes('.task-action-controls')
    && focusCss.includes('.task-action-stack')
    && focusCss.includes('.defer-options-panel')
    && focusCss.includes('.defer-hint')
    && focusCss.includes('.defer-options')
    && /\.defer-options-panel\s*\{[\s\S]*border: 1px solid/.test(focusCss)
    && /\.defer-options-panel\[hidden\]\s*\{[\s\S]*display:\s*none/.test(focusCss)
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
assert('Dashboard owns automatic Task Arrange review trigger without fresh throttle', focusHtml.includes('../../shared/js/managebac.js')
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
assert('Focus layout uses 4-column 40/40/10/10 ratio for wide screens', /board-column\s*{[\s\S]*?flex:\s*1 1 40%/.test(focusCss)
    && /column-calendar\s*{[\s\S]*?flex:\s*1 1 40%/.test(focusCss)
    && /column-week[\s\S]*?flex:\s*1 1 10%/.test(focusCss)
    && /column-feed[\s\S]*?flex:\s*1 1 10%/.test(focusCss));
assert('Focus viewport-specific formula is removed for modernized board layout', !focusCss.includes('--focus-first-viewport-width')
    && focusCss.includes('min-width: 220px'));
assert('Focus board still scrolls only when needed', /board-layout[\s\S]*overflow-x:\s*auto/.test(focusCss));
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
assert('Popup renders Daily Settle displayTasks list', popupScript.includes('settle.displayTasks || settle.currentTasks || []')
    && popupScript.includes('renderCurrentTaskList(displayTasks)')
    && popupScript.includes('tasks.map((task, index) => renderCurrentTaskCard(task, index, expandedIndex))'));
assert('Dashboard current task column renders Daily Settle displayTasks list',
    focusScript.includes('const displayTasks = settle.displayTasks || settle.currentTasks || []')
    && focusScript.includes('displayTasks.forEach((task, index)')
    && focusScript.includes("assignment.status !== 'unassigned'"));
assert('Dashboard current task column marks unassigned tasks without hiding actions',
    focusScript.includes('tag-unassigned')
    && focusScript.includes('当前未分配')
    && focusScript.includes('task-unassigned')
    && focusScript.includes('data-action="start"')
    && focusScript.includes('data-action="complete"')
    && focusScript.includes('data-action="defer"'));
assert('Popup current task list marks unassigned tasks from Daily Settle display model',
    popupScript.includes("assignment.status === 'unassigned'")
    && popupScript.includes('task-tag unassigned')
    && popupScript.includes('popup-task-card${assignment.status')
    && popupScript.includes('当前未分配'));
assert('Popup does not fallback to one current task or sorted pool', !popupScript.includes('currentTasks[0] || sortedPool[0]')
    && !popupScript.includes('sortedPool[0]'));
assert('Popup current task list expands only one task, preferring current anchor then in-progress task', popupScript.includes('const anchoredIndex = popupCurrentTaskExpandedTaskId')
    && popupScript.includes('const inProgressIndex = tasks.findIndex')
    && popupScript.includes('const expandedIndex = anchoredIndex >= 0 ? anchoredIndex : (inProgressIndex >= 0 ? inProgressIndex : 0)')
    && popupScript.includes('const isExpanded = index === expandedIndex')
    && popupScript.includes('class="task-card popup-task-card${assignment.status'));
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
assert('Dashboard current task column renders quick add before today journal', focusScript.includes('const quickAddHTML = renderCurrentTaskQuickAdd(todayStr)')
    && focusScript.includes('current-task-quick-add')
    && focusScript.includes('<div class="current-task-quick-add-icon"><span class="material-symbols-outlined">playlist_add</span></div>')
    && focusScript.includes('current-task-quick-add-copy')
    && focusScript.includes('未计划的任务添加')
    && focusScript.includes('比如课后作业及其他临时任务')
    && focusScript.includes('current-task-quick-add-action')
    && focusScript.includes('临时添加任务')
    && !focusScript.includes('Other School · 事项 · 今天')
    && !focusScript.includes('current-task-quick-add-meta')
    && /current-task-scroll-body custom-scrollbar[\s\S]*\$\{html\}[\s\S]*<\/div>[\s\S]*\$\{quickAddHTML\}[\s\S]*\$\{journalEntryHTML\}/.test(focusScript)
    && /current-task-scroll-body custom-scrollbar[\s\S]*empty-state[\s\S]*<\/div>[\s\S]*\$\{quickAddHTML\}[\s\S]*\$\{journalEntryHTML\}/.test(focusScript));
assert('Dashboard quick add uses delegated action without inline handler', focusScript.includes('data-action="quick-add-current-task"')
    && focusScript.includes("action === 'quick-add-current-task'")
    && !/current-task-quick-add[\s\S]{0,500}onclick\s*=/.test(focusScript));
assert('Dashboard quick add opens task detail style panel inside current task column', focusScript.includes("const DASHBOARD_QUICK_ADD_DEFAULT_PLAN_KEYWORD = 'English'")
    && focusScript.includes("const DASHBOARD_QUICK_ADD_BUCKET_NAME = '作业'")
    && focusScript.includes("const DASHBOARD_SUBJECT_BUCKET_TEMPLATE = ['上课', '作业', '单元测试', '阶段考试']")
    && focusScript.includes('findDashboardQuickAddDefaultPlan')
    && focusScript.includes('ensureDashboardQuickAddPlanAndBucket')
    && focusScript.includes('openDashboardQuickAddTaskPanel')
    && focusScript.includes("panel.id = 'dashboardQuickAddTaskPanel'")
    && focusScript.includes("section.appendChild(panel)")
    && focusScript.includes('dashboard-task-detail-panel open')
    && focusScript.includes('detail-header')
    && focusScript.includes('detail-body custom-scrollbar')
    && focusScript.includes('detail-title')
    && focusScript.includes('data-field="plan_id"')
    && focusScript.includes('data-action="dashboard-quick-add-plan-change"')
    && focusScript.includes('data-field="bucket_id"')
    && focusScript.includes('data-field="start_date"')
    && focusScript.includes('data-field="due_date"')
    && focusScript.includes('data-field="recurrence_frequency"')
    && focusScript.includes('data-field="recurrence_count"')
    && focusScript.includes('id="dashboardChecklistItems"')
    && focusScript.includes('id="dashboardChecklistNewItem"')
    && focusScript.includes('data-field="labels"')
    && focusScript.includes('data-field="notes"')
    && focusScript.includes('progress-picker')
    && focusScript.includes('priority-picker')
    && focusScript.includes('TimeWhereDB.ensureBucketTemplateForPlan(plan.id, getDashboardQuickAddBucketTemplateForPlan(plan))')
    && focusScript.includes('${renderDashboardQuickAddPlanOptions(plans, plan.id)}')
    && focusScript.includes('${renderDashboardQuickAddBucketOptions(buckets, bucket?.id || null)}')
    && !dashboardQuickAddPanelBlock.includes('modal-overlay'));
assert('Dashboard quick add save uses full detail fields and recurrence when selected', focusScript.includes('saveDashboardQuickAddTask')
    && /const payload = \{[\s\S]*title,[\s\S]*plan_id:\s*planId,[\s\S]*bucket_id:\s*bucketValue \? parseInt\(bucketValue, 10\) : null,[\s\S]*start_date:\s*panel\.querySelector\('\[data-field="start_date"\]'\)\?\.value \|\| todayStr,[\s\S]*due_date:\s*panel\.querySelector\('\[data-field="due_date"\]'\)\?\.value \|\| todayStr,[\s\S]*schedule_time:\s*scheduleTime,[\s\S]*priority:\s*panel\.querySelector\('\.priority-option\.active'\)\?\.dataset\.priority \|\| 'medium',[\s\S]*duration:\s*parseInt\(panel\.querySelector\('\[data-field="duration"\]'\)\?\.value \|\| '30', 10\) \|\| 30,[\s\S]*progress:\s*panel\.querySelector\('\.progress-option\.active'\)\?\.dataset\.progress \|\| 'not_started',[\s\S]*checklist:\s*readDashboardQuickAddChecklist\(panel\),[\s\S]*labels:\s*readDashboardQuickAddLabels\(panel\),[\s\S]*notes:\s*panel\.querySelector\('\[data-field="notes"\]'\)\?\.value \|\| ''/.test(focusScript)
    && focusScript.includes('refreshDashboardQuickAddPlanFields')
    && focusScript.includes('TimeWhereDB.getBucketsByPlan(planId)')
    && focusScript.includes('TimeWhereDB.getLabelsByPlan?.(planId)')
    && focusScript.includes("if (recurrenceFrequency === 'weekly' || recurrenceFrequency === 'monthly')")
    && focusScript.includes('TimeWhereDB.addRecurringTaskSeries(payload')
    && focusScript.includes('await TimeWhereDB.addTask(payload)'));
assert('Dashboard quick add supports button open Enter save refresh and toast', focusScript.includes("document.addEventListener('keydown', handleFocusDelegatedKeydown)")
    && focusScript.includes("if (e.key !== 'Enter') return")
    && focusScript.includes("action === 'quick-add-current-task'")
    && focusScript.includes('addDashboardQuickAddChecklistItem()')
    && focusScript.includes("querySelector('[data-action=\"save-dashboard-quick-add-task\"]')")
    && focusScript.includes("showToast('请输入任务标题', 'error')")
    && focusScript.includes('closeDashboardQuickAddTaskPanel()')
    && focusScript.includes('await loadDashboardData()')
    && focusScript.includes("showToast('任务已添加到今天', 'success')"));
assert('Dashboard quick add CSS defines fixed compact card controls', focusCss.includes('.current-task-quick-add')
    && focusCss.includes('.current-task-quick-add-main')
    && focusCss.includes('.current-task-quick-add-copy h3')
    && focusCss.includes('.current-task-quick-add-action')
    && !focusCss.includes('.current-task-quick-add-submit')
    && !focusCss.includes('.current-task-quick-add-meta')
    && focusCss.includes('.dashboard-task-detail-panel')
    && focusCss.includes('.dashboard-task-detail-panel .detail-header')
    && focusCss.includes('.dashboard-task-detail-panel .detail-title')
    && focusCss.includes('.dashboard-task-detail-panel .recurrence-detail-section')
    && focusCss.includes('.dashboard-task-detail-panel .checklist-list')
    && focusCss.includes('.dashboard-task-detail-panel .labels-picker')
    && focusCss.includes('.dashboard-task-detail-panel .detail-textarea')
    && focusCss.includes('.partial-complete-panel')
    && focusCss.includes('.partial-complete-ratio-grid')
    && /current-task-quick-add\s*\{[\s\S]*flex-shrink:\s*0/.test(focusCss));
assert('Dashboard current task body scrolls separately from fixed today journal entry', focusScript.includes('current-task-scroll-body custom-scrollbar')
    && /current-task-scroll-body custom-scrollbar[\s\S]*\$\{html\}[\s\S]*<\/div>[\s\S]*\$\{quickAddHTML\}[\s\S]*\$\{journalEntryHTML\}/.test(focusScript)
    && /current-task-scroll-body custom-scrollbar[\s\S]*empty-state[\s\S]*<\/div>[\s\S]*\$\{quickAddHTML\}[\s\S]*\$\{journalEntryHTML\}/.test(focusScript));
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
    && focusScript.includes('计划外任务说明')
    && popupScript.includes('计划外任务说明')
    && popupScript.includes('没有计划外任务。')
    && !focusScript.includes('计划外完成说明')
    && !popupScript.includes('计划外完成说明')
    && focusCss.includes('grid-template-columns: repeat(2, minmax(0, 1fr))')
    && /journal-section[\s\S]*height:\s*100%/.test(focusCss)
    && /journal-note-card[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column[\s\S]*min-height:\s*120px[\s\S]*height:\s*100%/.test(focusCss)
    && /journal-note-title[\s\S]*flex-shrink:\s*0/.test(focusCss)
    && /journal-note-card textarea[\s\S]*flex:\s*1/.test(focusCss)
    && /journal-summary-field[\s\S]*grid-column:\s*1 \/ -1/.test(focusCss)
    && /@media \(max-width:\s*720px\)[\s\S]*journal-review-layout[\s\S]*grid-template-columns:\s*1fr/.test(focusCss));
assert('Dashboard today journal task statuses use bordered completed partial and incomplete markers',
    focusScript.includes('renderJournalStatusTaskList')
    && popupScript.includes('renderJournalStatusTaskList')
    && focusScript.includes("statusClass: 'completed'")
    && focusScript.includes("statusIcon: 'check_circle'")
    && focusScript.includes("statusClass: 'partial'")
    && focusScript.includes("statusIcon: 'rule'")
    && focusScript.includes("statusClass: 'incomplete'")
    && focusScript.includes("statusIcon: 'close'")
    && focusCss.includes('.journal-task-status.completed')
    && focusCss.includes('.journal-task-status.partial')
    && focusCss.includes('.journal-task-status.incomplete')
    && focusCss.includes('border: 1px solid var(--border)')
    && focusCss.includes('color: #047857')
    && focusCss.includes('color: #2563eb')
    && focusCss.includes('color: #dc2626')
    && popupCss.includes('.journal-task-status.partial')
    && popupCss.includes('border: 1px solid var(--border)'));
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
assert('Popup normal task actions and expandable defer menu are inside card', popupScript.includes('data-action="start"')
    && popupScript.includes('data-action="pause"')
    && popupScript.includes('data-action="complete"')
    && popupScript.includes('data-action="toggle-partial-complete-menu"')
    && popupScript.includes('data-action="toggle-defer-menu"')
    && popupScript.includes('aria-expanded="false"')
    && popupScript.includes('popup-defer-panel')
    && popupScript.includes('延后会向后修改任务截止日期')
    && popupScript.includes('defer-options')
    && popupScript.includes('togglePopupTaskDeferMenu')
    && popupScript.includes('data-action="defer"')
    && popupScript.includes('data-days="1"')
    && popupScript.includes('data-days="3"')
    && popupScript.includes('data-days="7"'));
assert('Popup current task card opens local detail modal from content area',
    popupScript.includes('task-detail-open-zone')
    && popupScript.includes('data-action="open-current-task-detail"')
    && /<div class="task-title-row" data-task-id="\$\{taskId\}">/.test(popupScript)
    && !/<div class="task-title-row"[^>]*data-action="open-current-task-detail"/.test(popupScript)
    && popupScript.includes("const detailZone = actionEl.closest('.task-detail-open-zone')")
    && popupScript.includes("const taskDetails = actionEl.closest('details')")
    && popupScript.includes('if (!detailZone || !taskDetails?.open) return')
    && popupScript.includes('openCurrentTaskDetailModal')
    && popupScript.includes('saveCurrentTaskDetailModal')
    && popupScript.includes('currentTaskDetailModal')
    && popupCss.includes('.popup-task-detail-modal')
    && !popupScript.includes('btn-task-detail')
    && !popupScript.includes('openTaskDetailInPlanner')
    && !popupScript.includes('pages/tasks/tasks.html?task_id='));
assert('Popup defer updates due_date instead of start_date', /async function deferTask[\s\S]*baseDate = task\?\.due_date \|\| task\?\.deadline \|\| formatDateISO\(today\)/.test(popupScript)
    && /async function deferTask[\s\S]*updateTask\(taskId, \{ due_date: formatDateISO\(target\) \}\)/.test(popupScript)
    && !/async function deferTask[\s\S]*updateTask\(taskId, \{ start_date: nextStartDate \}\)/.test(popupScript));
assert('Popup ManageBac branch renders blocked defer text and no defer buttons', popupScript.includes('isManageBacSourceTask')
    && popupScript.includes('defer-blocked-text')
    && /const deferBlockedHtml = isManageBacSource[\s\S]*defer-blocked-text/.test(popupScript)
    && /const deferToggleHtml = !isManageBacSource[\s\S]*data-action="toggle-defer-menu"/.test(popupScript)
    && /const deferMenuHtml = !isManageBacSource[\s\S]*data-action="defer"/.test(popupScript));
assert('Popup CSS defines status checklist and compact action controls',
    popupCss.includes('.popup-task-status-label.not-started')
    && popupCss.includes('.popup-task-status-label.in-progress')
    && popupCss.includes('.popup-task-status-label.completed')
    && popupCss.includes('.popup-task-checklist')
    && popupCss.includes('.task-action-controls')
    && popupCss.includes('.task-action-stack')
    && popupCss.includes('.popup-defer-panel')
    && popupCss.includes('.popup-partial-complete-panel')
    && popupCss.includes('.defer-hint')
    && popupCss.includes('.defer-options')
    && /\.popup-defer-panel\s*\{[\s\S]*border: 1px solid/.test(popupCss)
    && /\.popup-defer-panel\[hidden\]\s*\{[\s\S]*display:\s*none/.test(popupCss)
    && popupCss.includes('min-height: 32px'));
assert('Popup action success reloads task and header counts', popupScript.includes('await reloadPopup()'));
assert('Popup action failure shows toast', popupScript.includes('showToast(`操作失败：${error.message}`'));
assert('Popup CSS no longer contains quick action or stat card styles', !/quick-actions|stats-section|stat-card|action-btn/.test(popupCss));

console.log('\n' + '='.repeat(44));
console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
if (failed > 0) process.exit(1);
