/**
 * TimeWhere Settings Page Script
 * 版本: v2.0
 * 日期: 2026-04-02
 */

const MANAGEMENT_REVIEW_PENDING_KEY = 'management_review_pending';
let settingsManageBacSyncInProgress = false;

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    try {
        await initDatabase();
        await checkAndShowWizard();
        await loadSettings();
        checkReturnFromInit();
    } catch (error) {
        showToast(`设置页初始化失败：${error.message}`, 'error');
    }
});

async function checkReturnFromInit() {
    const urlParams = new URLSearchParams(window.location.search);
    const backFromInit = urlParams.get('backfrom') === 'init';
    
    if (backFromInit) {
        localStorage.setItem('wizard_init_container', 'false');
        localStorage.setItem('wizard_init_timetable', 'false');
        
        window.history.replaceState({}, '', window.location.pathname);
    }
}

async function initDatabase() {
    if (typeof TimeWhereDB !== 'undefined') {
        await TimeWhereDB.initDefaultSettings();
    }
}

async function checkAndShowWizard() {
    const initialized = await TimeWhereDB.getSetting('initialized');
    if (!initialized) {
        // Show wizard for first-time users
        document.getElementById('settingsView').style.display = 'none';
        document.getElementById('wizardView').style.display = 'block';
        document.getElementById('wizardFooter').style.display = 'flex';
        document.getElementById('saveBtn').style.display = 'none';
    } else {
        document.getElementById('settingsView').style.display = 'block';
        document.getElementById('wizardView').style.display = 'none';
        document.getElementById('wizardFooter').style.display = 'none';
        document.getElementById('saveBtn').style.display = 'block';
    }
}

async function loadSettings() {
    const settings = await TimeWhereDB.getSettings();
    
    document.getElementById('theme').value = settings.theme || 'light';
    document.getElementById('weekStartsOn').value = settings.start_week_on || 1;
    document.getElementById('tomatoDuration').value = settings.pomodoro_work || 25;
    document.getElementById('defaultDuration').value = settings.default_duration || 45;
    document.getElementById('defaultPriority').value = settings.default_priority || 'medium';
    document.getElementById('appearanceBackground').value = settings.appearance_background || 'calm';
    document.getElementById('appearanceAvatar').value = settings.appearance_avatar || 'default';
    if (typeof TimeWhereAppearance !== 'undefined') {
        TimeWhereAppearance.applyValues({
            background: document.getElementById('appearanceBackground').value,
            avatar: document.getElementById('appearanceAvatar').value
        });
    }
    await loadSettingsManageBacLink();
}

function setupEventListeners() {
    document.getElementById('saveBtn').addEventListener('click', saveSettings);
    document.getElementById('reinitBtn').addEventListener('click', reinitialize);
    document.getElementById('exportBtn')?.addEventListener('click', exportData);
    document.getElementById('importJsonBtn')?.addEventListener('click', () => document.getElementById('importJsonInput')?.click());
    document.getElementById('importJsonInput')?.addEventListener('change', importData);
    document.getElementById('resetSettingsBtn')?.addEventListener('click', resetSettings);
    document.getElementById('importMatrixViewBtn')?.addEventListener('click', () => {
        window.location.href = 'matrixview.html';
    });
    document.getElementById('configureManageBacBtn')?.addEventListener('click', () => {
        window.location.href = 'managebac.html';
    });
    document.getElementById('settingsSaveManageBacIcsLinkBtn')?.addEventListener('click', handleSettingsSaveManageBacIcsLink);
    document.getElementById('settingsSyncManageBacBtn')?.addEventListener('click', handleSettingsManageBacSync);
    document.getElementById('appearanceBackground')?.addEventListener('change', previewAppearanceSettings);
    document.getElementById('appearanceAvatar')?.addEventListener('change', previewAppearanceSettings);
    setupWizardEvents();
    setupImportEvents();
}

function previewAppearanceSettings() {
    if (typeof TimeWhereAppearance === 'undefined') return;
    TimeWhereAppearance.applyValues({
        background: document.getElementById('appearanceBackground')?.value || 'calm',
        avatar: document.getElementById('appearanceAvatar')?.value || 'default'
    });
}

