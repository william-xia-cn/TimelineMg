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
const sidebarHtml = fs.readFileSync(path.join(root, 'extension', 'sidebar', 'sidebar.html'), 'utf8');
const sidebarCss = fs.readFileSync(path.join(root, 'extension', 'sidebar', 'sidebar.css'), 'utf8');
const sidebarScript = fs.readFileSync(path.join(root, 'extension', 'sidebar', 'sidebar.js'), 'utf8');
const sidebarStandaloneHtml = fs.readFileSync(path.join(root, 'tests', 'manual', 'sidebar-standalone.html'), 'utf8');
const calendarScript = fs.readFileSync(path.join(root, 'extension', 'pages', 'calendar', 'script.js'), 'utf8');
const schedulingScript = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'scheduling.js'), 'utf8');
const externalLinksScript = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'external-links.js'), 'utf8');
const googleSyncStatusUi = fs.readFileSync(path.join(root, 'extension', 'shared', 'js', 'google-sync-status-ui.js'), 'utf8');
const googleSyncStatusCss = fs.readFileSync(path.join(root, 'extension', 'shared', 'styles', 'google-sync-status.css'), 'utf8');
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
assert('Popup UI does not use inline onclick/onchange handlers', !/onclick\s*=|onchange\s*=/.test(popupHtml + sidebarScript));
assert('Extension action opens Side Panel by default, not default popup',
    manifest.permissions.includes('sidePanel')
    && manifest.side_panel?.default_path === 'sidebar/sidebar.html'
    && !Object.prototype.hasOwnProperty.call(manifest.action || {}, 'default_popup'));
assert('Background configures toolbar click to open Side Panel with capability guard',
    backgroundScript.includes('chrome.sidePanel?.setPanelBehavior')
    && backgroundScript.includes('openPanelOnActionClick: true')
    && backgroundScript.includes('configureSidePanel()'));
assert('Side Panel page owns Sidebar assets and runtime dependencies',
    sidebarHtml.includes('class="popup-body sidepanel-body"')
    && sidebarHtml.includes('<link rel="stylesheet" href="sidebar.css">')
    && sidebarHtml.includes('../shared/js/icons.js')
    && sidebarHtml.includes('../shared/js/dexie.js')
    && sidebarHtml.includes('../shared/js/db.js')
    && sidebarHtml.includes('../shared/js/google-sync.js')
    && sidebarHtml.includes('../shared/js/external-links.js')
    && sidebarHtml.includes('../shared/js/scheduling.js')
        && sidebarHtml.includes('<script src="sidebar.js"></script>'));
assert('Popup reuses Sidebar task surface instead of owning duplicate popup code',
    popupHtml.includes('../sidebar/sidebar.css')
    && popupHtml.includes('../sidebar/sidebar.js')
    && !popupHtml.includes('href="popup.css"')
    && !popupHtml.includes('src="popup.js"'));
assert('Sidebar has a standalone manual test container with richer mocked local data',
    sidebarStandaloneHtml.includes('../../extension/sidebar/sidebar.css')
    && sidebarStandaloneHtml.includes('../../extension/shared/js/scheduling.js')
    && sidebarStandaloneHtml.includes('../../extension/sidebar/sidebar.js')
    && sidebarStandaloneHtml.indexOf('shared/js/scheduling.js') < sidebarStandaloneHtml.indexOf('extension/sidebar/sidebar.js')
    && sidebarStandaloneHtml.includes('window.TimeWhereDB')
    && sidebarStandaloneHtml.includes('async getAllTasks()')
    && sidebarStandaloneHtml.includes('English Week 4')
    && sidebarStandaloneHtml.includes('Math Practice')
    && sidebarStandaloneHtml.includes('CAS Evidence')
    && sidebarStandaloneHtml.includes('Draft English paragraph for Week 4')
    && sidebarStandaloneHtml.includes('Math practice: linear equations')
    && sidebarStandaloneHtml.includes('ManageBac sample: reading response')
    && sidebarStandaloneHtml.includes("progress: 'in_progress'")
    && sidebarStandaloneHtml.includes("progress: 'not_started'")
    && sidebarStandaloneHtml.includes("schedule_time: '16:30'")
    && sidebarStandaloneHtml.includes("source: 'managebac'")
    && sidebarStandaloneHtml.includes('window.TimeWherePlatform')
    && !sidebarStandaloneHtml.includes('../../extension/popup/popup.js'));
assert('Dashboard Popup and Sidebar load external link helper after platform adapter',
    focusHtml.includes('shared/js/external-links.js')
    && popupHtml.includes('shared/js/external-links.js')
    && sidebarHtml.includes('shared/js/external-links.js')
    && focusHtml.indexOf('shared/js/platform.js') < focusHtml.indexOf('shared/js/external-links.js')
    && popupHtml.indexOf('shared/js/platform.js') < popupHtml.indexOf('shared/js/external-links.js')
    && sidebarHtml.indexOf('shared/js/platform.js') < sidebarHtml.indexOf('shared/js/external-links.js'));
assert('Dashboard Popup and Sidebar load shared Google sync status UI',
    focusHtml.includes('shared/styles/google-sync-status.css')
    && focusHtml.includes('shared/js/google-sync-status-ui.js')
    && focusHtml.indexOf('shared/js/desktop-sync-service.js') < focusHtml.indexOf('shared/js/google-sync-status-ui.js')
    && popupHtml.includes('shared/styles/google-sync-status.css')
    && popupHtml.includes('shared/js/google-sync-status-ui.js')
    && sidebarHtml.includes('shared/styles/google-sync-status.css')
    && sidebarHtml.includes('shared/js/google-sync-status-ui.js'));
