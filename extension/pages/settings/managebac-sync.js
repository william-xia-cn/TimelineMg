/**
 * Management review confirmation page.
 * Combines Task Date Arrange review and ManageBac new-event confirmation.
 */
const MANAGEMENT_REVIEW_PENDING_KEY = 'management_review_pending';
const MANAGEMENT_REVIEW_LAST_CHECKED_KEY = 'management_review_last_checked_at';
const LEGACY_MANAGEBAC_PENDING_EVENTS_SESSION_KEY = 'timewhere_managebac_pending_event_mappings';

let managebacPlans = [];
let managebacReady = false;
let reviewInProgress = false;
let reviewCompleted = false;
let managementPending = null;
let currentArrangeRows = [];
let currentPendingEventRows = [];

document.addEventListener('DOMContentLoaded', async () => {
    setupManagementReviewEvents();
    try {
        await TimeWhereDB.initDefaultSettings();
        await loadManageBacSyncPrecondition();
        await restoreManagementReviewPending();
    } catch (error) {
        setManageBacSyncStatus(`页面初始化失败：${error.message}`, 'error');
    }
});

function setupManagementReviewEvents() {
    document.getElementById('backBtn')?.addEventListener('click', (event) => {
        if (isReviewBlocking()) {
            event.preventDefault();
            setManageBacSyncStatus('请先确认导入或全部跳过，完成本轮管理检查。', 'error');
            return;
        }
        window.location.href = 'settings.html';
    });
    document.getElementById('savePendingEventMappingsBtn')?.addEventListener('click', handleConfirmManagementReview);
    document.getElementById('skipManagementReviewBtn')?.addEventListener('click', handleSkipManagementReview);

    window.addEventListener('beforeunload', (event) => {
        if (!isReviewBlocking()) return;
        event.preventDefault();
        event.returnValue = '';
    });

    document.addEventListener('click', (event) => {
        if (!isReviewBlocking()) return;
        const link = event.target.closest('a.nav-item');
        if (!link) return;
        event.preventDefault();
        setManageBacSyncStatus('请先确认导入或全部跳过，完成本轮管理检查。', 'error');
    }, true);
}

async function loadManageBacSyncPrecondition() {
    const precondition = await TimeWhereManageBac.getMappingPrecondition(TimeWhereDB);
    managebacPlans = precondition.plans || [];
    const mappings = await TimeWhereDB.getSetting(TimeWhereManageBac.SETTINGS_MAPPING_KEY);
    const activeMappingCount = (mappings || []).filter(row => row?.plan_id).length;
    managebacReady = precondition.ok && activeMappingCount > 0;
}

function hasReviewWork(pending) {
    return !!pending
        && (
            (Array.isArray(pending.arrange_changes) && pending.arrange_changes.length > 0) ||
            (Array.isArray(pending.managebac_pending_event_mappings) && pending.managebac_pending_event_mappings.length > 0) ||
            !!pending.managebac_error
        );
}

function isReviewBlocking() {
    return !reviewCompleted && hasReviewWork(managementPending);
}

function setReviewInProgress(inProgress, message = '') {
    reviewInProgress = inProgress;
    updateManagementReviewControls();
    if (message) setManageBacSyncStatus(message, 'info');
}

function updateManagementReviewControls() {
    const hasWork = currentArrangeRows.length > 0 || currentPendingEventRows.length > 0 || !!managementPending?.managebac_error;
    const canApply = !reviewInProgress && hasWork;
    document.getElementById('savePendingEventMappingsBtn')?.toggleAttribute('disabled', !canApply);
    document.getElementById('skipManagementReviewBtn')?.toggleAttribute('disabled', !canApply);
    document.getElementById('backBtn')?.toggleAttribute('disabled', isReviewBlocking());
}

function setManageBacSyncStatus(message, type = 'info') {
    const status = document.getElementById('managebacSyncStatus');
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
}

