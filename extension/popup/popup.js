// Global error handlers
window.addEventListener('unhandledrejection', (event) => {
    console.warn('Unhandled promise rejection:', event.reason);
});

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initApp();
    } catch(e) {
        console.warn('App init error:', e);
    }
    setupEventListeners();
    startTimeUpdate();
});

async function initApp() {
    try {
        if (typeof TimeWhereDB !== 'undefined') {
            await TimeWhereDB.initDefaultSettings();
        } else {
            console.warn('TimeWhereDB not ready');
            return;
        }
    } catch(e) {
        console.warn('Settings init skipped:', e);
    }
    
    try {
        await loadCurrentTask();
    } catch(e) {
        console.warn('loadCurrentTask error:', e);
    }
    
    try {
        await loadStats();
    } catch(e) {
        console.warn('loadStats error:', e);
    }
}

async function loadCurrentTask() {
    if (typeof TimeWhereDB === 'undefined' || typeof TimeWhereScheduling === 'undefined') {
        renderNoTask();
        return;
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const dayOfWeek = now.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // 构建今日任务池
    const allTasks = await TimeWhereDB.getAllTasks();
    const taskPool = allTasks.filter(t =>
        t.progress !== 'completed' &&
        t.start_date && t.start_date <= todayStr
    );

    // 获取今日生效容器
    const allContainers = (await TimeWhereDB.getContainers({ enabled: true })) || [];
    const todayContainers = allContainers.filter(c =>
        TimeWhereScheduling.containerAppliesToDate(c, now, todayStr, dayOfWeek, isWeekday, isWeekend)
    );

    // Daily Settle
    const { currentTasks, activeContainer, sortedPool } = TimeWhereScheduling.dailySettle(taskPool, todayContainers, now);
    const task = currentTasks[0] || sortedPool[0] || null;

    if (!document.querySelector('.task-card')) return;

    if (task) {
        renderCurrentTask(task, activeContainer);
    } else {
        renderNoTask();
    }
}

function renderCurrentTask(task, activeContainer) {
    const taskCard = document.querySelector('.task-card');
    if (!taskCard) return;

    const containerLabel = activeContainer
        ? `<span class="container-name">${activeContainer.name}</span>`
        : '';
    const dueStr = task.due_date || task.deadline;

    taskCard.innerHTML = `
        <div class="current-task-info">
            <div class="task-title-row">
                <span class="status-dot pulsing"></span>
                <span class="task-title">${task.title || '无标题任务'}</span>
            </div>
            <div class="task-meta">
                <span class="priority-badge ${getPriorityClass(task.priority)}">${TimeWhereScheduling.priorityLabel(task.priority)}</span>
                ${task.duration ? `<span class="duration">${task.duration}分钟</span>` : ''}
                ${containerLabel}
            </div>
            ${dueStr ? `<div class="deadline">截止: ${formatDate(dueStr)}</div>` : ''}
        </div>
    `;

    updateActionButtons(task);
}

function renderNoTask() {
    const taskCard = document.querySelector('.task-card');
    if (!taskCard) return;
    
    taskCard.innerHTML = `
        <div class="task-placeholder">
            <span class="material-symbols-outlined" style="font-size: 24px;">add_circle</span>
            <span>暂无进行中的任务</span>
        </div>
    `;
    
    updateActionButtons(null);
}

function getPriorityClass(priority) {
    const map = {
        'P1': 'priority-high',
        'P2': 'priority-medium',
        'P3': 'priority-low'
    };
    return map[priority] || 'priority-low';
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    if (dateStr === todayStr) return '今天';
    if (dateStr === tomorrowStr) return '明天';
    
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function updateActionButtons(task) {
    const btnStart = document.getElementById('btnStart');
    const btnComplete = document.getElementById('btnComplete');
    const btnDelay = document.getElementById('btnDelay');
    
    if (task) {
        btnStart.querySelector('span').textContent = '继续';
        btnComplete.style.display = 'flex';
        btnDelay.style.display = 'flex';
    } else {
        btnStart.querySelector('span').textContent = '开始';
        btnComplete.style.display = 'none';
        btnDelay.style.display = 'none';
    }
}

async function loadStats() {
    if (typeof TimeWhereDB === 'undefined') return;
    
    const completedToday = await TimeWhereDB.getTodayCompletedCount();
    const pendingCount = await TimeWhereDB.getPendingCount();
    
    const statNums = document.querySelectorAll('.stat-num');
    if (statNums[0]) statNums[0].textContent = completedToday;
    if (statNums[1]) statNums[1].textContent = pendingCount;
}

function setupEventListeners() {
    // 快捷操作按钮
    const actionButtons = document.querySelectorAll('.action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.classList.add('clicked');
            setTimeout(() => btn.classList.remove('clicked'), 150);

            // 用 Daily Settle 获取当前任务（与 loadCurrentTask 保持一致）
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            const dayOfWeek = now.getDay();
            const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const allTasks = await TimeWhereDB.getAllTasks();
            const taskPool = allTasks.filter(t => t.progress !== 'completed' && t.start_date && t.start_date <= todayStr);
            const allContainers = (await TimeWhereDB.getContainers({ enabled: true })) || [];
            const todayContainers = allContainers.filter(c =>
                TimeWhereScheduling.containerAppliesToDate(c, now, todayStr, dayOfWeek, isWeekday, isWeekend)
            );
            const { currentTasks, sortedPool } = TimeWhereScheduling.dailySettle(taskPool, todayContainers, now);
            const task = currentTasks[0] || sortedPool[0] || null;
            
            if (btn.id === 'btnStart' && task) {
                showToast('继续任务', 'info');
            } else if (btn.id === 'btnComplete' && task) {
                await TimeWhereDB.completeTask(task.id);
                showToast('任务完成！', 'success');
                await loadCurrentTask();
                await loadStats();
            } else if (btn.id === 'btnDelay' && task) {
                showToast('任务延后15分钟', 'info');
            }
        });
    });
    
    // 底部按钮 - 设置
    const btnSettings = document.getElementById('btnSettings');
    if (btnSettings) {
        btnSettings.addEventListener('click', function() {
            chrome.runtime.openOptionsPage();
        });
    }
    
    // 底部按钮 - 打开完整页面
    const btnOpenFull = document.getElementById('btnOpenFull');
    if (btnOpenFull) {
        btnOpenFull.addEventListener('click', function() {
            chrome.tabs.create({ url: chrome.runtime.getURL('pages/focus/focus.html') });
        });
    }
}

function startTimeUpdate() {
    function updateTime() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timeEl = document.getElementById('currentTime');
        if (timeEl) {
            timeEl.textContent = `${hours}:${minutes}`;
        }
    }
    updateTime();
    setInterval(updateTime, 1000);
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
    }, 2000);
}