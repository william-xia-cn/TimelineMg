/**
 * TimeWhere Settings Page Script
 * 版本: v2.0
 * 日期: 2026-04-02
 */

document.addEventListener('DOMContentLoaded', async () => {
    await initDatabase();
    await checkAndShowWizard();
    await loadSettings();
    setupEventListeners();
    checkReturnFromInit();
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
    document.getElementById('settingsView').style.display = 'block';
    document.getElementById('wizardView').style.display = 'none';
    document.getElementById('wizardFooter').style.display = 'none';
    document.getElementById('saveBtn').style.display = 'block';
}

async function loadSettings() {
    const settings = await TimeWhereDB.getSettings();
    
    document.getElementById('theme').value = settings.theme || 'light';
    document.getElementById('weekStartsOn').value = settings.start_week_on || 1;
    document.getElementById('tomatoDuration').value = settings.pomodoro_work || 25;
    document.getElementById('notificationsEnabled').checked = settings.notification_enabled !== false;
    document.getElementById('reminderBefore').value = settings.reminder_before || 15;
    document.getElementById('defaultDuration').value = settings.default_duration || 45;
    document.getElementById('defaultPriority').value = settings.default_priority || 'medium';
    
    // Google 账号
    const googleConnected = settings.google_connected;
    const googleEmail = settings.google_email;
    const authBtn = document.getElementById('googleAuthBtn');
    const accountDesc = document.getElementById('googleAccountDesc');
    const revokeBtn = document.getElementById('googleRevokeBtn');
    const syncStatusRow = document.getElementById('syncStatusRow');
    const syncStatusDesc = document.getElementById('syncStatusDesc');
    
    if (googleConnected && googleEmail) {
        accountDesc.textContent = googleEmail;
        authBtn.textContent = '重新授权';
        if (revokeBtn) revokeBtn.style.display = 'inline-flex';
        if (syncStatusRow) syncStatusRow.style.display = 'flex';
        
        // 显示最后同步时间
        const lastSync = settings.last_sync;
        if (lastSync) {
            const syncDate = new Date(lastSync);
            syncStatusDesc.textContent = `上次同步: ${syncDate.toLocaleString('zh-CN')}`;
        } else {
            syncStatusDesc.textContent = '从未同步';
        }
    } else {
        accountDesc.textContent = '未连接';
        authBtn.textContent = '连接';
        if (revokeBtn) revokeBtn.style.display = 'none';
        if (syncStatusRow) syncStatusRow.style.display = 'none';
    }
}

function setupEventListeners() {
    document.getElementById('saveBtn').addEventListener('click', saveSettings);
    document.getElementById('reinitBtn').addEventListener('click', reinitialize);
    document.getElementById('googleAuthBtn').addEventListener('click', handleGoogleAuth);
    document.getElementById('googleRevokeBtn')?.addEventListener('click', handleGoogleRevoke);
    document.getElementById('syncNowBtn')?.addEventListener('click', handleSyncNow);
    setupWizardEvents();
    setupImportEvents();
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
    document.getElementById('addUrlBtn')?.addEventListener('click', handleUrlAdd);
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

function handleUrlAdd() {
    const url = document.getElementById('icsUrlInput').value.trim();
    if (url && isValidUrl(url)) {
        document.getElementById('selectedFileName').textContent = url;
        document.getElementById('importBtn').disabled = false;
        localStorage.setItem('icsFileType', 'url');
        localStorage.setItem('icsFileUrl', url);
    } else {
        showToast('请输入有效的网址', 'error');
    }
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
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
    } else if (type === 'url') {
        const url = localStorage.getItem('icsFileUrl');
        if (url) {
            try {
                const response = await fetch(url);
                const content = await response.text();
                await parseICSAndSave(content);
            } catch (e) {
                showToast('无法获取文件，请检查网址', 'error');
            }
        }
    }
}

async function parseICSAndSave(content, source = 'timetable') {
    // 删除相同来源的旧事件，不影响其他来源和手动事件
    const oldCount = await TimeWhereDB.db.events.filter(e => e.source === source).count();
    await TimeWhereDB.db.events.filter(e => e.source === source).delete();
    console.log('[ICS] 已清除旧课表事件:', oldCount);

    const parsedEvents = parseICS(content);
    console.log('[ICS] 解析到事件:', parsedEvents.length);

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

    console.log('[ICS] 导入完成:', savedCount);
    showToast(`课表已更新：导入 ${savedCount} 节课（替换了 ${oldCount} 条旧记录）`, 'success');
    await updateTimetableStatus();
}

async function updateTimetableStatus() {
    const statusEl = document.getElementById('timetableStatus');
    if (!statusEl) return;
    const count = await TimeWhereDB.db.events.filter(e => e.source === 'timetable').count();
    statusEl.textContent = count > 0 ? `已导入 ${count} 节课` : '尚未导入课表';
}

/** UTC → UTC+8 日期时间解析（处理跨午夜和 RFC 5545 参数前缀） */
function parseDTLine(line) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return null;
    const value = line.substring(colonIdx + 1).trim();
    const isUTC = value.endsWith('Z');

    const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
    if (!match) return null;

    let year = parseInt(match[1]);
    let month = parseInt(match[2]);
    let day = parseInt(match[3]);

    if (!match[4]) {
        return { date: `${match[1]}-${match[2]}-${match[3]}`, time: null };
    }

    let hour = parseInt(match[4]);
    let minute = parseInt(match[5]);

    if (isUTC) {
        const utc = new Date(Date.UTC(year, month - 1, day, hour, minute));
        const local = new Date(utc.getTime() + 8 * 3600 * 1000);
        year   = local.getUTCFullYear();
        month  = local.getUTCMonth() + 1;
        day    = local.getUTCDate();
        hour   = local.getUTCHours();
        minute = local.getUTCMinutes();
    }

    return {
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    };
}