async function loadSettingsManageBacLink() {
    if (typeof TimeWhereManageBac === 'undefined') return;
    const config = await TimeWhereManageBac.getManageBacIcsConfig(TimeWhereDB);
    const input = document.getElementById('settingsManageBacIcsLinkInput');
    if (input && config?.link) input.value = config.link;
    if (config?.last_synced_at) {
        setSettingsManageBacStatus(`已配置；上次同步 ${config.last_task_count || 0} 个任务`, 'success');
    } else if (config?.link) {
        setSettingsManageBacStatus('已配置；尚未同步', 'info');
    } else {
        setSettingsManageBacStatus('未配置 ManageBac 链接', 'info');
    }
    updateSettingsManageBacControls();
}

function updateSettingsManageBacControls() {
    const disabled = settingsManageBacSyncInProgress || typeof TimeWhereManageBac === 'undefined';
    document.getElementById('settingsManageBacIcsLinkInput')?.toggleAttribute('disabled', disabled);
    document.getElementById('settingsSaveManageBacIcsLinkBtn')?.toggleAttribute('disabled', disabled);
    document.getElementById('settingsSyncManageBacBtn')?.toggleAttribute('disabled', disabled);
}

function setSettingsManageBacStatus(message, type = 'info') {
    const status = document.getElementById('settingsManageBacSyncStatus');
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
}

function setSettingsManageBacSyncInProgress(inProgress, message = '') {
    settingsManageBacSyncInProgress = inProgress;
    updateSettingsManageBacControls();
    if (message) setSettingsManageBacStatus(message, 'info');
}

async function handleSettingsSaveManageBacIcsLink() {
    if (typeof TimeWhereManageBac === 'undefined') {
        setSettingsManageBacStatus('ManageBac 模块未加载', 'error');
        return;
    }
    const link = document.getElementById('settingsManageBacIcsLinkInput')?.value?.trim() || '';
    if (!link) {
        setSettingsManageBacStatus('未配置：请填写 ManageBac 链接。', 'error');
        return;
    }

    setSettingsManageBacSyncInProgress(true, '正在保存 ManageBac 链接…');
    try {
        const result = await TimeWhereManageBac.saveManageBacIcsLink(TimeWhereDB, link, {
            confirmLinkChange: () => window.confirm(
                'ManageBac 链接已改变。保存新链接后，后续同步会按新 ICS 源更新本地 ManageBac source tasks，并删除旧源中已消失的 ManageBac source tasks。是否继续？'
            )
        });
        if (result.status === 'blocked') {
            setSettingsManageBacStatus('已取消：ManageBac 链接改变但未确认。', 'info');
            return;
        }
        setSettingsManageBacStatus('已保存 ManageBac 链接；可点击同步读取新增事件', 'success');
    } catch (error) {
        setSettingsManageBacStatus(`保存失败：${error.message}`, 'error');
    } finally {
        setSettingsManageBacSyncInProgress(false);
    }
}

async function handleSettingsManageBacSync() {
    if (typeof TimeWhereManageBac === 'undefined') {
        setSettingsManageBacStatus('ManageBac 模块未加载', 'error');
        return;
    }

    const mappings = await TimeWhereDB.getSetting(TimeWhereManageBac.SETTINGS_MAPPING_KEY);
    const activeMappingCount = (mappings || []).filter(row => row?.plan_id).length;
    if (!activeMappingCount) {
        setSettingsManageBacStatus('请先配置 ManageBac 学科映射，再同步新增事件。', 'error');
        return;
    }

    const link = document.getElementById('settingsManageBacIcsLinkInput')?.value?.trim() || '';
    let config = await TimeWhereManageBac.getManageBacIcsConfig(TimeWhereDB);
    if (!config?.link && !link) {
        setSettingsManageBacStatus('未配置：请先填写并保存 ManageBac 链接。', 'error');
        return;
    }

    setSettingsManageBacSyncInProgress(true, '正在读取 ManageBac ICS…');
    try {
        if (link && (!config?.link || TimeWhereManageBac.normalizeIcsLink(link) !== TimeWhereManageBac.normalizeIcsLink(config.link))) {
            const saveResult = await TimeWhereManageBac.saveManageBacIcsLink(TimeWhereDB, link, {
                confirmLinkChange: () => window.confirm(
                    'ManageBac 链接已改变。保存并同步新链接会按新 ICS 源更新本地 ManageBac source tasks，并删除旧源中已消失的 ManageBac source tasks。是否继续？'
                )
            });
            if (saveResult.status === 'blocked') {
                setSettingsManageBacStatus('已取消：ManageBac 链接改变但未确认。', 'info');
                return;
            }
            config = saveResult.config;
        }

        if (!config?.link) {
            setSettingsManageBacStatus('未配置：请先保存 ManageBac 链接。', 'error');
            return;
        }

        const icsText = await TimeWhereManageBac.fetchIcsText(config.link);
        setSettingsManageBacStatus('正在解析 ManageBac 新增事件…', 'info');
        const result = await TimeWhereManageBac.syncManageBacIcs(TimeWhereDB, icsText, config.link, { confirmLinkChange: true });
        const pendingRows = await TimeWhereManageBac.savePendingEventMappings(TimeWhereDB, result.pending_event_mappings || []);
        await TimeWhereDB.setSetting(MANAGEMENT_REVIEW_PENDING_KEY, {
            source: 'managebac_manual',
            created_at: new Date().toISOString(),
            arrange_changes: [],
            arrange_summary: null,
            managebac_pending_event_mappings: pendingRows,
            managebac_summary: {
                status: result.status,
                events: result.events || 0,
                created: result.created || 0,
                updated: result.updated || 0,
                deleted: result.deleted || 0,
                skipped: result.skipped || 0
            },
            managebac_error: null
        });
        window.location.href = 'managebac-sync.html';
    } catch (error) {
        setSettingsManageBacStatus(`同步失败：${error.message}`, 'error');
    } finally {
        setSettingsManageBacSyncInProgress(false);
    }
}

