(function initDesktopBridge() {
    'use strict';

    const BRIDGE_VERSION = 1;
    const statusEl = document.getElementById('status');

    function setStatus(message, type = 'info') {
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.style.color = type === 'error' ? '#991b1b' : '#0f766e';
    }

    function getParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            port: Number(params.get('port')),
            nonce: params.get('nonce') || ''
        };
    }

    function isValidNonce(nonce) {
        return /^[A-Za-z0-9_-]{20,80}$/.test(nonce);
    }

    function connect() {
        const { port, nonce } = getParams();
        if (!Number.isInteger(port) || port < 1024 || port > 65535 || !isValidNonce(nonce)) {
            setStatus('连接参数无效。', 'error');
            return;
        }
        const socket = new WebSocket(`ws://127.0.0.1:${port}`);
        socket.addEventListener('open', () => {
            const manifest = chrome.runtime.getManifest();
            socket.send(JSON.stringify({
                type: 'timewhere.desktopBridge.hello',
                bridgeVersion: BRIDGE_VERSION,
                extensionId: chrome.runtime.id,
                version: manifest.version,
                nonce
            }));
            setStatus('已发送控件握手。');
        });
        socket.addEventListener('message', event => {
            try {
                const message = JSON.parse(event.data);
                if (message?.type === 'timewhere.desktopBridge.ack' && message.status === 'ok' && message.nonce === nonce) {
                    setStatus('已连接 TimeWhere Windows 版。');
                    return;
                }
            } catch (_) {
                // Keep visible status stable for malformed messages.
            }
        });
        socket.addEventListener('close', () => {
            if (statusEl?.textContent?.includes('已连接')) return;
            setStatus('连接已关闭，请回到 Windows 版重试。', 'error');
        });
        socket.addEventListener('error', () => {
            setStatus('无法连接 Windows 版，请确认 TimeWhere 正在运行。', 'error');
        });
    }

    connect();
})();