function parseICS(content) {
    // RFC 5545 §3.1: 展开续行（CRLF + 空格/Tab）
    const unfolded = content.replace(/\r?\n[ \t]/g, '');
    const lines = unfolded.split(/\r?\n/);
    const events = [];
    let cur = null;

    for (const line of lines) {
        if (line === 'BEGIN:VEVENT') {
            cur = {};
        } else if (line === 'END:VEVENT' && cur) {
            events.push(cur);
            cur = null;
        } else if (cur) {
            if (line.startsWith('SUMMARY:')) {
                cur.summary = line.substring(8)
                    .replace(/\\,/g, ',')
                    .replace(/\\n/g, ' ')
                    .replace(/\\\\/g, '\\');
            } else if (line.startsWith('DTSTART')) {
                const parsed = parseDTLine(line);
                if (parsed) { cur.startDate = parsed.date; cur.startTime = parsed.time; }
            } else if (line.startsWith('DTEND')) {
                const parsed = parseDTLine(line);
                if (parsed) { cur.endDate = parsed.date; cur.endTime = parsed.time; }
            }
        }
    }

    console.log('[ICS DEBUG] Parsed events:', events.length);
    return events;
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
    
    const { getContainerLayer } = window.TimeWhereScheduling;
    for (const container of containers) {
        const layer = getContainerLayer(container);
        const layerBadge = layer === 1
            ? `<span class="layer-badge layer-study">学习</span>`
            : `<span class="layer-badge layer-free">自由</span>`;
        const div = document.createElement('div');
        div.className = 'container-item';
        div.innerHTML = `
            <div class="container-info">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span class="container-name">${container.name}</span>
                    ${layerBadge}
                </div>
                <span class="container-time">${container.time_start} - ${container.time_end} · ${getRepeatText(container.repeat)}</span>
            </div>
            <div class="container-actions">
                <button class="delete" data-id="${container.id}"><span class="material-symbols-outlined" style="font-size: 18px;">delete</span></button>
            </div>
        `;
        containerList.appendChild(div);
    }
    
    containerList.querySelectorAll('.delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('确定要删除这个容器吗？')) {
                await TimeWhereDB.deleteContainer(parseInt(btn.dataset.id));
                loadContainers();
            }
        });
    });
}

function getRepeatText(repeat) {
    const map = { daily: '每天', weekday: '工作日', weekend: '周末', once: '仅一次' };
    return map[repeat] || repeat;
}