function renderArrangeChanges(rows) {
    const target = document.getElementById('pendingArrangeChanges');
    if (!target) return;
    if (!rows.length) {
        target.className = 'managebac-empty';
        target.textContent = '没有需要确认的任务日期 / 优先级调整';
        updateManagementReviewControls();
        return;
    }

    target.className = 'managebac-table-wrap';
    target.innerHTML = `
        <table class="managebac-table">
            <thead>
                <tr>
                    <th class="managebac-check-cell">应用</th>
                    <th>Task</th>
                    <th>当前日期</th>
                    <th>建议日期</th>
                    <th>当前优先级</th>
                    <th>建议优先级</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((row, index) => {
                    const task = row.task || {};
                    const updates = row.updates || {};
                    return `
                        <tr>
                            <td class="managebac-check-cell">
                                <input type="checkbox" class="arrange-change-checkbox" data-index="${index}" checked>
                            </td>
                            <td>
                                <strong>${TimeWhereManageBac.escapeHTML(task.title || task.name || row.task_id || 'Untitled task')}</strong>
                                ${task.source === 'managebac' ? '<div class="managebac-change-note">ManageBac 来源任务</div>' : ''}
                            </td>
                            <td>${TimeWhereManageBac.escapeHTML(task.start_date || '未设置')}</td>
                            <td>${TimeWhereManageBac.escapeHTML(updates.start_date || row.start_date || task.start_date || '不变')}</td>
                            <td>${TimeWhereManageBac.escapeHTML(task.priority || 'medium')}</td>
                            <td>${TimeWhereManageBac.escapeHTML(updates.priority || row.priority || task.priority || '不变')}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    updateManagementReviewControls();
}

function renderPendingEventMappings(rows) {
    const target = document.getElementById('pendingEventMappings');
    if (!target) return;
    if (!rows.length) {
        target.className = 'managebac-empty';
        target.textContent = managementPending?.managebac_error
            ? `ManageBac 同步失败：${managementPending.managebac_error}`
            : '没有需要确认的新 ManageBac 事件';
        updateManagementReviewControls();
        return;
    }

    target.className = 'managebac-table-wrap';
    target.innerHTML = `
        <table class="managebac-table">
            <thead>
                <tr>
                    <th class="managebac-check-cell">应用</th>
                    <th>Due</th>
                    <th>Summary</th>
                    <th>Description</th>
                    <th>系统建议</th>
                    <th>确认学科 / Plan</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((row, index) => `
                    <tr>
                        <td class="managebac-check-cell">
                            <input type="checkbox" class="managebac-event-checkbox" data-index="${index}" checked>
                        </td>
                        <td>${TimeWhereManageBac.escapeHTML(row.due_date)}</td>
                        <td>${TimeWhereManageBac.escapeHTML(row.summary)}</td>
                        <td>${TimeWhereManageBac.escapeHTML(row.description)}</td>
                        <td>${TimeWhereManageBac.escapeHTML(row.suggested_subject || '无建议')}</td>
                        <td>
                            <select class="managebac-event-plan-select" data-index="${index}">
                                <option value="">暂不创建任务</option>
                                ${managebacPlans.map(plan => `
                                    <option value="${TimeWhereManageBac.escapeAttribute(plan.id)}" ${String(row.suggested_plan_id) === String(plan.id) ? 'selected' : ''}>
                                        ${TimeWhereManageBac.escapeHTML(plan.subject || plan.name)}
                                    </option>
                                `).join('')}
                            </select>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    updateManagementReviewControls();
}

async function restoreManagementReviewPending() {
    managementPending = await TimeWhereDB.getSetting(MANAGEMENT_REVIEW_PENDING_KEY);

    if (!managementPending) {
        const persistedRows = await TimeWhereManageBac.getPendingEventMappings(TimeWhereDB);
        const legacyPayload = readLegacySessionPayload();
        const legacyRows = persistedRows.length
            ? persistedRows
            : (legacyPayload?.pending_event_mappings || []);
        if (legacyRows.length) {
            managementPending = {
                source: 'managebac_manual',
                created_at: new Date().toISOString(),
                arrange_changes: [],
                arrange_summary: null,
                managebac_pending_event_mappings: await TimeWhereManageBac.savePendingEventMappings(TimeWhereDB, legacyRows),
                managebac_summary: legacyPayload || null,
                managebac_error: null
            };
            await TimeWhereDB.setSetting(MANAGEMENT_REVIEW_PENDING_KEY, managementPending);
        }
    }

    currentArrangeRows = Array.isArray(managementPending?.arrange_changes)
        ? managementPending.arrange_changes
        : [];
    currentPendingEventRows = Array.isArray(managementPending?.managebac_pending_event_mappings)
        ? managementPending.managebac_pending_event_mappings
        : [];

    renderArrangeChanges(currentArrangeRows);
    renderPendingEventMappings(currentPendingEventRows);

    if (!hasReviewWork(managementPending)) {
        reviewCompleted = true;
        await clearManagementReviewPending({ updateLastChecked: false });
        setManageBacSyncStatus('没有需要确认的任务调整或 ManageBac 新事件。', 'success');
        return;
    }

    const arrangeCount = currentArrangeRows.length;
    const eventCount = currentPendingEventRows.length;
    const errorText = managementPending?.managebac_error ? '；ManageBac 同步失败，请处理或跳过本轮' : '';
    setManageBacSyncStatus(`待确认：${arrangeCount} 个 Arrange task，${eventCount} 个 ManageBac 新事件${errorText}`, managementPending?.managebac_error ? 'error' : 'info');
    updateManagementReviewControls();
}

