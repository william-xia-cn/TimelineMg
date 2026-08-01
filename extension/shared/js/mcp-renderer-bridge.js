/**
 * Renderer-side bridge for Desktop MCP task tools.
 */
(function initTimeWhereMcpRendererBridge(global) {
    'use strict';

    function getProfileId(profile) {
        return profile?.profile_id || null;
    }

    async function buildOptions(request = {}) {
        const profile = await global.TimeWherePlatform?.system?.getDesktopProfile?.();
        return {
            current_profile_id: getProfileId(profile),
            expected_profile_id: request.profile_id || null,
            profile,
            source: 'mcp_agent'
        };
    }

    async function handleRequest(request = {}) {
        const api = global.TimeWhereMDPAgentInterface;
        const db = global.TimeWhereDB;
        if (!api || !db) {
            return { status: 'failed', reason: 'renderer_not_ready', message: 'TimeWhere MCP renderer bridge is not ready' };
        }
        const options = await buildOptions(request);
        return await api.handleMcpToolCall(db, request.tool, request.arguments || {}, options);
    }

    function init() {
        const bridge = global.TimeWhereElectronPlatform;
        if (!bridge?.onMcpRequest || !bridge?.replyMcpRequest) return { status: 'not_supported' };
        bridge.onMcpRequest(async request => {
            try {
                const result = await handleRequest(request);
                await bridge.replyMcpRequest({ request_id: request.request_id, result });
            } catch (error) {
                await bridge.replyMcpRequest({
                    request_id: request.request_id,
                    error: {
                        code: error.code || error.reason || 'mcp_renderer_error',
                        message: error.message || 'MCP renderer request failed',
                        data: error.data || null
                    }
                });
            }
        });
        bridge.markMcpRendererReady?.();
        return { status: 'ready' };
    }

    const api = { init, handleRequest };
    global.TimeWhereMcpRendererBridge = api;
    init();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);