function setupImportEvents() {
    updateTimetableStatus();

    document.getElementById('importCalendarBtn')?.addEventListener('click', () => {
        const importArea = document.getElementById('importArea');
        importArea.style.display = importArea.style.display === 'none' ? 'block' : 'none';
    });
    
    document.getElementById('manageContainersBtn')?.addEventListener('click', () => {
        const containerArea = document.getElementById('containerManageArea');
        const isHidden = containerArea.style.display === 'none';
        containerArea.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            loadContainers();
        }
    });
    
    document.getElementById('selectFileBtn')?.addEventListener('click', () => {
        document.getElementById('icsFileInput')?.click();
    });
    
    document.getElementById('icsFileInput')?.addEventListener('change', handleFileSelect);
    document.getElementById('importBtn')?.addEventListener('click', handleImport);
    document.getElementById('addContainerBtn')?.addEventListener('click', () => {
        document.getElementById('addContainerModal').style.display = 'flex';
    });

    // Container modal — close
    document.getElementById('closeContainerModal')?.addEventListener('click', closeContainerModal);
    document.getElementById('cancelContainerBtn')?.addEventListener('click', closeContainerModal);

    // Container modal — color picker
    document.getElementById('newContainerColorPicker')?.addEventListener('click', e => {
        const btn = e.target.closest('.color-option');
        if (!btn) return;
        document.querySelectorAll('#newContainerColorPicker .color-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });

    // Container modal — layer toggle
    document.getElementById('newContainerLayerToggle')?.addEventListener('click', e => {
        const btn = e.target.closest('.layer-btn');
        if (!btn) return;
        document.querySelectorAll('#newContainerLayerToggle .layer-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });

    // Container modal — confirm add
    document.getElementById('confirmAddContainer')?.addEventListener('click', async () => {
        const name = document.getElementById('newContainerName')?.value.trim();
        if (!name) { showToast('请输入容器名称', 'error'); return; }
        const start = document.getElementById('newContainerStart')?.value;
        const end = document.getElementById('newContainerEnd')?.value;
        if (!start || !end || start >= end) { showToast('请设置有效的时间范围', 'error'); return; }
        const repeat = document.getElementById('newContainerRepeat')?.value || 'weekday';
        const color = document.querySelector('#newContainerColorPicker .color-option.active')?.dataset.color || '#4A90D9';
        const layer = parseInt(document.querySelector('#newContainerLayerToggle .layer-btn.active')?.dataset.layer || '1');

        await TimeWhereDB.addContainer({ name, color, time_start: start, time_end: end, repeat, layer });
        showToast('时间容器已添加', 'success');
        closeContainerModal();
        loadContainers();
    });
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('selectedFileName').textContent = file.name;
        document.getElementById('importBtn').disabled = false;
        localStorage.setItem('icsFileType', 'file');
    }
}

async function handleImport() {
    const type = localStorage.getItem('icsFileType');
    
    if (type === 'file') {
        const fileInput = document.getElementById('icsFileInput');
        if (fileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                await parseICSAndSave(e.target.result);
            };
            reader.readAsText(fileInput.files[0]);
        }
    } else {
        showToast('请先选择本地 ICS 文件', 'error');
    }
}

async function parseICSAndSave(content, source = 'timetable') {
    // 删除相同来源的旧事件，不影响其他来源和手动事件
    const oldCount = await TimeWhereDB.db.events.filter(e => e.source === source).count();
    await TimeWhereDB.db.events.filter(e => e.source === source).delete();

    const parsedEvents = TimeWhereICS.parseICSToEvents(content);

    if (parsedEvents.length === 0) {
        showToast('未找到有效事件', 'error');
        return;
    }

    let savedCount = 0;
    for (const event of parsedEvents) {
        if (event.startTime && event.endTime && event.startDate) {
            await TimeWhereDB.addEvent({
                title: event.summary || '未命名课程',
                date: event.startDate,
                color: '#4A90D9',
                time_start: event.startTime,
                time_end: event.endTime,
                source
            });
            savedCount++;
        }
    }

    showToast(`课表已更新：导入 ${savedCount} 节课（替换了 ${oldCount} 条旧记录）`, 'success');
    await updateTimetableStatus();
}

async function updateTimetableStatus() {
    const statusEl = document.getElementById('timetableStatus');
    if (!statusEl) return;
    const count = await TimeWhereDB.db.events.filter(e => e.source === 'timetable').count();
    statusEl.textContent = count > 0 ? `已导入 ${count} 节课` : '尚未导入课表';
}

async function loadContainers() {
    const containers = await TimeWhereDB.getContainers();
    const containerList = document.getElementById('settingsContainerList');
    const emptyState = document.getElementById('containerEmptyState');
    
    if (!containerList) return;
    
    containerList.innerHTML = '';
    
    if (containers.length === 0) {
        emptyState.classList.add('show');
        return;
    }
    
    emptyState.classList.remove('show');
    
    const { getContainerLayer, escapeHTML, escapeAttribute } = window.TimeWhereScheduling;
    for (const container of containers) {
        const layer = getContainerLayer(container);
        const layerBadge = layer === 1
            ? `<span class="layer-badge layer-study">学习</span>`
            : `<span class="layer-badge layer-free">自由</span>`;
        const div = document.createElement('div');
        div.className = 'container-item' + (container.enabled === false ? ' disabled' : '');
        div.innerHTML = `
            <div class="container-info">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span class="container-name">${escapeHTML(container.name)}</span>
                    ${layerBadge}
                </div>
                <span class="container-time">${escapeHTML(container.time_start)} - ${escapeHTML(container.time_end)} · ${escapeHTML(getRepeatText(container.repeat))}</span>
            </div>
            <div class="container-actions">
                <label class="toggle-switch">
                    <input type="checkbox" class="container-toggle" data-id="${escapeAttribute(container.id)}" ${container.enabled !== false ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
                <button class="delete" data-id="${escapeAttribute(container.id)}"><span class="material-symbols-outlined" style="font-size: 18px;">delete</span></button>
            </div>
        `;
        containerList.appendChild(div);
    }

    containerList.querySelectorAll('.container-toggle').forEach(toggle => {
        toggle.addEventListener('change', async () => {
            const id = toggle.dataset.id;
            await TimeWhereDB.updateContainer(id, { enabled: toggle.checked });
            loadContainers();
        });
    });

    containerList.querySelectorAll('.delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('确定要删除这个容器吗？')) {
                await TimeWhereDB.deleteContainer(btn.dataset.id);
                loadContainers();
            }
        });
    });
}

