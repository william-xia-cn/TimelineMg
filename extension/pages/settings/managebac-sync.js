/**
 * ManageBac event sync confirmation page.
 */
document.addEventListener('DOMContentLoaded', async () => {
    setupManageBacSyncEvents();
    try {
        await TimeWhereDB.initDefaultSettings();
        await loadManageBacSyncPrecondition();
        await restorePendingEventMappings();
    } catch (error) {
        setManageBacSyncStatus(`页面初始化失败：${error.message}`, 'error');
    }
});

const MANAGEBAC_PENDING_EVENTS_SESSION_KEY = 'timewhere_managebac_pending_event_mappings';
let managebacPlans = [];
let managebacReady = false;
let syncInProgress = false;
let currentPendingEventRows = [];

function setupManageBacSyncEvents() {
    document.getElementById('backBtn')?.addEventListener('click', () => {
        window.location.href = 'settings.html';
    });
    document.getElementById('savePendingEventMappingsBtn')?.addEventListener('click', handleSavePendingEventMappings);
}

async function loadManageBacSyncPrecondition() {
    const precondition = await TimeWhereManageBac.getMappingPrecondition(TimeWhereDB);
    managebacPlans = precondition.plans || [];
    const mappings = await TimeWhereDB.getSetting(TimeWhereManageBac.SETTINGS_MAPPING_KEY);
    const activeMappingCount = (mappings || []).filter(row => row?.plan_id).length;
    managebacReady = precondition.ok && activeMappingCount > 0;
    if (!precondition.ok) {
        setManageBacSyncStatus('请先导入 MatrixView 并完成学科 Plan 初始化，再同步 ManageBac 事件。', 'error');
    } else if (!activeMappingCount) {
        setManageBacSyncStatus('请先配置 ManageBac 学科映射，再同步新增事件。', 'error');
    }
    updateManageBacSyncControls();
}

function setSyncInProgress(inProgress, message = '') {
    syncInProgress = inProgress;
    updateManageBacSyncControls();
    if (message) setManageBacSyncStatus(message, 'info');
}

function updateManageBacSyncControls() {
    document.getElementById('savePendingEventMappingsBtn')?.toggleAttribute('disabled', !managebacReady || syncInProgress || !currentPendingEventRows.length);
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
        updateManageBacSyncControls();
        return;
    }

    target.className = 'managebac-table-wrap';
    target.innerHTML = `
        <table class="managebac-table">
            <thead>
                <tr>
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
    updateManageBacSyncControls();
}

async function restorePendingEventMappings() {
    const persistedRows = await TimeWhereManageBac.getPendingEventMappings(TimeWhereDB);
    if (persistedRows.length) {
        currentPendingEventRows = persistedRows;
        renderPendingEventMappings(currentPendingEventRows);
        setManageBacSyncStatus(`${currentPendingEventRows.length} 个新增事件等待确认添加`, 'error');
        return;
    }

    const raw = sessionStorage.getItem(MANAGEBAC_PENDING_EVENTS_SESSION_KEY);
    if (!raw) {
        renderPendingEventMappings([]);
        return;
    }
    sessionStorage.removeItem(MANAGEBAC_PENDING_EVENTS_SESSION_KEY);
    try {
        const payload = JSON.parse(raw);
        currentPendingEventRows = Array.isArray(payload.pending_event_mappings)
            ? payload.pending_event_mappings
            : [];
        currentPendingEventRows = await TimeWhereManageBac.savePendingEventMappings(TimeWhereDB, currentPendingEventRows);
        renderPendingEventMappings(currentPendingEventRows);
        if (currentPendingEventRows.length) {
            setManageBacSyncStatus(
                `同步完成：${currentPendingEventRows.length} 个新增事件等待确认添加；已更新 ${payload.updated || 0} 个已有任务`,
                'error'
            );
        } else {
            setManageBacSyncStatus(
                `同步完成：没有需要确认的新事件；已更新 ${payload.updated || 0} 个已有任务`,
                'success'
            );
        }
    } catch (error) {
        setManageBacSyncStatus(`读取新增事件确认列表失败：${error.message}`, 'error');
    }
}

async function handleSavePendingEventMappings() {
    if (!managebacReady || syncInProgress || !currentPendingEventRows.length) return;
    const rows = currentPendingEventRows.map((row, index) => {
        const select = document.querySelector(`.managebac-event-plan-select[data-index="${index}"]`);
        const planId = select?.value || '';
        const plan = managebacPlans.find(item => String(item.id) === String(planId));
        return {
            event_uid: row.event_uid,
            plan_id: planId,
            subject: plan ? (plan.subject || plan.name) : '',
            subject_in_managebac: plan ? (plan.subject || plan.name) : ''
        };
    });
    const selectedCount = rows.filter(row => row.plan_id).length;

    setSyncInProgress(true, `正在添加 ${selectedCount} 个确认任务…`);
    try {
        const saved = await TimeWhereManageBac.saveEventSubjectOverrides(TimeWhereDB, rows, managebacPlans);
        currentPendingEventRows = await TimeWhereManageBac.clearPendingEventMappings(TimeWhereDB);
        renderPendingEventMappings([]);
        const config = await TimeWhereManageBac.getManageBacIcsConfig(TimeWhereDB);
        if (!config?.link) {
            setManageBacSyncStatus('添加失败：请先保存 ManageBac ICS link。', 'error');
            return saved;
        }
        const icsText = await TimeWhereManageBac.fetchIcsText(config.link);
        const result = await TimeWhereManageBac.syncManageBacIcs(TimeWhereDB, icsText, config.link, {
            confirmLinkChange: true,
            applyPendingEventOverrides: true
        });
        currentPendingEventRows = await TimeWhereManageBac.savePendingEventMappings(TimeWhereDB, result.pending_event_mappings || []);
        renderPendingEventMappings(currentPendingEventRows);
        setManageBacSyncStatus(`已添加 ${result.created} 个任务；仍有 ${currentPendingEventRows.length} 个新增事件未添加`, currentPendingEventRows.length ? 'error' : 'success');
        return result;
    } catch (error) {
        setManageBacSyncStatus(`保存新增事件学科失败：${error.message}`, 'error');
        return null;
    } finally {
        setSyncInProgress(false);
    }
}