assert('Dashboard initializes Google sync status from existing avatar account entry',
    focusHtml.includes('class="user-avatar"')
    && focusScript.includes('TimeWhereGoogleSyncStatusUI?.init?.()')
    && focusScript.includes('TimeWhereGoogleSyncStatusUI?.refreshAll?.()')
    && !focusScript.includes('setTransientStatus'));
assert('Popup and Sidebar use Settings button as compact sync status entry',
    popupHtml.includes('id="btnSettings"')
    && sidebarHtml.includes('id="btnSettings"')
    && sidebarScript.includes('TimeWhereGoogleSyncStatusUI?.init?.()')
    && googleSyncStatusUi.includes('attachSettingsButton')
    && googleSyncStatusCss.includes('.google-sync-settings-status-button'));
assert('Shared Google sync status UI defines avatar dot states and popover actions',
    googleSyncStatusUi.includes('Google 未连接')
    && googleSyncStatusUi.includes('Google 已连接')
    && googleSyncStatusUi.includes('同步排队中')
    && googleSyncStatusUi.includes('同步失败')
    && googleSyncStatusUi.includes('有冲突待处理')
    && googleSyncStatusUi.includes('Google 账户不匹配')
    && googleSyncStatusUi.includes('打开同步设置')
    && googleSyncStatusUi.includes('查看同步记录')
    && googleSyncStatusUi.includes('account_picture')
    && googleSyncStatusUi.includes('google-sync-account-initial')
    && !googleSyncStatusUi.includes('setTransientStatus')
    && googleSyncStatusCss.includes('.google-sync-account-button')
    && googleSyncStatusCss.includes('.google-sync-account-popover')
    && googleSyncStatusCss.includes('.google-sync-status-dot.syncing')
    && googleSyncStatusCss.includes('.google-sync-status-dot.queued'));
assert('Sidebar owns menu content and exposes four bottom navigation entries',
    sidebarHtml.includes('id="taskSummary"')
    && sidebarHtml.includes('id="currentTaskList"')
    && sidebarHtml.includes('id="sidepanelBottomActions"')
    && sidebarHtml.includes('id="btnOpenDashboard"')
    && sidebarHtml.includes('仪表盘')
    && sidebarHtml.includes('id="btnOpenTasks"')
    && sidebarHtml.includes('任务')
    && sidebarHtml.includes('id="btnOpenCalendar"')
    && sidebarHtml.includes('日历')
    && sidebarHtml.includes('id="btnSettings"')
    && sidebarHtml.includes('设置')
    && !sidebarHtml.includes('btnOpenPopup')
    && !sidebarHtml.includes('打开浮窗')
    && !sidebarHtml.includes('btnOpenFull')
    && sidebarScript.includes('function openExtensionPage')
    && sidebarScript.includes("openExtensionPage('pages/focus/focus.html')")
    && sidebarScript.includes("openExtensionPage('pages/tasks/tasks.html')")
    && sidebarScript.includes("openExtensionPage('pages/calendar/calendar.html')")
    && sidebarScript.includes('chrome.runtime.openOptionsPage()'));
assert('Side Panel renders Dashboard-style temporary task and journal entries before footer only in sidepanel',
    /id="currentTaskList"[\s\S]*id="sidepanelBottomActions"[\s\S]*<footer class="popup-footer sidepanel-footer"/.test(sidebarHtml)
    && !popupHtml.includes('sidepanelBottomActions')
    && sidebarScript.includes('function renderSidepanelBottomActions')
    && sidebarScript.includes('未计划的任务添加')
    && sidebarScript.includes('比如课后作业及其他临时任务')
    && sidebarScript.includes('临时添加任务')
    && sidebarScript.includes('今日总结')
    && sidebarScript.includes('整理今日总结')
    && sidebarScript.includes('查看今日总结'));
