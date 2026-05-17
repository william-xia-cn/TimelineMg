/**
 * ManageBac new-task confirmation page.
 * Task Arrange uses task-arrange.js and is intentionally separate.
 */
const LEGACY_MANAGEBAC_PENDING_EVENTS_SESSION_KEY = 'timewhere_managebac_pending_event_mappings';

let managebacPlans = [];
let managebacReady = false;
let reviewInProgress = false;
let reviewCompleted = false;
let currentPendingEventRows = [];

document.addEventListener('DOMContentLoaded', async () => {
    setupManageBacReviewEvents();
    try {
        await TimeWhereDB.initDefaultSettings();
        await loadManageBacSyncPrecondition();
        await restoreManageBacPendingRows();
    } catch (error) {
        setManageBacSyncStatus(`页面初始化失败：${error.message}`, 'error');
    }
});

function setupManageBacReviewEvents() {
    document.getElementById('backBtn')?.addEventListener('click', (event) => {
        if (isReviewBlocking()) {
            event.preventDefault();
            setManageBacSyncStatus('请先确认导入或全部跳过，完成本轮 ManageBac 新任务确认。', 'error');
            return;
        }
        window.location.href = 'settings.html';
    });
    document.getElementById('savePendingEventMappingsBtn')?.addEventListener('click', handleConfirmManageBacReview);
    document.getElementById('skipManagementReviewBtn')?.addEventListener('click', handleSkipManageBacReview);

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
        setManageBacSyncStatus('请先确认导入或全部跳过，完成本轮 ManageBac 新任务确认。', 'error');
    }, true);
}

async function loadManageBacSyncPrecondition() {
    const precondition = await TimeWhereManageBac.getMappingPrecondition(TimeWhereDB);
    managebacPlans = precondition.plans || [];
    managebacReady = precondition.ok;
}

function hasReviewWork() {
    return currentPendingEventRows.length > 0;
}

function isReviewBlocking() {
    return !reviewCompleted && hasReviewWork();
}

function setReviewInProgress(inProgress, message = '') {
    reviewInProgress = inProgress;
    updateManagementReviewControls();
    if (message) setManageBacSyncStatus(message, 'info');
}

function updateManagementReviewControls() {
    const canApply = !reviewInProgress && currentPendingEventRows.length > 0;
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

function renderPendingEventMappings(rows) {
    const target = document.getElementById('pendingEventMappings');
    if (!target) return;
    if (!rows.length) {
        target.className = 'managebac-empty';
        target.textContent = '没有需要确认的新 ManageBac 事件';
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

async function restoreManageBacPendingRows() {
    const persistedRows = await TimeWhereManageBac.getPendingEventMappings(TimeWhereDB);
    const legacyPayload = readLegacySessionPayload();
    const legacyRows = persistedRows.length
        ? persistedRows
        : (legacyPayload?.pending_event_mappings || []);
    currentPendingEventRows = legacyRows.length
        ? await TimeWhereManageBac.savePendingEventMappings(TimeWhereDB, legacyRows)
        : [];

    renderPendingEventMappings(currentPendingEventRows);

    if (!hasReviewWork()) {
        reviewCompleted = true;
        setManageBacSyncStatus('没有需要确认的新 ManageBac 事件。', 'success');
        return;
    }

    setManageBacSyncStatus(`待确认：${currentPendingEventRows.length} 个 ManageBac 新事件`, 'info');
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

async function clearManageBacPendingRows() {
    await TimeWhereManageBac.clearPendingEventMappings(TimeWhereDB);
    currentPendingEventRows = [];
    renderPendingEventMappings([]);
}

async function handleConfirmManageBacReview() {
    if (reviewInProgress || !hasReviewWork()) return;
    const selectedManageBac = getSelectedManageBacRows();

    setReviewInProgress(true, `正在导入：${selectedManageBac.length} 个 ManageBac 任务…`);
    try {
        const managebacResult = await applyManageBacSelections(selectedManageBac);
        reviewCompleted = true;
        await clearManageBacPendingRows();
        setManageBacSyncStatus(`完成：新增 ${managebacResult.created || 0} 个 ManageBac 任务。`, 'success');
    } catch (error) {
        setManageBacSyncStatus(`导入失败：${error.message}`, 'error');
    } finally {
        setReviewInProgress(false);
    }
}

async function handleSkipManageBacReview() {
    if (reviewInProgress || !hasReviewWork()) return;
    setReviewInProgress(true, '正在跳过本轮 ManageBac 新事件…');
    try {
        reviewCompleted = true;
        await clearManageBacPendingRows();
        setManageBacSyncStatus('已跳过本轮 ManageBac 新事件。', 'success');
    } catch (error) {
        setManageBacSyncStatus(`跳过失败：${error.message}`, 'error');
    } finally {
        setReviewInProgress(false);
    }
}
