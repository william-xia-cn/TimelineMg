/**
 * Safe external HTTP link helpers for task notes.
 */
(function initTimeWhereExternalLinks(global) {
    const HTTP_LINK_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
    const TRAILING_PUNCTUATION_RE = /[.,!?;:，。！？；：、)\]}]+$/;

    function escapeHTML(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escapeAttribute(value) {
        return escapeHTML(value);
    }

    function stripTrailingPunctuation(value) {
        let next = String(value || '').trim();
        while (next && TRAILING_PUNCTUATION_RE.test(next)) {
            next = next.replace(TRAILING_PUNCTUATION_RE, '');
        }
        return next;
    }

    function normalizeHttpUrl(value) {
        const candidate = stripTrailingPunctuation(value);
        if (!/^https?:\/\//i.test(candidate)) return null;
        try {
            const url = new URL(candidate);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
            return url.href;
        } catch (_) {
            return null;
        }
    }

    function extractHttpLinks(text = '') {
        const matches = String(text || '').match(HTTP_LINK_RE) || [];
        const seen = new Set();
        const links = [];
        matches.forEach(match => {
            const url = normalizeHttpUrl(match);
            if (!url || seen.has(url)) return;
            seen.add(url);
            links.push(url);
        });
        return links;
    }

    function renderExternalLinkList(text = '') {
        const links = extractHttpLinks(text);
        if (!links.length) return '';
        const items = links.map(url => `
            <button type="button" class="external-link-item" data-action="open-external-link" data-url="${escapeAttribute(url)}" title="${escapeAttribute(url)}">
                <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
                <span class="external-link-url">${escapeHTML(url)}</span>
            </button>
        `).join('');
        return `<div class="external-link-list" data-external-link-list>${items}</div>`;
    }

    async function openExternalUrl(value) {
        const url = normalizeHttpUrl(value);
        if (!url) throw new Error('仅支持打开 http/https 链接');
        const result = await global.TimeWherePlatform?.external?.openUrl?.(url);
        if (!result || result.status === 'not_supported') {
            throw new Error(result?.reason || '当前平台不支持打开外部链接');
        }
        if (result.status === 'invalid') {
            throw new Error(result.reason || '链接无效');
        }
        return result;
    }

    const api = {
        extractHttpLinks,
        normalizeHttpUrl,
        renderExternalLinkList,
        openExternalUrl
    };

    global.TimeWhereExternalLinks = global.TimeWhereExternalLinks || api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
