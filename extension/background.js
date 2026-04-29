/**
 * TimeWhere Background Service Worker
 * 版本: v2.0
 * 日期: 2026-04-02
 */

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        await initializeOnFirstInstall();
    }
});

async function initializeOnFirstInstall() {
    try {
        const response = await fetch(chrome.runtime.getURL('shared/js/db.js'));
        if (response.ok) {
            console.log('TimeWhere: Extension installed successfully');
        }
    } catch (e) {
        console.error('TimeWhere: Failed to initialize', e);
    }
}

chrome.alarms.create('syncAlarm', {
    periodInMinutes: 5
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'syncAlarm') {
        await performBackgroundSync();
    }
});

async function performBackgroundSync() {
    try {
        const tabs = await chrome.tabs.query({});
        const timeWhereTab = tabs.find(t => t.url && t.url.includes('TimeWhere'));
        
        if (timeWhereTab) {
            chrome.tabs.sendMessage(timeWhereTab.id, { action: 'sync' });
        }
    } catch (e) {
        // No active tab for sync
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getStatus') {
        sendResponse({ status: 'ok', timestamp: new Date().toISOString() });
    }
    
    if (message.action === 'triggerSync') {
        performBackgroundSync().then(() => {
            sendResponse({ success: true });
        });
        return true;
    }
    
    if (message.action === 'openPage') {
        const page = message.page || 'focus';
        chrome.tabs.create({
            url: `pages/${page}/${page}.html`
        });
        sendResponse({ success: true });
    }
    
    return false;
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
    chrome.tabs.create({
        url: 'pages/focus/focus.html'
    });
});