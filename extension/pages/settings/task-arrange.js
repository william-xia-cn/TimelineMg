/**
 * Task Arrange confirmation page.
 * Reviews task date / priority changes only. ManageBac imports use managebac-sync.js.
 */
const TASK_ARRANGE_PENDING_KEY = 'task_arrange_pending';
const TASK_ARRANGE_LAST_CHECKED_KEY = 'task_arrange_last_checked_at';

let arrangeInProgress = false;
let arrangeCompleted = false;
let arrangePending = null;
let currentArrangeRows = [];

document.addEventListener('DOMContentLoaded', async () => {
    setupTaskArrangeEvents();
    try {
        await TimeWhereDB.initDefaultSettings();
        await restoreTaskArrangePending();
    } catch (error) {
        setTaskArrangeStatus(`页面初始化失败：${error.message}`, 'error');
    }
});

function escapeArrangeHTML(value) {
    const helper = window.TimeWhereScheduling?.escapeHTML;
    if (typeof helper === 'function') return helper(value);
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setupTaskArrangeEvents() {
    document.getElementById('backBtn')?.addEventListener('click', (event) => {
        if (isArrangeBlocking()) {
            event.preventDefault();
            setTaskArrangeStatus('请先确认应用或全部跳过，完成本轮任务调整。', 'error');
            return;
        }
        window.location.href = 'settings.html';
    });
    document.getElementById('applyArrangeChangesBtn')?.addEventListener('click', handleApplyArrangeChanges);
    document.getElementById('skipArrangeReviewBtn')?.addEventListener('click', handleSkipArrangeReview);

    window.addEventListener('beforeunload', (event) => {
        if (!isArrangeBlocking()) return;
        event.preventDefault();
        event.returnValue = '';
    });

    document.addEventListener('click', (event) => {
        if (!isArrangeBlocking()) return;
        const link = event.target.closest('a.nav-item');
        if (!link) return;
        event.preventDefault();
        setTaskArrangeStatus('请先确认应用或全部跳过，完成本轮任务调整。', 'error');
    }, true);
}

function hasArrangeWork(pending) {
    return Array.isArray(pending?.arrange_changes) && pending.arrange_changes.length > 0;
}

function isArrangeBlocking() {
    return false;
}

function setArrangeInProgress(inProgress, message = '') {
    arrangeInProgress = inProgress;
    updateArrangeControls();
    if (message) setTaskArrangeStatus(message, 'info');
}

function updateArrangeControls() {
    const canApply = !arrangeInProgress && currentArrangeRows.length > 0;
    document.getElementById('applyArrangeChangesBtn')?.toggleAttribute('disabled', !canApply);
    document.getElementById('skipArrangeReviewBtn')?.toggleAttribute('disabled', !canApply);
    document.getElementById('backBtn')?.toggleAttribute('disabled', isArrangeBlocking());
}

function setTaskArrangeStatus(message, type = 'info') {
    const status = document.getElementById('taskArrangeStatus');
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
        updateArrangeControls();
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
                                <strong>${escapeArrangeHTML(task.title || task.name || row.task_id || 'Untitled task')}</strong>
                                ${task.source === 'managebac' ? '<div class="managebac-change-note">ManageBac 来源任务</div>' : ''}
                            </td>
                            <td>${escapeArrangeHTML(task.start_date || '未设置')}</td>
                            <td>${escapeArrangeHTML(updates.start_date || row.start_date || task.start_date || '不变')}</td>
                            <td>${escapeArrangeHTML(task.priority || 'medium')}</td>
                            <td>${escapeArrangeHTML(updates.priority || row.priority || task.priority || '不变')}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    updateArrangeControls();
}

async function restoreTaskArrangePending() {
    arrangePending = await TimeWhereDB.getSetting(TASK_ARRANGE_PENDING_KEY);
    currentArrangeRows = Array.isArray(arrangePending?.arrange_changes)
        ? arrangePending.arrange_changes
        : [];
    renderArrangeChanges(currentArrangeRows);

    if (!hasArrangeWork(arrangePending)) {
        arrangeCompleted = true;
        await clearTaskArrangePending({ updateLastChecked: false });
        setTaskArrangeStatus('没有需要确认的任务日期 / 优先级调整。', 'success');
        return;
    }

    setTaskArrangeStatus(`待确认：${currentArrangeRows.length} 个任务日期 / 优先级调整`, 'info');
    updateArrangeControls();
}

function getSelectedArrangeChanges() {
    return currentArrangeRows.filter((row, index) => {
        const checkbox = document.querySelector(`.arrange-change-checkbox[data-index="${index}"]`);
        return checkbox?.checked === true;
    });
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

async function clearTaskArrangePending({ updateLastChecked }) {
    await TimeWhereDB.setSetting(TASK_ARRANGE_PENDING_KEY, null);
    currentArrangeRows = [];
    arrangePending = null;
    renderArrangeChanges([]);
    if (updateLastChecked) {
        await TimeWhereDB.setSetting(TASK_ARRANGE_LAST_CHECKED_KEY, new Date().toISOString());
    }
}

async function handleApplyArrangeChanges() {
    if (arrangeInProgress || !hasArrangeWork(arrangePending)) return;
    const selectedArrange = getSelectedArrangeChanges();
    setArrangeInProgress(true, `正在应用：${selectedArrange.length} 个任务调整…`);
    try {
        const arranged = await applyArrangeChanges(selectedArrange);
        arrangeCompleted = true;
        await clearTaskArrangePending({ updateLastChecked: true });
        setTaskArrangeStatus(`完成：已应用 ${arranged} 个任务调整。`, 'success');
    } catch (error) {
        setTaskArrangeStatus(`应用失败：${error.message}`, 'error');
    } finally {
        setArrangeInProgress(false);
    }
}

async function handleSkipArrangeReview() {
    if (arrangeInProgress || !hasArrangeWork(arrangePending)) return;
    setArrangeInProgress(true, '正在跳过本轮任务调整…');
    try {
        arrangeCompleted = true;
        await clearTaskArrangePending({ updateLastChecked: true });
        setTaskArrangeStatus('已跳过本轮任务调整。', 'success');
    } catch (error) {
        setTaskArrangeStatus(`跳过失败：${error.message}`, 'error');
    } finally {
        setArrangeInProgress(false);
    }
}