async function handleGoogleAuth() {
    const btn = document.getElementById('googleAuthBtn');
    const originalText = btn.textContent;
    btn.textContent = '授权中...';
    btn.disabled = true;
    
    try {
        // 当前使用演示模式（待 OAuth 配置完成后改为真实授权）
        await simulateGoogleAuth();
    } catch (e) {
        console.error('Google auth error:', e);
        showToast('授权失败: ' + e.message, 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function signInWithChromeIdentity() {
    try {
        // 使用 chrome.identity.getAuthToken (推荐方式)
        const token = await new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({
                interactive: true,
                scopes: [
                    'https://www.googleapis.com/auth/tasks',
                    'https://www.googleapis.com/auth/calendar',
                    'https://www.googleapis.com/auth/userinfo.email'
                ]
            }, (authToken) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(authToken);
                }
            });
        });
        
        if (!token) {
            throw new Error('未能获取授权令牌');
        }
        
        // 保存 token
        await TimeWhereDB.setSetting('access_token', token);
        await TimeWhereDB.setSetting('google_connected', true);
        
        // 获取用户信息
        const userInfo = await getGoogleUserInfo(token);
        await TimeWhereDB.setSetting('google_email', userInfo.email);
        
        showToast('Google 账号连接成功', 'success');
        await loadSettings();
        
    } catch (e) {
        console.error('Google auth error:', e);
        throw e;
    }
}

async function getGoogleUserInfo(accessToken) {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
        throw new Error('Failed to get user info');
    }
    
    return await response.json();
}

async function simulateGoogleAuth() {
    // 使用演示模式
    await TimeWhereDB.setSetting('google_connected', true);
    await TimeWhereDB.setSetting('google_email', 'William.Xia.cn@gmail.com');
    await TimeWhereDB.setSetting('access_token', 'demo_access_token');
    await TimeWhereDB.setSetting('refresh_token', 'demo_refresh_token');
    showToast('演示模式已启用 (William.Xia.cn@gmail.com)', 'success');
    await loadSettings();
}

async function handleGoogleRevoke() {
    if (!confirm('确定要断开 Google 账号连接吗？')) return;
    
    await TimeWhereDB.setSetting('google_connected', false);
    await TimeWhereDB.setSetting('google_email', null);
    await TimeWhereDB.setSetting('access_token', null);
    await TimeWhereDB.setSetting('refresh_token', null);
    await TimeWhereDB.setSetting('google_client_id', null);
    
    showToast('已断开 Google 账号', 'success');
    await loadSettings();
}

