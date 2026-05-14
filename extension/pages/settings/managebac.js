/**
 * ManageBac subject mapping page.
 */
document.addEventListener('DOMContentLoaded', async () => {
    setupManageBacEvents();
    try {
        await TimeWhereDB.initDefaultSettings();
        await loadManageBacPrecondition();
    } catch (error) {
        setManageBacStatus(`页面初始化失败：${error.message}`, 'error');
    }
});

let managebacPlans = [];
let currentManageBacRows = [];
let managebacReady = false;
let previewInProgress = false;

function setupManageBacEvents() {
    document.getElementById('backBtn')?.addEventListener('click', () => {
        window.location.href = 'settings.html';
    });
    document.getElementById('managebacPreviewBtn')?.addEventListener('click', handleManageBacPreview);
    document.getElementById('managebacResetBtn')?.addEventListener('click', resetManageBacSelection);
    document.getElementById('saveManageBacMappingsBtn')?.addEventListener('click', handleSaveManageBacMappings);
}

async function loadManageBacPrecondition() {
    const precondition = await TimeWhereManageBac.getMappingPrecondition(TimeWhereDB);
    managebacPlans = precondition.plans || [];
    managebacReady = precondition.ok;
    renderPrecondition(precondition);
    if (precondition.ok) {
        const saved = await TimeWhereDB.getSetting(TimeWhereManageBac.SETTINGS_MAPPING_KEY);
        if (Array.isArray(saved) && saved.length) {
            currentManageBacRows = TimeWhereManageBac.buildMappingPreview(saved, managebacPlans, saved);
            renderMappingPreview(currentManageBacRows);
            setManageBacStatus(`已加载 ${saved.length} 条 ManageBac 学科映射`, 'info');
        }
    }
    updateManageBacControls();
}

function renderPrecondition(precondition) {
    const card = document.getElementById('preconditionCard');
    const status = document.getElementById('preconditionStatus');
    if (!card || !status) return;
    if (precondition.ok) {
        card.dataset.state = 'ready';
        status.textContent = `可配置：已找到 MatrixView 映射和 ${precondition.planCount} 个现有 Plan`;
    } else {
        card.dataset.state = 'blocked';
        status.textContent = '请先导入 MatrixView 并完成“保存并初始化学科 Plan 数据”，再配置 ManageBac 映射';
    }
}

async function handleManageBacPreview() {
    if (previewInProgress || !managebacReady) return;
    const file = document.getElementById('managebacFileInput')?.files?.[0];
    if (!file) {
        setManageBacStatus('请先选择本地 ManageBac HTML 文件（.html/.htm）', 'error');
        return;
    }

    setPreviewInProgress(true, '正在读取 ManageBac HTML…');
    try {
        const text = await file.text();
        const parsed = TimeWhereManageBac.parseManageBacHtml(text);
        if (parsed.parse_status !== 'ok') {
            clearManageBacPreview();
            setManageBacStatus(`未找到可用的 ManageBac 学科表：${parsed.unsupported_reason}`, 'error');
            return;
        }

        const saved = await TimeWhereDB.getSetting(TimeWhereManageBac.SETTINGS_MAPPING_KEY);
        currentManageBacRows = TimeWhereManageBac.buildMappingPreview(parsed.subjects, managebacPlans, saved || []);
        renderMappingPreview(currentManageBacRows);
        const matched = currentManageBacRows.filter(row => row.plan_id).length;
        setManageBacStatus(`读取完成：${currentManageBacRows.length} 个 ManageBac 学科，自动匹配 ${matched} 个`, 'success');
    } catch (error) {
        clearManageBacPreview();
        setManageBacStatus(`读取失败：${error.message}`, 'error');
    } finally {
        setPreviewInProgress(false);
    }
}

function resetManageBacSelection() {
    const input = document.getElementById('managebacFileInput');
    if (input) input.value = '';
    clearManageBacPreview();
    setManageBacStatus('已清空选择，未修改已保存映射', 'info');
}

function clearManageBacPreview() {
    currentManageBacRows = [];
    renderMappingPreview([]);
}

function setPreviewInProgress(inProgress, message = '') {
    previewInProgress = inProgress;
    document.getElementById('managebacPreviewBtn')?.toggleAttribute('disabled', inProgress || !managebacReady);
    document.getElementById('managebacFileInput')?.toggleAttribute('disabled', inProgress || !managebacReady);
    if (inProgress && message) setManageBacStatus(message, 'info');
}

function updateManageBacControls() {
    const disabled = !managebacReady || previewInProgress;
    document.getElementById('managebacPreviewBtn')?.toggleAttribute('disabled', disabled);
    document.getElementById('managebacFileInput')?.toggleAttribute('disabled', disabled);
    document.getElementById('saveManageBacMappingsBtn')?.toggleAttribute('disabled', !managebacReady || !currentManageBacRows.length);
}

function renderMappingPreview(rows) {
    const target = document.getElementById('mappingPreview');
    if (!target) return;
    if (!rows.length) {
        target.className = 'managebac-empty';
        target.textContent = managebacReady
            ? '读取 HTML 后显示 ManageBac 学科映射'
            : '完成 MatrixView Plan 初始化后才能配置 ManageBac 映射';
        updateManageBacControls();
        return;
    }

    target.className = 'managebac-table-wrap';
    target.innerHTML = `
        <table class="managebac-table">
            <thead>
                <tr>
                    <th>Subject in ManageBac</th>
                    <th>Teacher</th>
                    <th>Room</th>
                    <th>TimeWhere Subject / Plan</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((row, index) => `
                    <tr>
                        <td>${TimeWhereManageBac.escapeHTML(row.subject_in_managebac)}</td>
                        <td>${TimeWhereManageBac.escapeHTML(row.teacher)}</td>
                        <td>${TimeWhereManageBac.escapeHTML(row.room)}</td>
                        <td>
                            <select class="managebac-plan-select" data-index="${index}">
                                <option value="">不 同步任务</option>
                                ${managebacPlans.map(plan => `
                                    <option value="${TimeWhereManageBac.escapeAttribute(plan.id)}" ${String(row.plan_id) === String(plan.id) ? 'selected' : ''}>
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
    updateManageBacControls();
}

async function handleSaveManageBacMappings() {
    if (!managebacReady || !currentManageBacRows.length) {
        setManageBacStatus('请先读取 ManageBac HTML 学科配置', 'error');
        return;
    }

    const rows = currentManageBacRows.map((row, index) => {
        const select = document.querySelector(`.managebac-plan-select[data-index="${index}"]`);
        return {
            ...row,
            plan_id: select?.value || ''
        };
    });

    try {
        const mappings = await TimeWhereManageBac.saveMappings(TimeWhereDB, rows, managebacPlans);
        const enabled = mappings.filter(mapping => mapping.sync_enabled).length;
        setManageBacStatus(`已保存 ${mappings.length} 条映射；${enabled} 个学科启用后续任务同步`, 'success');
        currentManageBacRows = TimeWhereManageBac.buildMappingPreview(mappings, managebacPlans, mappings);
        renderMappingPreview(currentManageBacRows);
    } catch (error) {
        setManageBacStatus(`保存失败：${error.message}`, 'error');
    }
}

function setManageBacStatus(message, type = 'info') {
    const status = document.getElementById('managebacStatus');
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
}
