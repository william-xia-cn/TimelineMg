/**
 * TimeWhere ManageBac mapping helpers.
 * Phase 1 only: local HTML subject mapping to existing TimeWhere Plans.
 */
(function(global) {
    const SETTINGS_MAPPING_KEY = 'managebac_subject_mappings';
    const SETTINGS_ICS_KEY = 'managebac_ics_config';
    const SETTINGS_EVENT_OVERRIDES_KEY = 'managebac_event_subject_overrides';
    const SETTINGS_PENDING_EVENTS_KEY = 'managebac_pending_event_mappings';
    const MATRIXVIEW_MAPPING_KEY = 'matrixview_subject_mappings';
    const SOURCE = 'managebac';
    const SOURCE_TYPE_ICS = 'managebac_ics';

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function decodeHtmlEntities(text) {
        const named = {
            amp: '&',
            lt: '<',
            gt: '>',
            quot: '"',
            apos: "'",
            nbsp: ' '
        };
        return String(text || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, value) => {
            const lower = value.toLowerCase();
            if (lower[0] === '#') {
                const isHex = lower[1] === 'x';
                const code = parseInt(lower.slice(isHex ? 2 : 1), isHex ? 16 : 10);
                return Number.isFinite(code) ? String.fromCharCode(code) : entity;
            }
            return Object.prototype.hasOwnProperty.call(named, lower) ? named[lower] : entity;
        });
    }

    function stripTags(value) {
        return decodeHtmlEntities(String(value || '')
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim());
    }

    function escapeHTML(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttribute(value) {
        return escapeHTML(value).replace(/`/g, '&#96;');
    }

    function decodeQuotedPrintable(value) {
        const compact = String(value || '').replace(/=\r?\n/g, '');
        const bytes = [];
        for (let i = 0; i < compact.length; i++) {
            if (compact[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(compact.slice(i + 1, i + 3))) {
                bytes.push(parseInt(compact.slice(i + 1, i + 3), 16));
                i += 2;
            } else {
                const code = compact.charCodeAt(i);
                if (code <= 0x7F) {
                    bytes.push(code);
                } else {
                    const encoded = unescape(encodeURIComponent(compact[i]));
                    for (let j = 0; j < encoded.length; j++) bytes.push(encoded.charCodeAt(j));
                }
            }
        }
        try {
            return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
        } catch (_) {
            return compact.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        }
    }

    function decodeBase64Text(value) {
        const compact = String(value || '').replace(/\s+/g, '');
        try {
            if (typeof atob === 'function') {
                const binary = atob(compact);
                const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
                return new TextDecoder('utf-8').decode(bytes);
            }
            if (typeof Buffer !== 'undefined') {
                return Buffer.from(compact, 'base64').toString('utf8');
            }
        } catch (_) {
            return '';
        }
        return '';
    }

    function decodeMimePart(body, headers) {
        const encoding = normalizeText((headers.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i) || [])[1]).toLowerCase();
        if (encoding === 'quoted-printable') return decodeQuotedPrintable(body);
        if (encoding === 'base64') return decodeBase64Text(body);
        return String(body || '');
    }

    function htmlDocumentsFromInput(rawInput) {
        const raw = String(rawInput || '');
        const docs = [];
        const boundary = (raw.match(/boundary="?([^"\r\n;]+)"?/i) || [])[1];
        if (boundary) {
            const marker = `--${boundary}`;
            for (const part of raw.split(marker)) {
                if (!/Content-Type:\s*text\/html/i.test(part)) continue;
                const split = part.search(/\r?\n\r?\n/);
                if (split < 0) continue;
                const headers = part.slice(0, split);
                const body = part.slice(split).replace(/^\r?\n\r?\n?/, '').replace(/\r?\n--$/, '');
                const decoded = decodeMimePart(body, headers);
                if (decoded) docs.push(decoded);
            }
        }
        if (!docs.length && /Content-Type:\s*text\/html/i.test(raw)) {
            const split = raw.search(/\r?\n\r?\n/);
            if (split >= 0) docs.push(decodeMimePart(raw.slice(split), raw.slice(0, split)));
        }
        if (!docs.length) docs.push(raw);
        return docs;
    }

    function tableRowsFromHtml(tableHtml) {
        const rows = [];
        const rowMatches = String(tableHtml || '').match(/<tr[\s\S]*?<\/tr>/gi) || [];
        for (const rowHtml of rowMatches) {
            const cells = [];
            const cellRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
            let match;
            while ((match = cellRegex.exec(rowHtml))) {
                cells.push(stripTags(match[1]));
            }
            if (cells.some(Boolean)) rows.push(cells);
        }
        return rows;
    }

    function htmlTableCandidates(html) {
        if (typeof DOMParser !== 'undefined') {
            try {
                return htmlDocumentsFromInput(html).flatMap(docHtml => {
                    const doc = new DOMParser().parseFromString(String(docHtml || ''), 'text/html');
                    return Array.from(doc.querySelectorAll('table')).map(table => table.outerHTML);
                });
            } catch (_) {
                // Fall through to regex parsing for tests and older environments.
            }
        }
        return htmlDocumentsFromInput(html).flatMap(docHtml => String(docHtml || '').match(/<table\b[\s\S]*?<\/table>/gi) || []);
    }

    function headerIndex(headers, pattern) {
        return headers.findIndex(header => pattern.test(normalizeText(header)));
    }

    function normalizeKey(value) {
        return normalizeText(decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' ')))
            .toLowerCase()
            .replace(/\bamp\b/g, ' ')
            .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
            .trim();
    }

    function isReadableSubject(value) {
        const text = normalizeText(value);
        if (text.length < 2 || text.length > 160) return false;
        const letters = (text.match(/[A-Za-z\u4E00-\u9FFF]/g) || []).length;
        const controls = (text.match(/[\u0000-\u001F\u007F-\u009F]/g) || []).length;
        return letters >= 2 && controls === 0;
    }

    function decodeAttribute(value) {
        return decodeHtmlEntities(String(value || '').replace(/^['"]|['"]$/g, ''));
    }

    function extractAttribute(tag, attr) {
        const match = String(tag || '').match(new RegExp(`${attr}\\\\s*=\\\\s*([\"'])([\\\\s\\\\S]*?)\\\\1`, 'i'));
        return match ? decodeAttribute(match[2]) : '';
    }

    function normalizeClassHref(value) {
        const href = decodeHtmlEntities(String(value || ''));
        const match = href.match(/\/classes\/([^/?#]+)/i);
        if (!match || /^my$/i.test(match[1])) return '';
        return `/classes/${match[1]}`;
    }

    function extractClassId(value) {
        const href = normalizeClassHref(value);
        const match = href.match(/\/classes\/([^/?#]+)/i);
        return match ? normalizeText(match[1]) : '';
    }

    function leftNavClassCandidates(html) {
        if (typeof DOMParser !== 'undefined') {
            try {
                return htmlDocumentsFromInput(html).flatMap(docHtml => {
                    const doc = new DOMParser().parseFromString(String(docHtml || ''), 'text/html');
                    return Array.from(doc.querySelectorAll('a.f-menu__submenu-link[href*="/classes/"]'))
                        .map(link => ({
                            subject: normalizeClassSubject(link.textContent),
                            href: normalizeClassHref(link.getAttribute('href')),
                            teacher: '',
                            room: ''
                        }))
                        .filter(row => row.href && isReadableSubject(row.subject));
                });
            } catch (_) {
                // Fall through to regex parsing for tests and older environments.
            }
        }

        const candidates = [];
        for (const docHtml of htmlDocumentsFromInput(html)) {
            const linkRegex = /<a\b([^>]*class=["'][^"']*\bf-menu__submenu-link\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
            let match;
            while ((match = linkRegex.exec(docHtml))) {
                const href = normalizeClassHref((match[1].match(/\shref\s*=\s*["']([^"']+)["']/i) || [])[1]);
                const subject = normalizeClassSubject(stripTags(match[2]));
                if (!href || !isReadableSubject(subject)) continue;
                candidates.push({ subject, href, teacher: '', room: '' });
            }
        }
        return candidates;
    }

    function classTileCandidates(html) {
        if (typeof DOMParser !== 'undefined') {
            try {
                return htmlDocumentsFromInput(html).flatMap(docHtml => {
                    const doc = new DOMParser().parseFromString(String(docHtml || ''), 'text/html');
                    return Array.from(doc.querySelectorAll('.f-class-tile')).map(tile => ({
                        subject: normalizeText(tile.querySelector('.f-tile__title-link')?.textContent || tile.querySelector('.f-tile__title')?.textContent),
                        href: normalizeClassHref(tile.querySelector('.f-tile__title-link')?.getAttribute('href')),
                        teacher: Array.from(tile.querySelectorAll('.user-popover[aria-label]'))
                            .map(el => normalizeText(el.getAttribute('aria-label')))
                            .filter(Boolean)
                            .join(', '),
                        room: extractRoomText(tile.textContent)
                    }));
                });
            } catch (_) {
                // Fall through to regex parsing for tests and older environments.
            }
        }

        const candidates = [];
        for (const docHtml of htmlDocumentsFromInput(html)) {
            const tileRegex = /<div\b[^>]*class=["'][^"']*\bf-tile\b[^"']*\bf-class-tile\b[^"']*["'][^>]*>[\s\S]*?(?=<div\b[^>]*class=["'][^"']*\bf-tile\b[^"']*\bf-class-tile\b|<\/main>|$)/gi;
            let tileMatch;
            while ((tileMatch = tileRegex.exec(docHtml))) {
                const tileHtml = tileMatch[0];
                const titleMatch = tileHtml.match(/<a\b[^>]*class=["'][^"']*\bf-tile__title-link\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)
                    || tileHtml.match(/<p\b[^>]*class=["'][^"']*\bf-tile__title\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
                const titleTag = tileHtml.match(/<a\b[^>]*class=["'][^"']*\bf-tile__title-link\b[^"']*["'][^>]*>/i);
                const subject = titleMatch ? normalizeClassSubject(stripTags(titleMatch[1])) : '';
                const teachers = [];
                const userPopoverRegex = /<a\b[^>]*class=["'][^"']*\buser-popover\b[^"']*["'][^>]*>/gi;
                let userMatch;
                while ((userMatch = userPopoverRegex.exec(tileHtml))) {
                    const label = normalizeText((userMatch[0].match(/\saria-label\s*=\s*["']([^"']+)["']/i) || [])[1]);
                    if (label && !teachers.includes(label)) teachers.push(label);
                }
                candidates.push({
                    subject,
                    href: titleTag ? normalizeClassHref((titleTag[0].match(/\shref\s*=\s*["']([^"']+)["']/i) || [])[1]) : '',
                    teacher: teachers.join(', '),
                    room: extractRoomText(stripTags(tileHtml))
                });
            }
        }
        return candidates;
    }

    function normalizeClassSubject(value) {
        return normalizeText(value).replace(/\s+[›>]\s*$/, '').replace(/\s+Info$/i, '');
    }

    function extractRoomText(value) {
        const text = normalizeText(value);
        const match = text.match(/\bRoom\s*:?\s*([A-Za-z0-9][A-Za-z0-9 ._-]{0,24})/i);
        return match ? normalizeText(match[1]).replace(/[.,;:]+$/, '') : '';
    }

    function mergeCandidate(recordsByKey, candidate, preferHref = false) {
        const subject = normalizeClassSubject(candidate.subject);
        if (!isReadableSubject(subject)) return;
        const href = normalizeClassHref(candidate.href);
        const subjectKey = normalizeKey(subject);
        const key = preferHref && href ? `href:${href}` : `subject:${subjectKey}`;
        const existing = recordsByKey.get(key);
        if (existing) {
            if (!existing.teacher && candidate.teacher) existing.teacher = normalizeText(candidate.teacher);
            if (!existing.room && candidate.room) existing.room = normalizeText(candidate.room).replace(/^Room:\s*/i, '');
            return;
        }
        recordsByKey.set(key, {
            subject_in_managebac: subject,
            teacher: normalizeText(candidate.teacher),
            room: normalizeText(candidate.room).replace(/^Room:\s*/i, ''),
            _href: href,
            _subject_key: subjectKey
        });
    }

    function enrichFromTiles(baseByKey, tiles) {
        const byHref = new Map();
        const bySubject = new Map();
        for (const record of baseByKey.values()) {
            if (record._href) byHref.set(record._href, record);
            if (record._subject_key) bySubject.set(record._subject_key, record);
        }
        for (const tile of tiles) {
            const href = normalizeClassHref(tile.href);
            const subjectKey = normalizeKey(tile.subject);
            const record = (href && byHref.get(href)) || bySubject.get(subjectKey);
            if (!record) continue;
            if (!record.teacher && tile.teacher) record.teacher = normalizeText(tile.teacher);
            if (!record.room && tile.room) record.room = normalizeText(tile.room).replace(/^Room:\s*/i, '');
        }
    }

    function tableCandidates(rawHtml) {
        const candidates = [];
        for (const tableHtml of htmlTableCandidates(rawHtml)) {
            const rows = tableRowsFromHtml(tableHtml);
            if (rows.length < 2) continue;
            const headers = rows[0].map(normalizeText);
            const subjectIndex = headerIndex(headers, /\b(subject|class|course)\b/i);
            const teacherIndex = headerIndex(headers, /\b(teacher|instructor)\b/i);
            const roomIndex = headerIndex(headers, /\b(room|location)\b/i);
            if (subjectIndex < 0) continue;

            for (const row of rows.slice(1)) {
                candidates.push({
                    subject: normalizeText(row[subjectIndex]),
                    teacher: teacherIndex >= 0 ? normalizeText(row[teacherIndex]) : '',
                    room: roomIndex >= 0 ? normalizeText(row[roomIndex]).replace(/^Room:\s*/i, '') : ''
                });
            }
        }
        return candidates;
    }

    function parseManageBacHtml(rawHtml) {
        const leftNav = leftNavClassCandidates(rawHtml);
        const tiles = classTileCandidates(rawHtml);
        const recordsByKey = new Map();

        if (leftNav.length) {
            for (const item of leftNav) mergeCandidate(recordsByKey, item, true);
            enrichFromTiles(recordsByKey, tiles);
        } else {
            for (const item of tableCandidates(rawHtml)) mergeCandidate(recordsByKey, item, false);
            for (const tile of tiles) mergeCandidate(recordsByKey, tile, !!tile.href);
        }
        const records = Array.from(recordsByKey.values()).map(record => ({
            subject_in_managebac: record.subject_in_managebac,
            teacher: record.teacher,
            room: record.room,
            managebac_class_href: record._href || '',
            managebac_class_id: extractClassId(record._href)
        }));
        return {
            parse_status: records.length ? 'ok' : 'failed_quality',
            export_type: 'managebac_subject_html',
            unsupported_reason: records.length ? null : 'no_managebac_subject_rows',
            subjects: records.sort((a, b) => a.subject_in_managebac.localeCompare(b.subject_in_managebac))
        };
    }

    function inspectManageBacHtmlStructure(rawHtml) {
        const leftNav = leftNavClassCandidates(rawHtml);
        const tiles = classTileCandidates(rawHtml);
        const parsed = parseManageBacHtml(rawHtml);
        return {
            left_nav_class_count: leftNav.length,
            right_tile_count: tiles.length,
            final_subject_count: parsed.subjects.length,
            count_with_teacher: parsed.subjects.filter(row => row.teacher).length,
            count_with_room: parsed.subjects.filter(row => row.room).length,
            parse_status: parsed.parse_status
        };
    }

    function planLabel(plan) {
        return normalizeText(plan.subject || plan.name);
    }

    function scorePlanMatch(subjectInManageBac, plan) {
        const source = normalizeKey(subjectInManageBac);
        const label = normalizeKey(planLabel(plan));
        if (!source || !label) return 0;
        if (source === label) return 100;
        if (source.includes(label) || label.includes(source)) return 85;
        const sourceTokens = new Set(source.split(/\s+/).filter(token => token.length > 2));
        const labelTokens = new Set(label.split(/\s+/).filter(token => token.length > 2));
        let overlap = 0;
        for (const token of sourceTokens) {
            if (labelTokens.has(token)) overlap++;
        }
        return overlap ? Math.round((overlap / Math.max(labelTokens.size, 1)) * 70) : 0;
    }

    function autoMatchSubject(subjectInManageBac, plans) {
        let best = null;
        let bestScore = 0;
        for (const plan of plans || []) {
            const score = scorePlanMatch(subjectInManageBac, plan);
            if (score > bestScore) {
                best = plan;
                bestScore = score;
            }
        }
        return bestScore >= 45 ? best : null;
    }

    function buildMappingPreview(subjects, plans, savedMappings = []) {
        const savedBySubject = new Map((savedMappings || []).map(mapping => [
            normalizeText(mapping.subject_in_managebac),
            mapping
        ]));
        return (subjects || []).map(subject => {
            const saved = savedBySubject.get(normalizeText(subject.subject_in_managebac));
            const matchedPlan = saved?.plan_id
                ? (plans || []).find(plan => String(plan.id) === String(saved.plan_id))
                : autoMatchSubject(subject.subject_in_managebac, plans);
            return {
                ...subject,
                plan_id: matchedPlan?.id ?? '',
                subject: matchedPlan ? planLabel(matchedPlan) : '',
                match_status: matchedPlan ? 'matched' : 'unmapped'
            };
        });
    }

    function normalizeMappings(rows, plans) {
        const plansById = new Map((plans || []).map(plan => [String(plan.id), plan]));
        const out = [];
        const seen = new Set();
        for (const row of rows || []) {
            const subjectInManageBac = normalizeText(row.subject_in_managebac);
            if (!subjectInManageBac) continue;
            const planId = normalizeText(row.plan_id);
            const plan = planId ? plansById.get(String(planId)) : null;
            const key = subjectInManageBac;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
                subject_in_managebac: subjectInManageBac,
                teacher: normalizeText(row.teacher),
                room: normalizeText(row.room),
                managebac_class_href: normalizeClassHref(row.managebac_class_href || row.class_href || row.href),
                managebac_class_id: normalizeText(row.managebac_class_id || extractClassId(row.managebac_class_href || row.class_href || row.href)),
                plan_id: plan ? plan.id : '',
                subject: plan ? planLabel(plan) : '',
                source: 'managebac',
                sync_enabled: !!plan,
                updated_at: row.updated_at || null
            });
        }
        return out;
    }

    async function getMappingPrecondition(db) {
        const matrixMappings = await db.getSetting(MATRIXVIEW_MAPPING_KEY);
        const plans = await db.getPlans();
        const planOptions = plans.filter(plan => {
            const name = normalizeText(plan.name);
            return name && ((normalizeText(plan.subject) && plan.subject_active !== false) || name === 'Other School Plan');
        });
        const matrixReady = Array.isArray(matrixMappings) && matrixMappings.length > 0;
        return {
            ok: matrixReady && planOptions.length > 0,
            matrixReady,
            planCount: planOptions.length,
            plans: planOptions,
            reason: matrixReady && planOptions.length > 0 ? null : 'matrixview_plans_required'
        };
    }

    async function saveMappings(db, rows, plans) {
        const now = new Date().toISOString();
        const mappings = normalizeMappings(rows, plans).map(mapping => ({ ...mapping, updated_at: now }));
        await db.setSetting(SETTINGS_MAPPING_KEY, mappings);
        return mappings;
    }

    function unfoldIcsLines(rawIcs) {
        const lines = String(rawIcs || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const unfolded = [];
        for (const line of lines) {
            if (/^[ \t]/.test(line) && unfolded.length) {
                unfolded[unfolded.length - 1] += line.slice(1);
            } else {
                unfolded.push(line);
            }
        }
        return unfolded;
    }

    function unescapeIcsText(value) {
        return String(value || '')
            .replace(/\\n/gi, '\n')
            .replace(/\\,/g, ',')
            .replace(/\\;/g, ';')
            .replace(/\\\\/g, '\\')
            .trim();
    }

    function splitIcsContentLine(line) {
        const text = String(line || '');
        let quoted = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') quoted = !quoted;
            if (char === ':' && !quoted) {
                return {
                    nameAndParams: text.slice(0, i),
                    value: text.slice(i + 1)
                };
            }
        }
        return {
            nameAndParams: text,
            value: ''
        };
    }

    function normalizeIcsEventText(lines) {
        return normalizeText((lines || []).map(line => {
            const split = splitIcsContentLine(line);
            return unescapeIcsText(split.value || line);
        }).join(' '));
    }

    function parseIcsDate(value) {
        const text = String(value || '').trim();
        const match = text.match(/^(\d{4})(\d{2})(\d{2})/);
        if (!match) return null;
        return `${match[1]}-${match[2]}-${match[3]}`;
    }

    function parseIcsProperties(lines) {
        const props = {};
        for (const line of lines) {
            const split = splitIcsContentLine(line);
            if (!split.nameAndParams || !split.value) continue;
            const rawName = split.nameAndParams;
            const name = rawName.split(';')[0].toUpperCase();
            if (!props[name]) props[name] = [];
            props[name].push(split.value);
        }
        return props;
    }

    function extractClassRefsFromEventFields(fields) {
        const haystack = fields.filter(Boolean).join(' ');
        const href = normalizeClassHref(haystack);
        return {
            managebac_class_href: href,
            managebac_class_id: extractClassId(href)
        };
    }

    function parseManageBacIcs(rawIcs) {
        const text = String(rawIcs || '');
        if (!/BEGIN:VCALENDAR/i.test(text) || !/BEGIN:VEVENT/i.test(text)) {
            return {
                parse_status: 'unsupported',
                export_type: 'managebac_ics',
                unsupported_reason: 'no_ics_events',
                events: []
            };
        }

        const events = [];
        let current = null;
        for (const line of unfoldIcsLines(text)) {
            if (/^BEGIN:VEVENT$/i.test(line)) {
                current = [];
            } else if (/^END:VEVENT$/i.test(line) && current) {
                const props = parseIcsProperties(current);
                const uid = normalizeText(props.UID?.[0]);
                const summary = unescapeIcsText(props.SUMMARY?.[0]);
                const description = unescapeIcsText(props.DESCRIPTION?.[0]);
                const location = unescapeIcsText(props.LOCATION?.[0]);
                const dueDate = parseIcsDate(props.DUE?.[0]) || parseIcsDate(props.DTSTART?.[0]);
                const fullEventText = normalizeIcsEventText(current);
                const classRefs = extractClassRefsFromEventFields([
                    props.URL?.[0],
                    description,
                    location
                ]);
                if (uid && isReadableSubject(summary) && dueDate) {
                    events.push({
                        uid,
                        summary,
                        description,
                        location,
                        ...classRefs,
                        full_event_text: fullEventText,
                        due_date: dueDate,
                        start_date: parseIcsDate(props.DTSTART?.[0]) || null,
                        end_date: parseIcsDate(props.DTEND?.[0]) || null,
                        status: normalizeText(props.STATUS?.[0]).toLowerCase(),
                        updated_at: normalizeText(props['LAST-MODIFIED']?.[0] || props.DTSTAMP?.[0]),
                        url: normalizeText(props.URL?.[0])
                    });
                }
                current = null;
            } else if (current) {
                current.push(line);
            }
        }

        return {
            parse_status: events.length ? 'ok' : 'failed_quality',
            export_type: 'managebac_ics',
            unsupported_reason: events.length ? null : 'no_readable_ics_events',
            events
        };
    }

    function activeMappings(mappings) {
        return (mappings || []).filter(mapping =>
            mapping && mapping.sync_enabled && mapping.plan_id && normalizeText(mapping.subject_in_managebac)
        );
    }

    async function buildPlanSuggestionMappings(db) {
        const plans = typeof db.getPlans === 'function' ? await db.getPlans() : [];
        const matrixMappings = await db.getSetting(MATRIXVIEW_MAPPING_KEY);
        const legacyMappings = activeMappings(await db.getSetting(SETTINGS_MAPPING_KEY));
        const plansById = new Map((plans || []).map(plan => [String(plan.id), plan]));
        const activePlans = (plans || []).filter(plan => {
            if (!plan || !plan.id || !normalizeText(plan.name)) return false;
            return !(plan.subject && plan.subject_active === false);
        });
        const candidates = [];
        const seen = new Set();

        function addCandidate(plan, label, source = 'plan') {
            const text = normalizeText(label);
            if (!plan || !plan.id || !text) return;
            const key = `${plan.id}:${normalizeKey(text)}`;
            if (seen.has(key)) return;
            seen.add(key);
            candidates.push({
                subject_in_managebac: text,
                plan_id: plan.id,
                subject: plan.subject || plan.name,
                source,
                sync_enabled: true
            });
        }

        for (const plan of activePlans) {
            addCandidate(plan, plan.name, 'plan_name');
            addCandidate(plan, plan.subject, 'plan_subject');
        }

        for (const mapping of matrixMappings || []) {
            const subject = normalizeText(mapping.subject || mapping.subject_in_matrixview);
            const planName = normalizeText(mapping.plan_name || mapping.subject);
            const plan = activePlans.find(item =>
                normalizeKey(item.subject) === normalizeKey(subject) ||
                normalizeKey(item.name) === normalizeKey(planName)
            );
            if (plan) addCandidate(plan, mapping.subject_in_matrixview, 'matrixview_subject');
        }

        for (const mapping of legacyMappings) {
            const plan = plansById.get(String(mapping.plan_id));
            if (plan && !(plan.subject && plan.subject_active === false)) {
                addCandidate(plan, mapping.subject_in_managebac, 'legacy_managebac_mapping');
            }
        }

        return candidates;
    }

    function normalizeEventOverrides(rows) {
        const out = [];
        const seen = new Set();
        for (const row of rows || []) {
            const eventUid = normalizeText(row.event_uid);
            const planId = normalizeText(row.plan_id);
            if (!eventUid || !planId || seen.has(eventUid)) continue;
            seen.add(eventUid);
            out.push({
                event_uid: eventUid,
                plan_id: row.plan_id,
                subject: normalizeText(row.subject),
                subject_in_managebac: normalizeText(row.subject_in_managebac),
                source: 'managebac_event_subject_override',
                updated_at: row.updated_at || null
            });
        }
        return out;
    }

    function overrideToMapping(override) {
        if (!override?.event_uid || !override?.plan_id) return null;
        const subject = normalizeText(override.subject);
        return {
            subject_in_managebac: normalizeText(override.subject_in_managebac),
            plan_id: override.plan_id,
            subject,
            sync_enabled: true,
            source: 'managebac_event_subject_override'
        };
    }

    function mappingClassId(mapping) {
        return normalizeText(mapping.managebac_class_id || extractClassId(mapping.managebac_class_href));
    }

    function eventClassId(event) {
        return normalizeText(event.managebac_class_id || extractClassId(event.managebac_class_href || event.url || event.description));
    }

    function meaningfulTokens(value) {
        const stop = new Set(['and', 'the', 'for', 'with', 'class', 'room', 'phase', 'level', 'standard', 'higher']);
        return normalizeKey(value)
            .split(/\s+/)
            .filter(token => token.length > 2 && !stop.has(token));
    }

    function mappingAliasKeys(mapping) {
        const subject = normalizeKey(mapping.subject_in_managebac);
        const aliases = new Set();
        if (/\benglish\b/.test(subject) && /\blanguage\b/.test(subject) && /\bacquisition\b/.test(subject)) {
            aliases.add('engla');
            aliases.add('english la');
            aliases.add('english');
        }
        if (/\bscience|sciences|biology|chemistry|physics\b/.test(subject)) {
            aliases.add('sci');
            aliases.add('science');
            aliases.add('biology');
            aliases.add('chemistry');
            aliases.add('physics');
        }
        if (/\bmathematics|math\b/.test(subject)) {
            aliases.add('math');
            aliases.add('mathematics');
        }
        if (/\bmusic\b/.test(subject)) aliases.add('music');
        if (/\bdesign\b/.test(subject)) {
            aliases.add('des');
            aliases.add('design');
        }
        if (/\bphysical\b/.test(subject) && /\bhealth\b/.test(subject)) {
            aliases.add('phe');
        }
        if (/\bchinese\b/.test(subject) && /\blanguage\b/.test(subject)) {
            aliases.add('chinese ll');
            aliases.add('chinese language');
        }
        if (/\bchinese\b/.test(subject) && /\bcivilization\b/.test(subject)) {
            aliases.add('chinese civilization');
        }
        if (/\bindividuals\b/.test(subject) && /\bsocieties\b/.test(subject)) {
            aliases.add('world civ');
            aliases.add('world civilizations');
            aliases.add('societies');
        }
        return Array.from(aliases);
    }

    function candidateMappingScore(event, mapping) {
        return Math.max(aliasCandidateScore(event, mapping), tokenOverlapScore(event, mapping));
    }

    function aliasCandidateScore(event, mapping) {
        const eventKey = normalizeKey([
            event.summary,
            event.description,
            event.location,
            event.full_event_text
        ].filter(Boolean).join(' '));
        for (const alias of mappingAliasKeys(mapping)) {
            const aliasKey = normalizeKey(alias);
            if (aliasKey && eventKey.includes(aliasKey)) return 0.95;
        }
        return 0;
    }

    function tokenOverlapScore(event, mapping) {
        const mappingTokens = meaningfulTokens(mapping.subject_in_managebac);
        if (mappingTokens.length < 2) return 0;
        const eventKey = normalizeKey([
            event.summary,
            event.description,
            event.location,
            event.full_event_text
        ].filter(Boolean).join(' '));
        const eventTokens = new Set(meaningfulTokens(eventKey));
        let overlap = 0;
        const uniqueMappingTokens = new Set(mappingTokens);
        for (const token of uniqueMappingTokens) {
            if (eventTokens.has(token)) overlap++;
        }
        const coverage = overlap / Math.max(uniqueMappingTokens.size, 1);
        return overlap >= 2 ? Number(coverage.toFixed(3)) : 0;
    }

    function stableDiagnosticHash(value) {
        const text = String(value || '');
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function tokenCount(value) {
        return meaningfulTokens(value).length;
    }

    function classifyUnmatchedEvent(event, active) {
        if (!active.length) return 'no_active_mappings';
        const classId = eventClassId(event);
        const activeClassIds = new Set(active.map(mappingClassId).filter(Boolean));
        if (classId && !activeClassIds.has(classId)) return 'class_id_not_mapped';
        if (!classId && activeClassIds.size > 0) return 'event_has_no_class_id';
        return 'no_active_mapping_match';
    }

    function buildCandidateDiagnostics(event, active) {
        const fullEventText = normalizeKey(event.full_event_text);
        let containsAnyFullSubject = false;
        let topCandidateScore = 0;
        let failedStage = 'no_candidate';
        for (const mapping of active) {
            const subjectKey = normalizeKey(mapping.subject_in_managebac);
            const exactFullEventMatch = !!subjectKey && fullEventText.includes(subjectKey);
            if (exactFullEventMatch) containsAnyFullSubject = true;
            const score = candidateMappingScore(event, mapping);
            if (score > topCandidateScore) topCandidateScore = score;
        }
        if (!active.length) {
            failedStage = 'active_mapping_lookup';
        } else if (eventClassId(event)) {
            failedStage = 'class_id_lookup';
        } else if (!containsAnyFullSubject) {
            failedStage = 'full_subject_lookup';
        } else if (topCandidateScore < 0.6) {
            failedStage = 'token_confidence';
        }
        return {
            full_event_text_contains_any_mapping_subject: containsAnyFullSubject,
            top_candidate_mapping_score: topCandidateScore,
            matching_stage_failed: failedStage
        };
    }

    function buildEventSubjectSuggestions(event, mappings, limit = 3) {
        return (mappings || [])
            .filter(mapping => mapping && mapping.plan_id && normalizeText(mapping.subject_in_managebac))
            .map(mapping => ({
                subject_in_managebac: mapping.subject_in_managebac,
                subject: mapping.subject || mapping.subject_in_managebac,
                plan_id: mapping.plan_id,
                score: candidateMappingScore(event, mapping)
            }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score || String(a.subject).localeCompare(String(b.subject)))
            .slice(0, limit);
    }

    function buildPendingEventMapping(event, mappings) {
        const suggestions = buildEventSubjectSuggestions(event, mappings);
        return {
            event_uid: event.uid,
            event_ref: stableDiagnosticHash(event.uid || event.full_event_text || event.summary),
            due_date: event.due_date,
            summary: event.summary,
            description: event.description || '',
            suggested_plan_id: suggestions[0]?.plan_id || '',
            suggested_subject: suggestions[0]?.subject || '',
            suggested_subject_in_managebac: suggestions[0]?.subject_in_managebac || '',
            suggestion_score: suggestions[0]?.score || 0,
            suggestions
        };
    }

    function sanitizePendingEventMappings(rows, savedAt = new Date().toISOString()) {
        return (Array.isArray(rows) ? rows : [])
            .filter(row => normalizeText(row?.event_uid))
            .map(row => ({
                event_uid: normalizeText(row.event_uid),
                due_date: normalizeText(row.due_date),
                summary: normalizeText(row.summary),
                description: normalizeText(row.description),
                suggested_plan_id: row.suggested_plan_id || '',
                suggested_subject: normalizeText(row.suggested_subject),
                suggested_subject_in_managebac: normalizeText(row.suggested_subject_in_managebac),
                saved_at: normalizeText(row.saved_at) || savedAt
            }));
    }

    async function getPendingEventMappings(db) {
        return sanitizePendingEventMappings(await db.getSetting(SETTINGS_PENDING_EVENTS_KEY));
    }

    async function savePendingEventMappings(db, rows) {
        const safeRows = sanitizePendingEventMappings(rows);
        await db.setSetting(SETTINGS_PENDING_EVENTS_KEY, safeRows);
        return safeRows;
    }

    async function clearPendingEventMappings(db) {
        await db.setSetting(SETTINGS_PENDING_EVENTS_KEY, []);
        return [];
    }

    function isManageBacSyncFresh(config, referenceDate = new Date(), staleHours = 6) {
        if (!config?.last_synced_at) return false;
        const last = new Date(config.last_synced_at).getTime();
        const ref = new Date(referenceDate).getTime();
        if (!Number.isFinite(last) || !Number.isFinite(ref)) return false;
        return ref - last < staleHours * 60 * 60 * 1000;
    }

    function buildSafeUnmatchedEventDiagnostic(event, reason, active) {
        const eventRefSource = event.uid || event.url || event.full_event_text || event.summary || '';
        return {
            event_ref: stableDiagnosticHash(eventRefSource),
            reason,
            ...buildCandidateDiagnostics(event, active),
            has_class_id: !!eventClassId(event),
            has_url: !!normalizeText(event.url),
            has_description: !!normalizeText(event.description),
            has_location: !!normalizeText(event.location),
            has_full_event_text: !!normalizeText(event.full_event_text),
            summary_token_count: tokenCount(event.summary),
            description_token_count: tokenCount(event.description),
            full_event_token_count: tokenCount(event.full_event_text)
        };
    }

    function stripSubjectPrefix(title, subjectInManageBac) {
        const subject = normalizeText(subjectInManageBac);
        const text = normalizeText(title);
        if (!subject || !text) return text;
        const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return normalizeText(text.replace(new RegExp(`^${escaped}\\s*[:\\-–—]?\\s*`, 'i'), '')) || text;
    }

    function formatDateISO(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function getDefaultSourceStartDate(dueDate, now) {
        if (!dueDate) return null;
        const todayStr = String(now || new Date().toISOString()).slice(0, 10);
        if (dueDate < todayStr) return dueDate;
        const early = new Date(`${dueDate}T00:00:00`);
        early.setDate(early.getDate() - 14);
        const earlyStr = formatDateISO(early);
        const candidate = todayStr > earlyStr ? todayStr : earlyStr;
        return candidate > dueDate ? dueDate : candidate;
    }

    function eventToTask(event, mapping, now) {
        const title = stripSubjectPrefix(event.summary, mapping.subject_in_managebac);
        const initialStartDate = event.start_date || getDefaultSourceStartDate(event.due_date, now);
        return {
            title,
            plan_id: mapping.plan_id,
            bucket_id: null,
            progress: event.status === 'completed' ? 'completed' : 'not_started',
            completed_at: null,
            priority: 'medium',
            start_date: initialStartDate,
            due_date: event.due_date,
            labels: [],
            notes: [event.description, event.location ? `Location: ${event.location}` : ''].filter(Boolean).join('\n'),
            checklist: [],
            schedule_time: null,
            duration: 45,
            subject: mapping.subject || null,
            deferred_until: null,
            source: SOURCE,
            source_type: SOURCE_TYPE_ICS,
            source_uid: event.uid,
            source_updated_at: event.updated_at || null,
            source_url: event.url || null,
            managebac_subject: mapping.subject_in_managebac,
            readonly: true,
            synced_at: now
        };
    }

    function preserveLocalExecutionState(task, existingTask) {
        if (!existingTask) return task;
        return {
            ...task,
            start_date: Object.prototype.hasOwnProperty.call(existingTask, 'start_date')
                ? existingTask.start_date || null
                : task.start_date || null,
            priority: existingTask.priority || task.priority || 'medium',
            progress: existingTask.progress || task.progress || 'not_started',
            completed_at: Object.prototype.hasOwnProperty.call(existingTask, 'completed_at')
                ? existingTask.completed_at || null
                : task.completed_at || null
        };
    }

    function isManageBacTask(task) {
        return !!task && (task.source === SOURCE || task.source_type === SOURCE_TYPE_ICS || task.readonly === true && task.managebac_subject);
    }

    function filterManageBacTasks(tasks) {
        return (tasks || []).filter(isManageBacTask);
    }

    async function getAllTasks(db) {
        if (typeof db.getAllTasks === 'function') return await db.getAllTasks();
        if (db.db?.tasks?.toArray) return await db.db.tasks.toArray();
        return [];
    }

    async function addSourceTask(db, task) {
        if (typeof db.addTask === 'function') return await db.addTask(task, { allowManageBacSync: true });
        throw new Error('Task DB does not support addTask');
    }

    async function updateSourceTask(db, id, task) {
        if (typeof db.updateTask === 'function') return await db.updateTask(id, task, { allowManageBacSync: true });
        throw new Error('Task DB does not support updateTask');
    }

    async function deleteSourceTask(db, id) {
        if (typeof db.deleteTask === 'function') return await db.deleteTask(id, { allowManageBacSync: true });
        throw new Error('Task DB does not support deleteTask');
    }

    async function syncManageBacIcs(db, rawIcs, link, options = {}) {
        const normalizedLink = normalizeText(link);
        const previousConfig = await db.getSetting(SETTINGS_ICS_KEY);
        if (previousConfig?.link && normalizedLink && previousConfig.link !== normalizedLink) {
            let confirmed = options.confirmLinkChange === true;
            if (!confirmed && typeof options.confirmLinkChange === 'function') {
                confirmed = await options.confirmLinkChange(previousConfig.link, normalizedLink);
            }
            if (!confirmed) {
                return {
                    status: 'blocked',
                    reason: 'link_change_confirmation_required',
                    created: 0,
                    updated: 0,
                    deleted: 0,
                    skipped: 0
                };
            }
        }

        const parsed = parseManageBacIcs(rawIcs);
        if (parsed.parse_status !== 'ok') {
            return {
                status: 'failed',
                reason: parsed.unsupported_reason,
                created: 0,
                updated: 0,
                deleted: 0,
                skipped: 0
            };
        }

        const mappings = await buildPlanSuggestionMappings(db);
        const eventOverrides = normalizeEventOverrides(await db.getSetting(SETTINGS_EVENT_OVERRIDES_KEY));
        const overridesByUid = new Map(eventOverrides.map(override => [normalizeText(override.event_uid), override]));
        const active = activeMappings(mappings);
        const activeMappingCount = active.length;
        const now = new Date().toISOString();
        const desired = [];
        let skipped = 0;
        const skippedReasons = {};
        const unmatchedEventDiagnostics = [];
        const matchedBy = {};
        const existing = filterManageBacTasks(await getAllTasks(db));
        const existingByUid = new Map(existing.map(task => [normalizeText(task.source_uid), task]));
        const pending_event_mappings = [];
        for (const event of parsed.events) {
            const existingTask = existingByUid.get(normalizeText(event.uid));
            if (existingTask) {
                matchedBy.existing_task_uid = (matchedBy.existing_task_uid || 0) + 1;
                desired.push(preserveLocalExecutionState(eventToTask(event, {
                    plan_id: existingTask.plan_id,
                    subject: existingTask.subject || existingTask.managebac_subject,
                    subject_in_managebac: existingTask.managebac_subject || existingTask.subject || 'ManageBac'
                }, now), existingTask));
                continue;
            }

            const override = overridesByUid.get(normalizeText(event.uid));
            const overrideMapping = overrideToMapping(override);
            if (overrideMapping && options.applyPendingEventOverrides === true) {
                matchedBy.manual_event_override = (matchedBy.manual_event_override || 0) + 1;
                desired.push(eventToTask(event, overrideMapping, now));
                continue;
            }

            skipped++;
            const reason = overrideMapping ? 'pending_user_confirmation' : classifyUnmatchedEvent(event, active);
            skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
            unmatchedEventDiagnostics.push(buildSafeUnmatchedEventDiagnostic(event, reason, active));
            pending_event_mappings.push(buildPendingEventMapping(event, mappings));
        }

        const desiredUids = new Set(desired.map(task => normalizeText(task.source_uid)));
        let created = 0;
        let updated = 0;
        let deleted = 0;

        for (const task of desired) {
            const existingTask = existingByUid.get(normalizeText(task.source_uid));
            if (existingTask) {
                await updateSourceTask(db, existingTask.id, task);
                updated++;
            } else {
                await addSourceTask(db, task);
                created++;
            }
        }

        for (const task of existing) {
            if (task.source_uid && !desiredUids.has(normalizeText(task.source_uid))) {
                await deleteSourceTask(db, task.id);
                deleted++;
            }
        }

        await db.setSetting(SETTINGS_ICS_KEY, {
            link: normalizedLink,
            last_synced_at: now,
            last_event_count: parsed.events.length,
            last_task_count: desired.length,
            missing_event_strategy: 'delete_local_managebac_source_task'
        });
        await savePendingEventMappings(db, pending_event_mappings);

        const status = desired.length === 0 && parsed.events.length > 0
            ? 'no_matches'
            : skipped > 0
                ? 'partial'
                : 'ok';

        return {
            status,
            created,
            updated,
            deleted,
            skipped,
            events: parsed.events.length,
            tasks: desired.length,
            matched: desired.length,
            matched_by_full_event_text: matchedBy.full_event_text || 0,
            active_mappings: activeMappingCount,
            skipped_reasons: skippedReasons,
            unmatched_event_diagnostics: unmatchedEventDiagnostics,
            pending_event_mappings,
            diagnostics: {
                parsed_event_count: parsed.events.length,
                active_mapping_count: activeMappingCount,
                matched_count: desired.length,
                skipped_count: skipped,
                matched_by: matchedBy,
                matched_by_full_event_text: matchedBy.full_event_text || 0,
                skipped_reasons: skippedReasons,
                unmatched_event_diagnostics: unmatchedEventDiagnostics,
                pending_event_mapping_count: pending_event_mappings.length
            }
        };
    }

    async function saveEventSubjectOverrides(db, rows, plans) {
        const planRows = plans || (typeof db.getPlans === 'function' ? await db.getPlans() : []);
        const plansById = new Map(planRows.map(plan => [String(plan.id), plan]));
        const previous = normalizeEventOverrides(await db.getSetting(SETTINGS_EVENT_OVERRIDES_KEY));
        const byUid = new Map(previous.map(row => [normalizeText(row.event_uid), row]));
        const now = new Date().toISOString();
        for (const row of rows || []) {
            const eventUid = normalizeText(row.event_uid);
            const planId = normalizeText(row.plan_id);
            if (!eventUid) continue;
            if (!planId) {
                byUid.delete(eventUid);
                continue;
            }
            const plan = plansById.get(String(planId));
            if (!plan) continue;
            byUid.set(eventUid, {
                event_uid: eventUid,
                plan_id: plan.id,
                subject: normalizeText(plan.subject),
                subject_in_managebac: normalizeText(row.subject_in_managebac),
                source: 'managebac_event_subject_override',
                updated_at: now
            });
        }
        const saved = normalizeEventOverrides(Array.from(byUid.values()));
        await db.setSetting(SETTINGS_EVENT_OVERRIDES_KEY, saved);
        return saved;
    }

    function normalizeIcsLink(link) {
        const value = normalizeText(link);
        if (/^webcal:\/\//i.test(value)) return value.replace(/^webcal:\/\//i, 'https://');
        return value;
    }

    function assertSupportedIcsLink(link) {
        const url = normalizeIcsLink(link);
        if (!/^https:\/\//i.test(url)) {
            throw new Error('ManageBac ICS link must start with https:// or webcal://');
        }
        return url;
    }

    async function getManageBacIcsConfig(db) {
        return await db.getSetting(SETTINGS_ICS_KEY);
    }

    async function saveManageBacIcsLink(db, link, options = {}) {
        const normalizedLink = normalizeText(link);
        assertSupportedIcsLink(normalizedLink);
        const previousConfig = await db.getSetting(SETTINGS_ICS_KEY);
        if (previousConfig?.link && normalizeIcsLink(previousConfig.link) !== normalizeIcsLink(normalizedLink)) {
            let confirmed = options.confirmLinkChange === true;
            if (!confirmed && typeof options.confirmLinkChange === 'function') {
                confirmed = await options.confirmLinkChange(previousConfig.link, normalizedLink);
            }
            if (!confirmed) {
                return {
                    status: 'blocked',
                    reason: 'link_change_confirmation_required',
                    config: previousConfig
                };
            }
        }

        const config = {
            ...(previousConfig || {}),
            link: normalizedLink,
            updated_at: new Date().toISOString(),
            missing_event_strategy: previousConfig?.missing_event_strategy || 'delete_local_managebac_source_task'
        };
        await db.setSetting(SETTINGS_ICS_KEY, config);
        return { status: 'ok', config };
    }

    async function fetchIcsText(link) {
        const url = assertSupportedIcsLink(link);
        if (global.chrome?.runtime?.sendMessage) {
            const response = await global.chrome.runtime.sendMessage({
                type: 'TIMEWHERE_MANAGEBAC_FETCH_ICS',
                url
            });
            if (!response?.ok) {
                throw new Error(response?.error || 'ManageBac ICS fetch failed');
            }
            return response.text || '';
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

    const api = {
        SETTINGS_MAPPING_KEY,
        SETTINGS_ICS_KEY,
        SETTINGS_EVENT_OVERRIDES_KEY,
        SETTINGS_PENDING_EVENTS_KEY,
        MATRIXVIEW_MAPPING_KEY,
        SOURCE,
        SOURCE_TYPE_ICS,
        parseManageBacHtml,
        inspectManageBacHtmlStructure,
        parseManageBacIcs,
        splitIcsContentLine,
        buildMappingPreview,
        normalizeMappings,
        normalizeClassHref,
        extractClassId,
        autoMatchSubject,
        eventToTask,
        syncManageBacIcs,
        buildEventSubjectSuggestions,
        saveEventSubjectOverrides,
        isManageBacTask,
        filterManageBacTasks,
        fetchIcsText,
        normalizeIcsLink,
        getManageBacIcsConfig,
        saveManageBacIcsLink,
        getPendingEventMappings,
        savePendingEventMappings,
        clearPendingEventMappings,
        sanitizePendingEventMappings,
        isManageBacSyncFresh,
        getMappingPrecondition,
        saveMappings,
        escapeHTML,
        escapeAttribute
    };

    global.TimeWhereManageBac = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