function getRepeatText(repeat) {
    const map = { daily: '每天', weekday: '工作日', weekend: '周末', once: '仅一次' };
    return map[repeat] || repeat;
}

async function saveSettings() {
    const settings = {
        theme: document.getElementById('theme').value,
        start_week_on: parseInt(document.getElementById('weekStartsOn').value),
        pomodoro_work: parseInt(document.getElementById('tomatoDuration').value),
        default_duration: parseInt(document.getElementById('defaultDuration').value) || 45,
        default_priority: document.getElementById('defaultPriority').value || 'medium',
        appearance_background: document.getElementById('appearanceBackground').value || 'calm',
        appearance_avatar: document.getElementById('appearanceAvatar').value || 'default'
    };

    for (const [key, value] of Object.entries(settings)) {
        await TimeWhereDB.setSetting(key, value);
    }

    if (typeof TimeWhereAppearance !== 'undefined') {
        await TimeWhereAppearance.save({
            background: settings.appearance_background,
            avatar: settings.appearance_avatar
        });
    }

    showToast('设置已保存', 'success');
}

async function reinitialize() {
    if (confirm('确定要重新初始化吗？这将清除所有数据。')) {
        await TimeWhereDB.clearAllData();
        await TimeWhereDB.setSetting('initialized', false);
        window.location.reload();
    }
}