assert('Side Panel temporary task add runs in place with English homework defaults',
    sidebarScript.includes("const SIDEPANEL_QUICK_ADD_DEFAULT_PLAN_KEYWORD = 'English'")
    && sidebarScript.includes("const SIDEPANEL_QUICK_ADD_BUCKET_NAME = '作业'")
    && sidebarScript.includes("actionEl.dataset.action === 'quick-add-current-task'")
    && sidebarScript.includes('openSidepanelQuickAddTaskModal')
    && sidebarScript.includes('saveSidepanelQuickAddTask')
    && sidebarScript.includes('TimeWhereDB.ensureBucketTemplateForPlan(plan.id, getSidepanelQuickAddBucketTemplateForPlan(plan))')
    && /const payload|await TimeWhereDB\.addTask\(\{[\s\S]*plan_id:\s*planId[\s\S]*bucket_id:\s*bucketValue \? parseInt\(bucketValue, 10\) : null[\s\S]*start_date:\s*document\.getElementById\('sidepanelQuickAddStartDate'\)\?\.value \|\| todayStr[\s\S]*due_date:\s*document\.getElementById\('sidepanelQuickAddDueDate'\)\?\.value \|\| todayStr[\s\S]*duration:\s*parseInt\(document\.getElementById\('sidepanelQuickAddDuration'\)\?\.value \|\| '30', 10\) \|\| 30/.test(sidebarScript));
assert('Side Panel today journal opens and saves in place', sidebarScript.includes("actionEl.dataset.action === 'open-today-journal'")
    && sidebarScript.includes('openDailyJournalModal')
    && sidebarScript.includes('buildDailyJournalDraft')
    && sidebarScript.includes('data-action="save-daily-journal-draft"')
    && sidebarScript.includes('data-action="submit-daily-journal"')
    && sidebarScript.includes('TimeWhereDB.saveDailyJournalDraft')
    && sidebarScript.includes('TimeWhereDB.submitDailyJournal'));
assert('Popup and Sidebar current task cards use expandable partial complete panels',
    sidebarScript.includes('const partialCompleteBtn = `<button class="btn-micro" data-action="toggle-partial-complete-menu"')
    && sidebarScript.includes('data-action="toggle-partial-complete-menu"')
    && sidebarScript.includes('data-partial-complete-menu-for')
    && sidebarScript.includes('popup-partial-complete-panel')
    && sidebarScript.includes("actionEl.dataset.action === 'toggle-partial-complete-menu'")
    && sidebarScript.includes('toggleSidebarTaskPartialCompleteMenu(actionEl.dataset.taskId)')
    && sidebarScript.includes("actionEl.dataset.action === 'partial-complete-ratio'")
    && sidebarScript.includes('saveSidebarTaskPartialCompleteRatio')
    && sidebarScript.includes('data-action="toggle-partial-complete-checklist"')
    && sidebarScript.includes('saveSidebarTaskPartialCompleteChecklistItem')
    && sidebarScript.includes('const checklistActionEl = event.target.closest(\'[data-action="toggle-partial-complete-checklist"]\')')
    && sidebarScript.includes('checklistActionEl.checked'));
assert('Popup partial complete uses checklist metadata and updateChecklist',
    sidebarScript.includes('const PARTIAL_COMPLETION_RATIOS = [10, 20, 30, 50, 70, 80, 90]')
    && sidebarScript.includes("type: 'partial_completion'")
    && sidebarScript.includes('partial_group_id')
    && sidebarScript.includes("partial_role: 'done'")
    && sidebarScript.includes("partial_role: 'remaining'")
    && sidebarScript.includes('partial_percent: safePercent')
    && sidebarScript.includes('replacePartialCompletionChecklistGroup')
    && sidebarScript.includes('TimeWhereDB.updateChecklist(taskId, nextChecklist)')
    && !sidebarScript.includes("showToast('ManageBac 来源任务不能使用部分完成', 'error')"));
assert('Popup partial complete checklist saves only from change with current checked state',
    sidebarScript.includes("if (actionEl.dataset.action === 'toggle-partial-complete-checklist')")
    && !/actionEl\.dataset\.action === 'toggle-partial-complete-checklist'[\s\S]{0,240}saveSidebarTaskPartialCompleteChecklistItem/.test(sidebarScript)
    && !sidebarScript.includes('!actionEl.checked')
    && /const checklistActionEl = event\.target\.closest\('\[data-action="toggle-partial-complete-checklist"\]'\)[\s\S]*saveSidebarTaskPartialCompleteChecklistItem\([\s\S]*checklistActionEl\.checked/.test(sidebarScript));
assert('Sidebar CSS keeps fixed popup size and adds Side Panel adaptive layout',
    /body\s*\{[\s\S]*width:\s*360px;[\s\S]*height:\s*560px;/.test(sidebarCss)
    && sidebarCss.includes('body.sidepanel-body')
    && sidebarCss.includes('width: 100vw')
    && sidebarCss.includes('height: 100vh')
    && sidebarCss.includes('min-width: 320px')
    && sidebarCss.includes('.sidepanel-body .popup-container')
    && sidebarCss.includes('grid-template-columns: repeat(4, minmax(0, 1fr))')
    && sidebarCss.includes('.sidepanel-body .footer-btn')
    && sidebarCss.includes('flex-direction: row')
    && sidebarCss.includes('background: rgba(29, 140, 248, 0.08)')
    && sidebarCss.includes('.sidepanel-fixed-actions')
    && sidebarCss.includes('.sidepanel-body .current-task-quick-add')
    && sidebarCss.includes('.sidepanel-body .daily-journal-entry')
    && sidebarCss.includes('.sidepanel-daily-journal-modal')
    && /sidepanel-daily-journal-modal[\s\S]*height:\s*calc\(100vh - 24px\)/.test(sidebarCss)
    && /sidepanel-journal-body[\s\S]*flex:\s*1 1 auto[\s\S]*min-height:\s*0[\s\S]*overflow-y:\s*auto/.test(sidebarCss)
    && /sidepanel-daily-journal-modal \.popup-modal-footer[\s\S]*position:\s*sticky[\s\S]*bottom:\s*0/.test(sidebarCss)
    && sidebarCss.includes('.sidepanel-body .popup-task-detail-modal')
    && sidebarCss.includes('.popup-partial-complete-panel')
    && sidebarCss.includes('.partial-complete-ratio-grid'));
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
    && !sidebarScript.includes('btn-micro primary" data-action="start"')
    && !sidebarScript.includes('btn-micro primary" data-action="complete"')
    && focusCss.includes('.task-action-controls .btn-micro[data-busy="true"]')
    && focusCss.includes('.task-action-controls .btn-micro:active')
    && sidebarCss.includes('.task-action-controls .btn-micro[data-busy="true"]')
    && sidebarCss.includes('.task-action-controls .btn-micro:active')
    && focusScript.includes('dashboard-top-action')
    && sidebarScript.includes('btn-micro primary current-task-quick-add-action')
    && focusScript.includes('data-action="open-today-journal"')
    && sidebarScript.includes('btn-micro primary" data-action="open-today-journal"'));
assert('Dashboard current task cards expose partial complete for ManageBac tasks too',
    focusScript.includes('data-action="toggle-partial-complete-menu"')
    && focusScript.includes('data-partial-complete-menu-for')
    && focusScript.includes('partial-complete-panel')
    && focusScript.includes('部分完成')
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
    && !focusScript.includes("showToast('ManageBac 来源任务不能使用部分完成', 'error')"));
assert('Current task partial complete preserves expanded task while reloading',
    focusScript.includes('let dashboardCurrentTaskExpandedTaskId = null')
    && focusScript.includes('const requestedExpandedTaskId = targetTaskId || dashboardCurrentTaskExpandedTaskId')
    && focusScript.includes('dashboardCurrentTaskExpandedTaskId = String(taskId)')
    && focusScript.includes('reopenCurrentTaskPartialCompleteMenu(taskId)')
    && focusScript.includes('ensureDashboardCurrentTaskVisible(taskId)')
    && sidebarScript.includes('let sidebarCurrentTaskExpandedTaskId = null')
    && sidebarScript.includes('const anchoredIndex = sidebarCurrentTaskExpandedTaskId')
    && sidebarScript.includes('const expandedIndex = anchoredIndex >= 0 ? anchoredIndex : (inProgressIndex >= 0 ? inProgressIndex : 0)')
    && sidebarScript.includes('sidebarCurrentTaskExpandedTaskId = String(taskId)')
    && sidebarScript.includes('sidebarPartialCompleteReopenTaskId = String(taskId)'));
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
assert('Dashboard detail modal allows ManageBac local execution fields only',
    focusScript.includes('ManageBac 来源标题和截止日期只读；可修改本地状态、优先级、开始日期、定时时间、时长和笔记。')
    && /id="detailTaskTitle"[\s\S]{0,140}\$\{isManageBacSource \? 'readonly' : ''\}/.test(focusScript)
    && /id="detailTaskDueDate"[\s\S]{0,180}\$\{isManageBacSource \? 'disabled' : ''\}/.test(focusScript)
    && /id="detailTaskScheduleTime"[\s\S]{0,100}>/.test(focusScript)
    && /id="detailTaskDuration"[\s\S]{0,140}>/.test(focusScript)
    && /id="detailTaskNotes"[\s\S]{0,80}>/.test(focusScript)
    && /const updates = \{[\s\S]*schedule_time:[\s\S]*duration:[\s\S]*notes:[\s\S]*completed_at/.test(focusScript)
    && /if \(!isManageBacSource\) \{[\s\S]*updates\.title[\s\S]*updates\.due_date/.test(focusScript));
assert('Dashboard detail notes render safe external HTTP link preview',
    focusScript.includes('data-notes-link-preview')
    && focusScript.includes('renderTaskNotesExternalLinks(task.notes || task.description || \'\')')
    && focusScript.includes('refreshTaskNotesExternalLinks(modal, event.target.value)')
    && focusScript.includes("action === 'open-external-link'")
    && focusScript.includes('openTaskNotesExternalLink(actionEl)')
    && focusCss.includes('.external-link-item')
    && externalLinksScript.includes('extractHttpLinks'));
assert('Dashboard header no longer exposes debug snapshot action', !focusHtml.includes('data-action="copy-debug-snapshot"')
    && !focusHtml.includes('诊断快照')
    && !focusScript.includes('async function buildFocusDebugSnapshot')
    && !focusScript.includes("action === 'copy-debug-snapshot'")
    && !focusCss.includes('.debug-snapshot-btn'));
assert('Dashboard current task cards keep accordion styling instead of native details display',
    focusCss.includes('.accordion-task')
    && focusCss.includes('.accordion-task summary')
    && focusCss.includes('.accordion-task summary::-webkit-details-marker')
    && /\.accordion-task summary\s*\{[\s\S]*list-style:\s*none/.test(focusCss)
    && focusCss.includes('.task-chk')
    && focusCss.includes('.task-title')
    && focusCss.includes('.task-title-text')
    && focusCss.includes('.expand-icon')
    && focusCss.includes('.task-details')
    && focusCss.includes('.accordion-task.task-overdue')
    && focusCss.includes('.accordion-task.task-unassigned'));
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
    && focusCss.includes('.column-calendar .task-arrange-review-entry')
    && focusCss.includes('.column-calendar .icon-btn')
    && focusCss.includes('#cal-date-range')
    && focusCss.includes('height: 24px')
    && focusCss.includes('font-size: 11px'));
assert('Dashboard Task Arrange Review modal marks unread records viewed', focusScript.includes('openTaskArrangeReviewModal')
    && focusScript.includes('renderTaskArrangeReviewRows')
    && focusScript.includes('markUnreadTaskArrangeReviewsViewed')
    && focusScript.includes('record.viewed_at')
    && focusScript.includes('TimeWhereTaskArrangeAuto.saveTaskArrangeReviewLog')
    && focusScript.includes('data-action="close-task-arrange-review"'));
assert('Popup does not run automatic Arrange on open', !sidebarScript.includes('maybeRunTaskArrange')
    && !sidebarScript.includes('runTaskArrangeInBackground')
    && !sidebarScript.includes('runTaskArrangeInBackground'));
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
assert('Focus layout uses three-main-column viewport model with independent feed', /board-column\s*{[\s\S]*?flex:\s*0 0 calc\(\(100vw - 124px\) \* 2 \/ 4\.5\)/.test(focusCss)
    && /column-calendar\s*{[\s\S]*?flex:\s*0 0 calc\(\(100vw - 124px\) \* 1\.5 \/ 4\.5\)/.test(focusCss)
    && /column-week[\s\S]*?flex:\s*0 0 calc\(\(100vw - 124px\) \* 1 \/ 4\.5\)/.test(focusCss)
    && /column-feed[\s\S]*?flex:\s*0 0 280px/.test(focusCss));
assert('Focus feed remains an independent fixed-width scroll column', focusCss.includes('flex: 0 0 280px')
    && /board-layout[\s\S]*overflow-x:\s*auto/.test(focusCss)
    && focusCss.includes('flex-basis: 260px')
    && focusCss.includes('flex-basis: 240px'));
assert('Focus board still scrolls only when needed', /board-layout[\s\S]*overflow-x:\s*auto/.test(focusCss));
assert('Focus week and feed are not stacked inside one column', focusHtml.indexOf('column-week') > focusHtml.indexOf('column-calendar')
    && focusHtml.indexOf('column-feed') > focusHtml.indexOf('column-week')
    && (focusHtml.match(/<section class="board-column column-/g) || []).length === 4
    && !/<div class="side-panel column-feed"/.test(focusHtml));
assert('Focus calendar render path uses exact date task display instead of Daily Settle projection', /function renderDayColumn\([^)]*allTasks/.test(focusScript)
    && focusScript.includes('const projection = buildCalendarDayProjection({')
    && focusScript.includes('const allItems = projection.timedItems')
    && schedulingScript.includes('getCalendarTasksForDate(tasks, normalizedDateStr)')
    && schedulingScript.includes('assignCalendarTasksToContainers(dateTasks, dayContainers, dateObj)')
    && !focusScript.includes('const dayTaskPool = buildDailyTaskPool(allTasks, dayReferenceTime)')
    && !focusScript.includes('const settle = dailySettle(dayTaskPool, dayContainers, dayReferenceTime)'));
assert('Focus calendar container item carries exact date tasks into render', focusScript.includes('function getDateTasksForDisplay')
    && schedulingScript.includes("calendar_item_type: 'due'")
    && schedulingScript.includes("calendar_item_type: 'start'")
    && schedulingScript.includes('tasks: taskAssignments.get(container.id) || []')
    && focusScript.includes('renderContainerTasks(item.tasks)'));
assert('Focus calendar container card renders task list markup', focusScript.includes('function renderContainerTasks')
    && focusScript.includes('container-tasks')
    && focusScript.includes('container-task-item')
    && focusScript.includes('task-item-title')
    && focusScript.includes('task-item-type task-item-${type}')
    && focusScript.includes("type === 'due' ? '结束' : '开始'")
    && !focusScript.includes('task-priority-dot')
    && !focusScript.includes('task-item-dur'));
assert('Focus today tomorrow calendar renders display-only capacity assignment markers', focusScript.includes('calendar-assignment-${assignment}')
    && focusScript.includes('超出容量')
    && focusScript.includes('未安排')
    && focusCss.includes('.container-task-item.calendar-assignment-overflow')
    && focusCss.includes('.container-task-item.calendar-assignment-unassigned')
    && schedulingScript.includes('calendar_assignment')
    && schedulingScript.includes('unassignedTasks')
    && !schedulingScript.slice(schedulingScript.indexOf('function assignCalendarTasksToContainers'), schedulingScript.indexOf('function buildDailyTaskPool')).includes('updateTask('));
assert('Focus today tomorrow task display matches Calendar start marker style',
    focusCss.includes('.task-item-type')
    && focusCss.includes('.task-item-start')
    && focusCss.includes('color: #047857')
    && focusCss.includes('.container-task-item.start')
    && focusCss.includes('.container-task-item.due')
    && focusCss.includes('.task-item-due')
    && focusCss.includes('color: #b91c1c')
    && !focusCss.includes('.task-priority-dot'));
assert('Focus regular calendar events do not render container task list', schedulingScript.includes("isContainer: false")
    && focusScript.includes("item.isContainer ? renderContainerTasks(item.tasks) : ''"));
assert('Focus calendar uses Calendar-like layer-aware event card rendering', focusScript.includes('function createFocusCalendarCard')
    && focusScript.includes("div.className = 'gcal-event layer-1'")
    && focusScript.includes("div.className = 'gcal-event layer-2'")
    && focusScript.includes("div.style.backgroundColor = color + '40'")
    && focusScript.includes("div.style.border = `2px dashed ${darkenColor(color, 0.15)}`")
    && focusScript.includes("div.style.border = `2px dashed ${color}`")
    && focusScript.includes("div.style.borderLeft = '3px solid rgba(255,255,255,0.4)'"));
assert('Focus calendar cards carry type/source/layer metadata like Calendar', schedulingScript.includes("type: 'container'")
    && schedulingScript.includes("source: 'container'")
    && schedulingScript.includes('layer: getContainerLayer(container)')
    && schedulingScript.includes("type: 'event'")
    && schedulingScript.includes("source: event.source || 'manual'")
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
assert('Popup header pending count uses today Daily Settle task pool', sidebarScript.includes('buildDailyTaskPool(allTasks, now)')
    && sidebarScript.includes('const todayPendingCount = taskPool.length')
    && !sidebarScript.includes('getPendingCount('));
assert('Popup no-task copy uses 暂无待办任务 only', popupHtml.includes('暂无待办任务')
    && sidebarScript.includes('暂无待办任务')
    && !/暂无进行中的任务/.test(popupHtml + sidebarScript));
assert('Popup renders Daily Settle displayTasks list', sidebarScript.includes('settle.displayTasks || settle.currentTasks || []')
    && sidebarScript.includes('renderCurrentTaskList(displayTasks)')
    && sidebarScript.includes('tasks.map((task, index) => renderCurrentTaskCard(task, index, expandedIndex))'));
assert('Dashboard current task column renders Daily Settle displayTasks list',
    focusScript.includes('const displayTasks = settle.displayTasks || settle.currentTasks || []')
    && focusScript.includes('displayTasks.forEach((task, index)')
    && focusScript.includes("assignment.status !== 'unassigned'"));
assert('Dashboard current task list does not default-expand tasks without an explicit requested task',
    focusScript.includes('const requestedExpandedIndex = hasExpandedTask')
    && !focusScript.includes('const inProgressIndex = displayTasks.findIndex')
    && focusScript.includes('const expandedIndex = requestedExpandedIndex >= 0 ? requestedExpandedIndex : -1')
    && focusScript.includes('expanded: index === expandedIndex')
    && !focusScript.includes('(isFirst || isInProgress)'));
assert('Dashboard current task column marks unassigned tasks without hiding actions',
    focusScript.includes('tag-unassigned')
    && focusScript.includes('当前未分配')
    && focusScript.includes('task-unassigned')
    && focusScript.includes('data-action="start"')
    && focusScript.includes('data-action="complete"')
    && focusScript.includes('data-action="defer"'));
assert('Popup current task list marks unassigned tasks from Daily Settle display model',
    sidebarScript.includes("assignment.status === 'unassigned'")
    && sidebarScript.includes('task-tag unassigned')
    && sidebarScript.includes('popup-task-card${assignment.status')
    && sidebarScript.includes('当前未分配'));
assert('Popup does not fallback to one current task or sorted pool', !sidebarScript.includes('currentTasks[0] || sortedPool[0]')
    && !sidebarScript.includes('sortedPool[0]'));
assert('Popup current task list expands only one task, preferring current anchor then in-progress task', sidebarScript.includes('const anchoredIndex = sidebarCurrentTaskExpandedTaskId')
    && sidebarScript.includes('const inProgressIndex = tasks.findIndex')
    && sidebarScript.includes('const expandedIndex = anchoredIndex >= 0 ? anchoredIndex : (inProgressIndex >= 0 ? inProgressIndex : 0)')
    && sidebarScript.includes('const isExpanded = index === expandedIndex')
    && sidebarScript.includes('class="task-card popup-task-card${assignment.status'));
assert('Popup expanding one task collapses other tasks and auto-scrolls it into view', sidebarScript.includes("taskList.addEventListener('toggle', handleTaskCardToggle, true)")
    && sidebarScript.includes("querySelectorAll('.popup-task-card[open]')")
    && sidebarScript.includes('if (other !== card) other.open = false')
    && sidebarScript.includes('ensureExpandedTaskVisible')
    && sidebarScript.includes("scrollIntoView({ block: 'nearest'"));
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
assert('Dashboard current task header renders compact actions between title and status', focusScript.includes('const quickAddHTML = renderCurrentTaskQuickAdd(todayStr)')
    && focusScript.includes('const topActionsHTML = renderDashboardTopActions(quickAddHTML, journalEntryHTML)')
    && focusScript.includes("querySelector('.column-now .current-task-header-actions')")
    && focusScript.includes('headerActions.innerHTML = topActionsHTML')
    && focusHtml.includes('current-task-header-actions')
    && focusHtml.includes('current-task-header-status')
    && focusHtml.indexOf('<h2>当前任务</h2>') < focusHtml.indexOf('current-task-header-actions')
    && focusHtml.indexOf('current-task-header-actions') < focusHtml.indexOf('current-task-header-status')
    && focusScript.includes('dashboard-top-actions')
    && focusScript.includes('current-task-quick-add dashboard-top-action')
    && focusScript.includes('daily-journal-entry dashboard-top-action')
    && focusScript.includes('dashboard-top-action-title">临时添加')
    && focusScript.includes('dashboard-top-action-title">今日总结')
    && focusScript.includes('daily-journal-status-${escapeAttribute(status)}')
    && focusScript.includes('title="今日总结：${escapeAttribute(statusLabel)}"')
    && !focusScript.includes('未计划的任务添加')
    && !focusScript.includes('比如课后作业及其他临时任务')
    && !focusScript.includes('current-task-quick-add-action')
    && !focusScript.includes('current-task-quick-add-meta')
    && !focusScript.includes('current-task-quick-add-icon')
    && !focusScript.includes('daily-journal-icon')
    && !/section.innerHTML = `[sS]*${topActionsHTML}[sS]*current-task-scroll-body/.test(focusScript));
assert('Dashboard exposes lightweight work reminder status in feed column with stop action',
    focusScript.includes('renderDesktopWorkReminderBanner')
    && focusScript.includes('desktop-work-reminder-banner')
    && focusScript.includes("action === 'stop-desktop-work-reminder'")
    && focusScript.includes('getWorkReminderState')
    && focusScript.includes('stopCurrentWorkReminder')
    && focusScript.includes('timewhere-desktop-reminder-state')
    && focusScript.includes('const reminderBannerHTML = await renderDesktopWorkReminderBanner()')
    && /html = `\$\{reminderBannerHTML\}\$\{html\}`;/.test(focusScript)
    && !/async function loadTaskColumn\(\)[\s\S]*const reminderBannerHTML = await renderDesktopWorkReminderBanner\(\)[\s\S]*async function renderDesktopWorkReminderBanner/.test(focusScript)
    && focusScript.includes("loadFeedColumn().catch(error => console.warn('[Focus] reminder status refresh failed:', error))")
    && focusCss.includes('.desktop-work-reminder-banner')
    && focusCss.includes('.desktop-work-reminder-banner.execution_check_waiting')
    && focusCss.includes('.desktop-work-reminder-banner.renotify_waiting')
    && focusCss.includes('.column-feed .desktop-work-reminder-banner'));
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
assert('Dashboard quick add CSS defines compact header action controls', focusCss.includes('.dashboard-top-actions')
    && focusCss.includes('.dashboard-top-action')
    && focusCss.includes('.dashboard-top-action-title')
    && focusCss.includes('.current-task-header-actions')
    && focusCss.includes('.current-task-header-status')
    && focusCss.includes('.daily-journal-status-submitted')
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
    && focusCss.includes('grid-template-columns: repeat(2, minmax(0, 1fr))')
    && focusCss.includes('width: 100%')
    && focusCss.includes('height: 24px'));
assert('Dashboard current task body scrolls separately from header actions', focusScript.includes('current-task-scroll-body custom-scrollbar')
    && focusScript.includes('headerActions.innerHTML = topActionsHTML')
    && !/section.innerHTML = `[sS]*${topActionsHTML}[sS]*current-task-scroll-body/.test(focusScript));
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
    && sidebarScript.includes('计划外任务说明')
    && sidebarScript.includes('没有计划外任务。')
    && !focusScript.includes('计划外完成说明')
    && !sidebarScript.includes('计划外完成说明')
    && focusCss.includes('grid-template-columns: repeat(2, minmax(0, 1fr))')
    && /journal-section[\s\S]*height:\s*100%/.test(focusCss)
    && /journal-note-card[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column[\s\S]*min-height:\s*120px[\s\S]*height:\s*100%/.test(focusCss)
    && /journal-note-title[\s\S]*flex-shrink:\s*0/.test(focusCss)
    && /journal-note-card textarea[\s\S]*flex:\s*1/.test(focusCss)
    && /journal-summary-field[\s\S]*grid-column:\s*1 \/ -1/.test(focusCss)
    && /@media \(max-width:\s*720px\)[\s\S]*journal-review-layout[\s\S]*grid-template-columns:\s*1fr/.test(focusCss));
assert('Dashboard today journal task statuses use bordered completed partial and incomplete markers',
    focusScript.includes('renderJournalStatusTaskList')
    && sidebarScript.includes('renderJournalStatusTaskList')
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
    && sidebarCss.includes('.journal-task-status.partial')
    && sidebarCss.includes('border: 1px solid var(--border)'));
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
    && /dashboard-top-actions[\s\S]*flex-shrink:\s*0/.test(focusCss)
    && /weekly-journal-section[\s\S]*flex-shrink:\s*0/.test(focusCss));
assert('Popup expanded task cards do not clip core task content', sidebarCss.includes('.task-list')
    && /task-list[\s\S]*overflow-y:\s*auto/.test(sidebarCss)
    && /task-list[\s\S]*scroll-behavior:\s*smooth/.test(sidebarCss)
    && /popup-task-card[\s\S]*overflow:\s*visible/.test(sidebarCss)
    && /task-card-summary \.task-title[\s\S]*white-space:\s*normal/.test(sidebarCss)
    && /task-notes[\s\S]*max-height:\s*none/.test(sidebarCss)
    && /task-notes[\s\S]*overflow:\s*visible/.test(sidebarCss));
assert('Popup current task render includes Dashboard-like card semantics', sidebarScript.includes('task-title-row')
    && sidebarScript.includes('task-notes')
    && sidebarScript.includes('priority-badge')
    && sidebarScript.includes('duration')
    && sidebarScript.includes('deadline')
    && sidebarScript.includes('task-tags')
    && sidebarScript.includes('task-actions')
    && sidebarScript.includes('task-action-controls'));
assert('Popup current task card renders status labels for all progress states',
    sidebarScript.includes('function getSidebarTaskStatusLabel')
    && sidebarScript.includes("text: '未开始', className: 'not-started'")
    && sidebarScript.includes("text: '进行中', className: 'in-progress'")
    && sidebarScript.includes("text: '已完成', className: 'completed'")
    && sidebarScript.includes('popup-task-status-label'));
assert('Popup current task card renders existing checklist only',
    sidebarScript.includes('function renderSidebarTaskChecklist')
    && sidebarScript.includes('if (checklist.length === 0) return')
    && sidebarScript.includes('popup-task-checklist-item')
    && sidebarScript.includes('data-action="toggle-popup-checklist"'));
assert('Popup checklist toggle uses delegated action and updateChecklist',
    sidebarScript.includes("action === 'toggle-popup-checklist'")
    && sidebarScript.includes('toggleSidebarTaskChecklist')
    && sidebarScript.includes('TimeWhereDB.updateChecklist(taskId, checklist)'));
assert('Popup normal task actions and expandable defer menu are inside card', sidebarScript.includes('data-action="start"')
    && sidebarScript.includes('data-action="pause"')
    && sidebarScript.includes('data-action="complete"')
    && sidebarScript.includes('data-action="toggle-partial-complete-menu"')
    && sidebarScript.includes('data-action="toggle-defer-menu"')
    && sidebarScript.includes('aria-expanded="false"')
    && sidebarScript.includes('popup-defer-panel')
    && sidebarScript.includes('延后会向后修改任务截止日期')
    && sidebarScript.includes('defer-options')
    && sidebarScript.includes('toggleSidebarTaskDeferMenu')
    && sidebarScript.includes('data-action="defer"')
    && sidebarScript.includes('data-days="1"')
    && sidebarScript.includes('data-days="3"')
    && sidebarScript.includes('data-days="7"'));
assert('Popup current task card opens local detail modal from content area',
    sidebarScript.includes('task-detail-open-zone')
    && sidebarScript.includes('data-action="open-current-task-detail"')
    && /<div class="task-title-row" data-task-id="\$\{taskId\}">/.test(sidebarScript)
    && !/<div class="task-title-row"[^>]*data-action="open-current-task-detail"/.test(sidebarScript)
    && sidebarScript.includes("const detailZone = actionEl.closest('.task-detail-open-zone')")
    && sidebarScript.includes("const taskDetails = actionEl.closest('details')")
    && sidebarScript.includes('if (!detailZone || !taskDetails?.open) return')
    && sidebarScript.includes('openCurrentTaskDetailModal')
    && sidebarScript.includes('saveCurrentTaskDetailModal')
    && sidebarScript.includes('currentTaskDetailModal')
    && sidebarCss.includes('.popup-task-detail-modal')
    && !sidebarScript.includes('btn-task-detail')
    && !sidebarScript.includes('openTaskDetailInPlanner')
    && !sidebarScript.includes('pages/tasks/tasks.html?task_id='));
assert('Popup detail modal allows ManageBac local execution fields only',
    sidebarScript.includes('ManageBac 来源标题和截止日期只读；可修改本地状态、优先级、开始日期、定时时间、时长和笔记。')
    && /id="detailTaskTitle"[\s\S]{0,140}\$\{isManageBacSource \? 'readonly' : ''\}/.test(sidebarScript)
    && /id="detailTaskDueDate"[\s\S]{0,180}\$\{isManageBacSource \? 'disabled' : ''\}/.test(sidebarScript)
    && /id="detailTaskScheduleTime"[\s\S]{0,100}>/.test(sidebarScript)
    && /id="detailTaskDuration"[\s\S]{0,140}>/.test(sidebarScript)
    && /id="detailTaskNotes"[\s\S]{0,80}>/.test(sidebarScript)
    && /const updates = \{[\s\S]*schedule_time:[\s\S]*duration:[\s\S]*notes:[\s\S]*completed_at/.test(sidebarScript)
    && /if \(!isManageBacSource\) \{[\s\S]*updates\.title[\s\S]*updates\.due_date/.test(sidebarScript));
assert('Popup and Side Panel detail notes render safe external HTTP link preview',
    sidebarScript.includes('data-notes-link-preview')
    && sidebarScript.includes('renderTaskNotesExternalLinks(task.notes || task.description || \'\')')
    && sidebarScript.includes('refreshTaskNotesExternalLinks(modal, event.target.value)')
    && sidebarScript.includes("actionEl.dataset.action === 'open-external-link'")
    && sidebarScript.includes('openTaskNotesExternalLink(actionEl)')
    && sidebarCss.includes('.external-link-item')
    && externalLinksScript.includes('data-action="open-external-link"'));
assert('Popup defer updates due_date instead of start_date', /async function deferTask[\s\S]*baseDate = task\?\.due_date \|\| task\?\.deadline \|\| formatDateISO\(today\)/.test(sidebarScript)
    && /async function deferTask[\s\S]*updateTask\(taskId, \{ due_date: formatDateISO\(target\) \}\)/.test(sidebarScript)
    && !/async function deferTask[\s\S]*updateTask\(taskId, \{ start_date: nextStartDate \}\)/.test(sidebarScript));
assert('Popup ManageBac branch renders blocked defer text and no defer buttons', sidebarScript.includes('isManageBacSourceTask')
    && sidebarScript.includes('defer-blocked-text')
    && /const deferBlockedHtml = isManageBacSource[\s\S]*defer-blocked-text/.test(sidebarScript)
    && /const deferToggleHtml = !isManageBacSource[\s\S]*data-action="toggle-defer-menu"/.test(sidebarScript)
    && /const deferMenuHtml = !isManageBacSource[\s\S]*data-action="defer"/.test(sidebarScript));
assert('Popup CSS defines status checklist and compact action controls',
    sidebarCss.includes('.popup-task-status-label.not-started')
    && sidebarCss.includes('.popup-task-status-label.in-progress')
    && sidebarCss.includes('.popup-task-status-label.completed')
    && sidebarCss.includes('.popup-task-checklist')
    && sidebarCss.includes('.task-action-controls')
    && sidebarCss.includes('.task-action-stack')
    && sidebarCss.includes('.popup-defer-panel')
    && sidebarCss.includes('.popup-partial-complete-panel')
    && sidebarCss.includes('.defer-hint')
    && sidebarCss.includes('.defer-options')
    && /\.popup-defer-panel\s*\{[\s\S]*border: 1px solid/.test(sidebarCss)
    && /\.popup-defer-panel\[hidden\]\s*\{[\s\S]*display:\s*none/.test(sidebarCss)
    && sidebarCss.includes('min-height: 32px'));
assert('Popup action success reloads task and header counts', sidebarScript.includes('await reloadSidebar()'));
assert('Popup action failure shows toast', sidebarScript.includes('showToast(`操作失败：${error.message}`'));
assert('Popup CSS no longer contains quick action or stat card styles', !/quick-actions|stats-section|stat-card|action-btn/.test(sidebarCss));

console.log('\n' + '='.repeat(44));
console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
if (failed > 0) process.exit(1);