async function handleSyncNow() {
    const btn = document.getElementById('syncNowBtn');
    const originalText = btn.textContent;
    btn.textContent = '同步中...';
    btn.disabled = true;
    
    try {
        if (typeof SyncEngine !== 'undefined') {
            const result = await SyncEngine.syncToGoogle();
            if (result.success) {
                showToast(`同步完成: ${result.synced} 项已同步`, 'success');
                await loadSettings(); // 刷新显示
            } else {
                showToast('同步失败: ' + (result.reason || result.error), 'error');
            }
        } else {
            showToast('同步引擎未加载', 'error');
        }
    } catch (e) {
        console.error('Sync error:', e);
        showToast('同步失败: ' + e.message, 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function saveSettings() {
    const settings = {
        theme: document.getElementById('theme').value,
        start_week_on: parseInt(document.getElementById('weekStartsOn').value),
        pomodoro_work: parseInt(document.getElementById('tomatoDuration').value),
        notification_enabled: document.getElementById('notificationsEnabled').checked,
        reminder_before: parseInt(document.getElementById('reminderBefore').value),
        default_duration: parseInt(document.getElementById('defaultDuration').value) || 45,
        default_priority: document.getElementById('defaultPriority').value || 'medium'
    };

    for (const [key, value] of Object.entries(settings)) {
        await TimeWhereDB.setSetting(key, value);
    }

    showToast('设置已保存', 'success');
}

async function reinitialize() {
    if (confirm('确定要重新初始化吗？这将清除所有数据。')) {
        await TimeWhereDB.setSetting('initialized', false);
        window.location.reload();
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
            
            if (initContainer || initTimetable) {
                localStorage.setItem('wizard_init_container', initContainer);
                localStorage.setItem('wizard_init_timetable', initTimetable);
                window.location.href = '../calendar/calendar.html?init=true';
                return;
            }
        }
        
        if (currentStep === 3) {
            // 任务初始化步骤，暂时跳过
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
    
    document.getElementById('authBtn').addEventListener('click', async () => {
        await handleGoogleAuth();
    });
    
    document.getElementById('skipScheduleBtn')?.addEventListener('click', async () => {
        localStorage.setItem('wizard_init_container', false);
        localStorage.setItem('wizard_init_timetable', false);
        currentStep = 3;
        updateWizardUI();
    });
    
    document.getElementById('skipTaskInitBtn')?.addEventListener('click', async () => {
        currentStep = 4;
        updateWizardUI();
    });
    
    document.getElementById('wizardFinishBtn')?.addEventListener('click', async () => {
        await TimeWhereDB.setSetting('initialized', true);
        await TimeWhereDB.setSetting('first_launch', new Date().toISOString());
        window.location.href = '../focus/focus.html';
    });

    updateWizardUI();
}

async function createDefaultContainers() {
    const containers = [
        {
            name: '学习时间',
            color: '#4A90D9',
            time_start: '18:30',
            time_end: '21:30',
            repeat: 'weekday',
            task_types: ['homework', 'test', 'ia', 'notes', 'review'],
            defense: 'soft',
            squeezing: 'p1_only'
        },
        {
            name: '自由时间',
            color: '#7B68EE',
            time_start: '21:30',
            time_end: '23:00',
            repeat: 'daily',
            task_types: ['project', 'other'],
            defense: 'soft',
            squeezing: 'p1_p2'
        },
        {
            name: '睡前时间',
            color: '#2E8B57',
            time_start: '23:00',
            time_end: '23:30',
            repeat: 'daily',
            task_types: ['notes', 'review'],
            defense: 'hard',
            squeezing: 'none'
        }
    ];
    
    for (const container of containers) {
        await TimeWhereDB.addContainer(container);
    }
}

async function createDefaultHabits() {
    const habits = [
        {
            title: '每日背单词',
            frequency: 'daily',
            target_count: 1
        },
        {
            title: '晨跑',
            frequency: 'daily',
            target_count: 1
        }
    ];
    
    for (const habit of habits) {
        await TimeWhereDB.addHabit(habit);
    }
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

function addContainerToList(container) {
    const containerList = document.getElementById('containerList');
    const repeatText = container.repeat === 'daily' ? '每天' : container.repeat === 'weekday' ? '工作日' : '周末';
    
    const div = document.createElement('div');
    div.className = 'container-item';
    div.innerHTML = `
        <div>
            <strong>${container.name}</strong>
            <div style="font-size: 12px; color: var(--text-sub);">${container.time_start} - ${container.time_end} | ${repeatText}</div>
        </div>
        <input type="checkbox" checked>
    `;
    containerList.appendChild(div);
}

async function saveSelectedContainers() {
    const checkboxes = document.querySelectorAll('#containerList input[type="checkbox"]:checked');
    const defaultContainers = [
        { id: 'study', name: '学习时间', color: '#4A90D9', time_start: '18:30', time_end: '21:30', repeat: 'weekday' },
        { id: 'free', name: '自由时间', color: '#7B68EE', time_start: '21:30', time_end: '23:00', repeat: 'daily' },
        { id: 'sleep', name: '睡前时间', color: '#2E8B57', time_start: '23:00', time_end: '23:30', repeat: 'daily' }
    ];
    
    const selectedIds = Array.from(checkboxes).map(cb => cb.dataset.container);
    
    for (const defaultContainer of defaultContainers) {
        if (selectedIds.includes(defaultContainer.id)) {
            const exists = await TimeWhereDB.getContainers({ name: defaultContainer.name });
            if (exists.length === 0) {
                await TimeWhereDB.addContainer({
                    name: defaultContainer.name,
                    color: defaultContainer.color,
                    time_start: defaultContainer.time_start,
                    time_end: defaultContainer.time_end,
                    repeat: defaultContainer.repeat,
                    task_types: ['homework', 'test', 'ia', 'notes', 'review'],
                    defense: 'soft',
                    squeezing: 'p1_only'
                });
            }
        }
    }
}