async function exportData() {
    try {
        const data = await TimeWhereDB.exportAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const d = new Date();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        a.download = `timewhere_backup_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('数据已导出', 'success');
    } catch (e) {
        showToast('导出失败：' + e.message, 'error');
    }
}

async function importData(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!confirm('导入将覆盖当前所有数据，确定继续吗？')) return;
        await TimeWhereDB.importAllData(data);
        showToast('数据导入成功', 'success');
        await loadSettings();
        await loadContainers();
    } catch (err) {
        showToast('导入失败：' + err.message, 'error');
    } finally {
        e.target.value = '';
    }
}

async function resetSettings() {
    if (!confirm('确定要恢复所有设置为默认值吗？')) return;
    try {
        await TimeWhereDB.db.settings.clear();
        await TimeWhereDB.initDefaultSettings();
        await loadSettings();
        showToast('设置已重置', 'success');
    } catch (e) {
        showToast('重置失败：' + e.message, 'error');
    }
}

function setupWizardEvents() {
    let currentStep = 1;
    const totalSteps = 4;
    
    function updateWizardUI() {
        for (let i = 1; i <= totalSteps; i++) {
            const stepEl = document.getElementById(`wizardStepIndicator${i}`);
            const contentEl = document.getElementById(`wizardStep${i}`);
            
            if (i === currentStep) {
                if (stepEl) stepEl.classList.add('active');
                if (contentEl) contentEl.style.display = 'block';
            } else {
                if (stepEl) stepEl.classList.remove('active');
                if (contentEl) contentEl.style.display = 'none';
            }
        }
        
        const nextBtn = document.getElementById('wizardNextBtn');
        const prevBtn = document.getElementById('wizardPrevBtn');
        
        if (prevBtn) prevBtn.style.display = currentStep === 1 ? 'none' : 'block';
        if (nextBtn) nextBtn.textContent = currentStep === totalSteps ? '完成' : '下一步';
    }
    
    document.getElementById('wizardNextBtn').addEventListener('click', async () => {
        if (currentStep === 2) {
            const initContainer = document.getElementById('initContainer')?.checked;
            const initTimetable = document.getElementById('initTimetable')?.checked;

            if (initContainer) {
                await TimeWhereScheduling.initDefaultContainers(TimeWhereDB);
                showToast('默认容器已创建', 'success');
            }

            if (initTimetable) {
                const importArea = document.getElementById('importArea');
                if (importArea) importArea.style.display = 'block';
                showToast('请在下方导入课表', 'info');
            }
        }

        if (currentStep < totalSteps) {
            currentStep++;
            updateWizardUI();
        }
    });

    document.getElementById('wizardPrevBtn').addEventListener('click', () => {
        if (currentStep > 1) {
            currentStep--;
            updateWizardUI();
        }
    });

    document.getElementById('wizardNextBtnAlt')?.addEventListener('click', () => {
        currentStep = 2;
        updateWizardUI();
    });

    document.getElementById('skipScheduleBtn')?.addEventListener('click', async () => {
        currentStep = 3;
        updateWizardUI();
    });

    document.getElementById('skipTaskInitBtn')?.addEventListener('click', async () => {
        currentStep = 4;
        updateWizardUI();
    });

    document.getElementById('wizardFinishBtn').addEventListener('click', async () => {
        await TimeWhereDB.setSetting('initialized', true);
        await TimeWhereDB.setSetting('first_launch', new Date().toISOString());
        window.location.href = '../focus/focus.html';
    });

    updateWizardUI();
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function closeContainerModal() {
    document.getElementById('addContainerModal').style.display = 'none';
    document.getElementById('newContainerName').value = '';
    document.getElementById('newContainerStart').value = '18:30';
    document.getElementById('newContainerEnd').value = '21:30';
    document.getElementById('newContainerRepeat').value = 'weekday';
    // Reset color picker
    document.querySelectorAll('#newContainerColorPicker .color-option').forEach((b, i) => {
        b.classList.toggle('active', i === 0);
    });
    // Reset layer toggle
    document.querySelectorAll('#newContainerLayerToggle .layer-btn').forEach((b, i) => {
        b.classList.toggle('active', i === 0);
    });
}

