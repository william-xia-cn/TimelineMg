const crypto = require('crypto');
const { shell } = require('electron');
const { WebSocketServer } = require('ws');

const BRIDGE_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 12000;

function isLoopbackAddress(address) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
}

function normalizeExtensionId(extensionId) {
  return String(extensionId || '').trim().toLowerCase();
}

function isValidExtensionId(extensionId) {
  return /^[a-p]{32}$/.test(normalizeExtensionId(extensionId));
}

function randomNonce() {
  return crypto.randomBytes(24).toString('base64url');
}

function createChromeBridge() {
  let status = { status: 'idle' };
  let activeServer = null;

  function closeActiveServer() {
    if (!activeServer) return;
    try {
      activeServer.close();
    } catch (_) {
      // Best-effort cleanup for one-shot bridge attempts.
    }
    activeServer = null;
  }

  async function connectExtension({ extensionId, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const expectedId = normalizeExtensionId(extensionId);
    if (!isValidExtensionId(expectedId)) {
      status = { status: 'invalid', reason: 'invalid_extension_id' };
      return status;
    }

    closeActiveServer();
    const nonce = randomNonce();
    status = { status: 'waiting', extensionId: expectedId, bridgeVersion: BRIDGE_VERSION };

    return await new Promise((resolve) => {
      const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
      activeServer = server;
      let settled = false;

      function finish(result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        closeActiveServer();
        status = result;
        resolve(result);
      }

      const timer = setTimeout(() => {
        finish({ status: 'not_connected', reason: 'timeout', extensionId: expectedId });
      }, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);

      server.on('connection', (socket, request) => {
        if (!isLoopbackAddress(request.socket.remoteAddress)) {
          socket.close(1008, 'loopback_required');
          return;
        }
        socket.once('message', raw => {
          let message;
          try {
            message = JSON.parse(String(raw));
          } catch (_) {
            socket.close(1008, 'invalid_json');
            finish({ status: 'rejected', reason: 'invalid_json', extensionId: expectedId });
            return;
          }
          if (message?.type !== 'timewhere.desktopBridge.hello') {
            socket.close(1008, 'invalid_message_type');
            finish({ status: 'rejected', reason: 'invalid_message_type', extensionId: expectedId });
            return;
          }
          if (message.nonce !== nonce) {
            socket.close(1008, 'nonce_mismatch');
            finish({ status: 'rejected', reason: 'nonce_mismatch', extensionId: expectedId });
            return;
          }
          if (normalizeExtensionId(message.extensionId) !== expectedId) {
            socket.close(1008, 'extension_id_mismatch');
            finish({ status: 'rejected', reason: 'extension_id_mismatch', extensionId: expectedId });
            return;
          }
          if (Number(message.bridgeVersion || 0) < BRIDGE_VERSION) {
            socket.close(1008, 'bridge_version_too_old');
            finish({ status: 'needs_update', reason: 'bridge_version_too_old', extensionId: expectedId, version: message.version || null });
            return;
          }
          socket.send(JSON.stringify({ type: 'timewhere.desktopBridge.ack', nonce, status: 'ok' }));
          finish({
            status: 'connected',
            extensionId: expectedId,
            version: message.version || null,
            bridgeVersion: message.bridgeVersion || null,
            connected_at: new Date().toISOString()
          });
        });
      });

      server.on('error', error => {
        finish({ status: 'failed', reason: error.message, extensionId: expectedId });
      });

      server.on('listening', () => {
        const port = server.address().port;
        const url = `chrome-extension://${expectedId}/pages/desktop-bridge/bridge.html?port=${encodeURIComponent(port)}&nonce=${encodeURIComponent(nonce)}`;
        shell.openExternal(url).catch(error => {
          finish({ status: 'failed', reason: error.message, extensionId: expectedId });
        });
      });
    });
  }

  return {
    connectExtension,
    getStatus() {
      return status;
    },
    closeActiveServer
  };
}

module.exports = { createChromeBridge, BRIDGE_VERSION };