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

function isAllowedManageBacIcsUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        const host = url.hostname.toLowerCase();
        const isManageBacHost = host === 'managebac.com' ||
            host.endsWith('.managebac.com') ||
            host === 'managebac.cn' ||
            host.endsWith('.managebac.cn');
        return url.protocol === 'https:' &&
            isManageBacHost &&
            /\/student\/events\//i.test(url.pathname);
    } catch (_) {
        return false;
    }
}

async function fetchManageBacIcs(url) {
    if (!isAllowedManageBacIcsUrl(url)) {
        throw new Error('Unsupported ManageBac ICS subscription host or path');
    }
    let response;
    try {
        response = await fetch(url, { cache: 'no-store' });
    } catch (_) {
        throw new Error('无法读取 ManageBac ICS link，请检查链接是否有效、网络是否可访问。');
    }
    if (!response.ok) {
        throw new Error(`ICS request failed: HTTP ${response.status}`);
    }
    return await response.text();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'TIMEWHERE_MANAGEBAC_FETCH_ICS') {
        fetchManageBacIcs(message.url)
            .then(text => sendResponse({ ok: true, text }))
            .catch(error => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message.action === 'getStatus') {
        sendResponse({ status: 'ok', timestamp: new Date().toISOString() });
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