function readLegacySessionPayload() {
    const raw = sessionStorage.getItem(LEGACY_MANAGEBAC_PENDING_EVENTS_SESSION_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(LEGACY_MANAGEBAC_PENDING_EVENTS_SESSION_KEY);
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function getSelectedArrangeChanges() {
    return currentArrangeRows.filter((row, index) => {
        const checkbox = document.querySelector(`.arrange-change-checkbox[data-index="${index}"]`);
        return checkbox?.checked === true;
    });
}

function getSelectedManageBacRows() {
    return currentPendingEventRows.map((row, index) => {
        const checkbox = document.querySelector(`.managebac-event-checkbox[data-index="${index}"]`);
        const select = document.querySelector(`.managebac-event-plan-select[data-index="${index}"]`);
        if (checkbox?.checked !== true) return null;
        const planId = select?.value || '';
        if (!planId) return null;
        const plan = managebacPlans.find(item => String(item.id) === String(planId));
        if (!plan) return null;
        return {
            event_uid: row.event_uid,
            plan_id: planId,
            subject: plan.subject || plan.name,
            subject_in_managebac: row.suggested_subject_in_managebac || ''
        };
    }).filter(Boolean);
}

async function applyArrangeChanges(rows) {
    let applied = 0;
    for (const row of rows) {
        if (!row?.task_id || !row.updates || Object.keys(row.updates).length === 0) continue;
        await TimeWhereDB.updateTask(row.task_id, row.updates);
        applied++;
    }
    return applied;
}

async function applyManageBacSelections(rows) {
    if (!rows.length) return { created: 0, updated: 0 };
    await TimeWhereManageBac.saveEventSubjectOverrides(TimeWhereDB, rows, managebacPlans);
    const config = await TimeWhereManageBac.getManageBacIcsConfig(TimeWhereDB);
    if (!config?.link) {
        throw new Error('请先保存 ManageBac ICS link。');
    }
    const icsText = await TimeWhereManageBac.fetchIcsText(config.link);
    return await TimeWhereManageBac.syncManageBacIcs(TimeWhereDB, icsText, config.link, {
        confirmLinkChange: true,
        applyPendingEventOverrides: true
    });
}

async function clearManagementReviewPending({ updateLastChecked }) {
    await TimeWhereDB.setSetting(MANAGEMENT_REVIEW_PENDING_KEY, null);
    await TimeWhereManageBac.clearPendingEventMappings(TimeWhereDB);
    currentArrangeRows = [];
    currentPendingEventRows = [];
    managementPending = null;
    renderArrangeChanges([]);
    renderPendingEventMappings([]);
    if (updateLastChecked) {
        await TimeWhereDB.setSetting(MANAGEMENT_REVIEW_LAST_CHECKED_KEY, new Date().toISOString());
    }
}

async function handleConfirmManagementReview() {
    if (reviewInProgress || !hasReviewWork(managementPending)) return;
    const selectedArrange = getSelectedArrangeChanges();
    const selectedManageBac = getSelectedManageBacRows();

    setReviewInProgress(true, `正在导入：${selectedArrange.length} 个任务调整，${selectedManageBac.length} 个 ManageBac 任务…`);
    try {
        const arranged = await applyArrangeChanges(selectedArrange);
        const managebacResult = await applyManageBacSelections(selectedManageBac);
        reviewCompleted = true;
        await clearManagementReviewPending({ updateLastChecked: true });
        setManageBacSyncStatus(`完成：已应用 ${arranged} 个任务调整；新增 ${managebacResult.created || 0} 个 ManageBac 任务。`, 'success');
    } catch (error) {
        setManageBacSyncStatus(`导入失败：${error.message}`, 'error');
    } finally {
        setReviewInProgress(false);
    }
}

async function handleSkipManagementReview() {
    if (reviewInProgress || !hasReviewWork(managementPending)) return;
    setReviewInProgress(true, '正在跳过本轮待确认项…');
    try {
        reviewCompleted = true;
        await clearManagementReviewPending({ updateLastChecked: true });
        setManageBacSyncStatus('已跳过本轮任务调整和 ManageBac 新事件。', 'success');
    } catch (error) {
        setManageBacSyncStatus(`跳过失败：${error.message}`, 'error');
    } finally {
        setReviewInProgress(false);
    }
}
