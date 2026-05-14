/**
 * TimeWhere MatrixView import helpers.
 * Local-first parser and subject plan initializer for PowerSchool MatrixView exports.
 */
(function(global) {
    const DEFAULT_BUCKETS = ['上课', '作业', '单元测试', '阶段考试'];
    const OTHER_SCHOOL_DEFAULT_BUCKETS = ['事项', '活动', '申请', '其他'];
    const OTHER_SCHOOL_PLAN_NAME = 'Other School Plan';
    const SETTINGS_IMPORT_KEY = 'matrixview_import';
    const SETTINGS_MAPPING_KEY = 'matrixview_subject_mappings';
    const UNSUPPORTED_EXPORT_TYPE = 'unsupported_export_type';
    const PDF_UNREADABLE_TEXT = 'pdf_text_unreadable';
    const PDF_UNRELIABLE_EXPORT_TYPE = 'pdf_unreliable_export_type';

    const SUBJECT_RULES = [
        ['Computer Science', /\b(computer science|comp sci|cs)\b/i],
        ['Math', /\b(math|mathematics|analysis and approaches|applications and interpretation|aa hl|aa sl|ai hl|ai sl)\b/i],
        ['English', /\b(english|language and literature|literature)\b/i],
        ['Chinese', /\b(chinese|mandarin|中文|语文)\b/i],
        ['Physics', /\bphysics\b/i],
        ['Chemistry', /\bchemistry\b/i],
        ['Biology', /\bbiology\b/i],
        ['History', /\bhistory\b/i],
        ['Economics', /\beconomics?\b/i],
        ['Psychology', /\bpsychology\b/i],
        ['Business', /\bbusiness\b/i],
        ['Visual Arts', /\b(visual arts?|art)\b/i],
        ['TOK', /\b(tok|theory of knowledge)\b/i],
        ['CAS', /\bcas\b/i],
        ['EE', /\b(extended essay|ee)\b/i]
    ];

    const SUBJECT_PLAN_NAMES = [
        ...SUBJECT_RULES.map(rule => rule[0]),
        'Geography',
        'Global Politics',
        'Design',
        'Music',
        'Theatre',
        'Spanish',
        'French'
    ];

    const NON_SUBJECT_PLAN_NAMES = new Set([
        '其它计划',
        '其他计划',
        '大学申请',
        'personal',
        'projects',
        'project',
        'college applications',
        'university applications'
    ]);

    function decodeQuotedPrintable(text) {
        return String(text || '')
            .replace(/=\r?\n/g, '')
            .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
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

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
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

    function splitDelimitedLine(line) {
        const out = [];
        let cell = '';
        let quote = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (quote && line[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else {
                    quote = !quote;
                }
            } else if ((ch === ',' || ch === '\t') && !quote) {
                out.push(normalizeText(cell));
                cell = '';
            } else {
                cell += ch;
            }
        }
        out.push(normalizeText(cell));
        return out;
    }

    function htmlRowsFromText(text) {
        const rows = [];
        const rowMatches = String(text || '').match(/<tr[\s\S]*?<\/tr>/gi) || [];
        for (const rowHtml of rowMatches) {
            const cells = [];
            const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
            let match;
            while ((match = cellRegex.exec(rowHtml))) {
                cells.push(stripTags(match[1]));
            }
            if (cells.some(Boolean)) rows.push(cells);
        }
        return rows;
    }

    function extractMhtmlHtmlPart(raw) {
        const text = String(raw || '');
        const htmlPartMatch = text.match(/Content-Type:\s*text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n------|$)/i);
        return htmlPartMatch ? decodeQuotedPrintable(htmlPartMatch[1]) : decodeQuotedPrintable(text);
    }

    function extractFirstClassParagraph(cellHtml, className) {
        const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`<p[^>]*class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/p>`, 'i');
        const match = String(cellHtml || '').match(regex);
        return match ? stripTags(match[1]) : '';
    }

    function htmlTableRows(tableHtml) {
        return String(tableHtml || '').match(/<tr[\s\S]*?<\/tr>/gi) || [];
    }

    function htmlRowCells(rowHtml) {
        const cells = [];
        const cellRegex = /<(t[dh])\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
        let match;
        while ((match = cellRegex.exec(rowHtml))) {
            cells.push({
                tag: match[1].toLowerCase(),
                attrs: match[2] || '',
                html: match[3] || '',
                text: stripTags(match[3] || '')
            });
        }
        return cells;
    }

    function htmlCellColspan(cell) {
        const match = String(cell?.attrs || '').match(/\bcolspan=["']?(\d+)/i);
        const value = match ? Number.parseInt(match[1], 10) : 1;
        return Number.isFinite(value) && value > 0 ? value : 1;
    }

    function expandedHeaderTexts(row) {
        const out = [];
        for (const cell of row) {
            const span = htmlCellColspan(cell);
            for (let i = 0; i < span; i++) {
                out.push(normalizeText(cell.text));
            }
        }
        return out;
    }

    function matrixPeriodHeadersFromRow(row) {
        const headerTexts = expandedHeaderTexts(row);
        const periodHeaders = headerTexts.slice(4).filter(Boolean);
        return periodHeaders.length === 6 && periodHeaders.join('|') === '1|2|3|4|CT|DRM'
            ? periodHeaders
            : null;
    }

    function matrixViewTableCandidates(html) {
        if (typeof DOMParser !== 'undefined') {
            try {
                const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
                return Array.from(doc.querySelectorAll('table')).map(table => table.outerHTML);
            } catch (_) {
                // Fall through to the regex fallback used by Node tests.
            }
        }
        return String(html || '').match(/<table\b[\s\S]*?<\/table>/gi) || [];
    }

    function findMatrixViewTableHtml(html) {
        const tableMatches = matrixViewTableCandidates(html);
        const preferred = tableMatches.find(table => /<table\b[^>]*id=["']schedMatrixTable["']/i.test(table));
        const candidates = preferred ? [preferred, ...tableMatches.filter(table => table !== preferred)] : tableMatches;

        for (const tableHtml of candidates) {
            const inner = tableHtml.replace(/^<table\b[^>]*>/i, '').replace(/<\/table>$/i, '');
            const rows = htmlTableRows(inner).map(htmlRowCells).filter(row => row.length);
            if (rows.length < 2) continue;
            if (!matrixPeriodHeadersFromRow(rows[0])) continue;
            if (!rows.slice(1).some(row => /^[A-H]$/.test(normalizeText(row[0]?.text)))) continue;
            return inner;
        }
        return null;
    }

    function parseMatrixViewHtmlTable(rawHtml) {
        const html = extractMhtmlHtmlPart(rawHtml);
        const tableHtml = findMatrixViewTableHtml(html);
        if (!tableHtml) return null;

        const rows = htmlTableRows(tableHtml).map(htmlRowCells).filter(row => row.length);
        if (rows.length < 2) return matrixParseFailure('missing_matrix_rows');

        const periodHeaders = matrixPeriodHeadersFromRow(rows[0]);
        if (!periodHeaders) {
            return matrixParseFailure('unexpected_matrix_header');
        }

        const records = [];
        const dayRows = rows.slice(1);
        for (const row of dayRows) {
            const day = normalizeText(row[0]?.text);
            if (!/^[A-H]$/.test(day)) continue;
            const terms = row.slice(1, 4).map(cell => normalizeText(cell.text)).filter(Boolean).join(' ');
            const periodCells = row.slice(4, 10);
            for (let i = 0; i < periodHeaders.length; i++) {
                const period = periodHeaders[i];
                const cell = periodCells[i];
                if (!cell) continue;
                const subject = extractFirstClassParagraph(cell.html, 'sched-course-name');
                const teacher = extractFirstClassParagraph(cell.html, 'sched-teacher');
                const roomRaw = extractFirstClassParagraph(cell.html, 'sched-room');
                const room = roomRaw.replace(/^Room:\s*/i, '').trim();
                const cellText = stripTags(cell.html);
                if (!normalizeText(cellText)) continue;
                records.push({
                    day,
                    period,
                    terms,
                    subject_in_matrixview: subject,
                    teacher,
                    room
                });
            }
        }

        const parsed = sanitizeMatrixViewData({ records });
        const validation = validateMatrixViewGrid(parsed);
        if (!validation.ok) return matrixParseFailure(validation.reason);
        return parsed;
    }

    function matrixParseFailure(reason) {
        return {
            ...sanitizeMatrixViewData({ records: [] }),
            parse_status: 'failed_quality',
            export_type: 'matrixview_schedule',
            unsupported_reason: reason
        };
    }

    function validateMatrixViewGrid(parsed) {
        const records = Array.isArray(parsed?.records) ? parsed.records : [];
        const days = new Set(records.map(record => record.day));
        const periods = new Set(records.map(record => record.period));
        const incomplete = records.some(record => {
            return !normalizeText(record.subject_in_matrixview) || !normalizeText(record.teacher) || !normalizeText(record.room);
        });
        if (records.length !== 48) return { ok: false, reason: 'matrix_grid_record_count_invalid' };
        if (days.size !== 8) return { ok: false, reason: 'matrix_grid_day_count_invalid' };
        if (periods.size !== 6) return { ok: false, reason: 'matrix_grid_period_count_invalid' };
        if (incomplete) return { ok: false, reason: 'matrix_grid_incomplete_course_fields' };
        return { ok: true, reason: null };
    }

    function delimitedRowsFromText(text) {
        return String(text || '')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !/^[-=_]{3,}$/.test(line))
            .map(splitDelimitedLine)
            .filter(cells => cells.length >= 4);
    }

    function cleanExtractedText(text) {
        return String(text || '')
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
            .replace(/\u00A0/g, ' ')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n');
    }

    function headerIndex(headers, aliases) {
        const normalized = headers.map(header => normalizeText(header).toLowerCase());
        for (const alias of aliases) {
            const idx = normalized.findIndex(header => header === alias || header.includes(alias));
            if (idx >= 0) return idx;
        }
        return -1;
    }

    function rowsToRecords(rows) {
        if (!rows.length) return [];
        const records = [];
        for (let headerRow = 0; headerRow < Math.min(rows.length, 6); headerRow++) {
            const headers = rows[headerRow];
            const dayIdx = headerIndex(headers, ['a-h day', 'ah day', 'day', 'cycle day']);
            const periodIdx = headerIndex(headers, ['period', 'block']);
            const subjectIdx = headerIndex(headers, ['subject in matrixview', 'course name', 'course', 'class', 'subject']);
            if (dayIdx < 0 || periodIdx < 0 || subjectIdx < 0) continue;

            const teacherIdx = headerIndex(headers, ['teacher', 'instructor']);
            const roomIdx = headerIndex(headers, ['room', 'location']);
            const termsIdx = headerIndex(headers, ['terms', 'term', 'semester', 'quarter']);
            for (const row of rows.slice(headerRow + 1)) {
                const subject = normalizeText(row[subjectIdx]);
                const day = normalizeText(row[dayIdx]).replace(/\s*day$/i, '');
                const period = normalizeText(row[periodIdx]);
                if (!subject || !day || !period) continue;
                records.push({
                    day,
                    period,
                    terms: termsIdx >= 0 ? normalizeText(row[termsIdx]) : '',
                    subject_in_matrixview: subject,
                    teacher: teacherIdx >= 0 ? normalizeText(row[teacherIdx]) : '',
                    room: roomIdx >= 0 ? normalizeText(row[roomIdx]) : ''
                });
            }
            return records;
        }
        return records;
    }

    function buildRecordsFromOccurrenceLines(rawText) {
        const text = cleanExtractedText(rawText);
        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const pairedTokenRegex = /\(([A-H])\)\s*D\s*([1-4]|CT)\b/g;
        const periodDayRegex = /\b([1-4]|CT|DRM)\s*\(([A-H])\)/g;
        const fallbackTokenRegex = /\b([A-H])\s*([1-4]|CT)\b/g;
        const teacherRegex = /\b([A-Za-z][A-Za-z' -]+,\s*[A-Za-z][A-Za-z' -]+)\b/;
        const termRegex = /\b\d{2}-\d{2}\b(?:\s*(?:S\d|Q\d|Semester|Quarter)\b)?/i;
        const roomRegex = /\b(?:Room\s*)?(?:[A-Z]?\d{3,4}[A-Za-z]?|[A-Z]?GYM\d?)\b/i;
        const records = [];

        for (const line of lines) {
            const occurrences = [];
            for (const match of line.matchAll(pairedTokenRegex)) {
                occurrences.push({ day: match[1], period: match[2] });
            }

            if (!occurrences.length) {
                for (const match of line.matchAll(periodDayRegex)) {
                    occurrences.push({ day: match[2], period: match[1] });
                }
            }

            if (!occurrences.length) {
                for (const match of line.matchAll(fallbackTokenRegex)) {
                    occurrences.push({ day: match[1], period: match[2] });
                }
            }

            if (!occurrences.length) continue;

            const teacherMatch = line.match(teacherRegex);
            const termMatch = line.match(termRegex);
            const roomMatch = line.match(roomRegex);

            let subject = line;
            subject = subject.replace(pairedTokenRegex, ' ');
            subject = subject.replace(periodDayRegex, ' ');
            subject = subject.replace(fallbackTokenRegex, ' ');
            subject = subject.replace(teacherRegex, ' ');
            if (termMatch) subject = subject.replace(termMatch[0], ' ');
            if (roomMatch) subject = subject.replace(roomMatch[0], ' ');
            subject = subject.replace(/[,:;()\[\]\t]/g, ' ').replace(/\s+/g, ' ').trim();
            subject = extractCourseTextFromNoisyLine(subject);
            if (!subject || subject.length < 2) continue;

            for (const occurrence of occurrences) {
                records.push({
                    day: occurrence.day,
                    period: occurrence.period,
                    terms: termMatch ? normalizeText(termMatch[0]) : '',
                    subject_in_matrixview: normalizeText(subject),
                    teacher: teacherMatch ? normalizeText(teacherMatch[1]) : '',
                    room: roomMatch ? normalizeText(roomMatch[0]) : ''
                });
            }
        }

        return records;
    }

    function buildRecordsFromPdfCourseBlocks(rawText) {
        const text = cleanExtractedText(rawText);
        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const periodDayRegex = /\b([1-4]|CT|DRM)\s*\(([A-H])\)/g;
        const teacherRegex = /\b([A-Za-z][A-Za-z' -]+,\s*[A-Za-z][A-Za-z' ()-]+)\b/;
        const roomRegex = /^Room:\s*(.+)$/i;
        const courseCodeRegex = /^[A-Z0-9]{2,}[A-Z]?\d{3,}(?:\.\d+)?$/i;
        const records = [];

        for (let i = 0; i < lines.length; i++) {
            const occurrenceLine = lines[i];
            const occurrences = [];
            for (const match of occurrenceLine.matchAll(periodDayRegex)) {
                occurrences.push({ period: match[1], day: match[2] });
            }
            if (!occurrences.length) continue;

            const windowStart = Math.max(0, i - 8);
            const context = lines.slice(windowStart, i);
            const roomLine = [...context].reverse().find(line => roomRegex.test(line));
            const teacherLine = [...context].reverse().find(line => teacherRegex.test(line));
            const codeIndex = context.findLastIndex ? context.findLastIndex(line => courseCodeRegex.test(line)) : (() => {
                for (let idx = context.length - 1; idx >= 0; idx--) {
                    if (courseCodeRegex.test(context[idx])) return idx;
                }
                return -1;
            })();
            const subjectLine = codeIndex > 0 ? context[codeIndex - 1] : context.find(line => {
                return !roomRegex.test(line) && !teacherRegex.test(line) && !courseCodeRegex.test(line) && /[A-Za-z\u4E00-\u9FFF]/.test(line);
            });
            if (!subjectLine || !teacherLine || !roomLine) continue;

            const termsMatch = occurrenceLine.match(/\b(\d{2})\s+(\d{2})\b/);
            const terms = termsMatch ? `${termsMatch[1]}-${termsMatch[2]}` : '';
            const room = roomLine.match(roomRegex)?.[1] || '';
            const teacher = teacherLine.match(teacherRegex)?.[1] || teacherLine;
            const subject = extractCourseTextFromNoisyLine(subjectLine);

            for (const occurrence of occurrences) {
                records.push({
                    day: occurrence.day,
                    period: occurrence.period,
                    terms,
                    subject_in_matrixview: subject,
                    teacher,
                    room
                });
            }
        }

        return records;
    }

    function extractCourseTextFromNoisyLine(subjectText) {
        let subject = normalizeText(subjectText)
            .replace(/\bRoom\b/gi, ' ')
            .replace(/\b[A-H]\s*D\b/g, ' ')
            .replace(/\b(?:S\d|Q\d)\b/gi, ' ')
            .replace(/LKnguKge/g, 'Language')
            .replace(/\bhKse\b/g, 'Phase')
            .replace(/\bStKndKrd\b/g, 'Standard')
            .replace(/\bCivili[zK]tion\b/g, 'Civilization')
            .replace(/\bLiterKture\b/g, 'Literature')
            .replace(/LanguageAcquisition/g, 'Language Acquisition')
            .replace(/\bAcquisition\b/g, ' Acquisition')
            .replace(/\bPhase\b/g, ' Phase')
            .replace(/\bPhase\s+(\d)(?=[A-Z0-9]{2,}\d{3})/g, 'Phase $1 ')
            .replace(/\b([A-Z0-9]{2,}\d{3,}(?:\.\d+)?)\b/g, ' $1 ')
            .replace(/\s+/g, ' ')
            .trim();

        subject = subject.split(/\s+[A-Z0-9]{2,}\d{3,}(?:\.\d+)?\s+/)[0].trim() || subject;

        const subjectKeyword = /(computer science|comp sci|mathematics|math|analysis and approaches|applications and interpretation|english|language and literature|literature|chinese|mandarin|physics|chemistry|biology|history|economics|psychology|business|visual arts?|theory of knowledge|tok|extended essay|sciences)/i;
        const match = subject.match(subjectKeyword);
        if (match && match.index > 0) {
            subject = subject.slice(match.index).trim();
        }
        return subject;
    }

    function cleanPdfLayoutText(text) {
        return normalizeText(text)
            .replace(/\t/g, ' ')
            .replace(/\u000F/g, ' ')
            .replace(/\]hKse/g, 'Phase')
            .replace(/LKnguKge/g, 'Language')
            .replace(/LiterKture/g, 'Literature')
            .replace(/CiviliKtion/g, 'Civilization')
            .replace(/,D/g, ', ')
            .replace(/D\(/g, ' (')
            .replace(/\bD\b/g, ' ')
            .replace(/\b([A-Z])\s+([a-z]{2,})/g, '$1$2')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function buildRecordsFromPdfLayoutItems(items) {
        const occurrenceTextRegex = /^(?:[1-4]|CT|DRM)\([A-H]\)$/;
        const periodDayRegex = /\b([1-4]|CT|DRM)\(([A-H])\)/g;
        const codeRegex = /[A-Z0-9]{2,}\d{3,}(?:\s*\.\s*\d+)?/i;
        const records = [];

        const occurrenceLines = items
            .filter(item => occurrenceTextRegex.test(normalizeText(item.text)))
            .map(item => ({ x: item.x, y: item.y }))
            .sort((a, b) => a.y - b.y || a.x - b.x);

        const seenBlocks = new Set();
        for (const occurrenceLine of occurrenceLines) {
            const blockXMin = occurrenceLine.x - 20;
            const blockXMax = occurrenceLine.x + 145;
            const blockYMin = occurrenceLine.y - 85;
            const blockYMax = occurrenceLine.y + 18;
            const blockKey = `${Math.round(occurrenceLine.x / 10) * 10}|${Math.round(occurrenceLine.y / 10) * 10}`;
            if (seenBlocks.has(blockKey)) continue;
            seenBlocks.add(blockKey);

            const blockItems = items
                .filter(item => item.x >= blockXMin && item.x <= blockXMax && item.y >= blockYMin && item.y <= blockYMax)
                .sort((a, b) => a.y - b.y || a.x - b.x);

            const lineMap = new Map();
            for (const item of blockItems) {
                const key = Math.round(item.y);
                if (!lineMap.has(key)) lineMap.set(key, []);
                lineMap.get(key).push(item);
            }
            const lines = Array.from(lineMap.entries())
                .sort((a, b) => a[0] - b[0])
                .map(([y, lineItems]) => ({
                    y,
                    rawText: lineItems.sort((a, b) => a.x - b.x).map(item => item.text).join(' '),
                    text: cleanPdfLayoutText(lineItems.sort((a, b) => a.x - b.x).map(item => item.text).join(' '))
                }))
                .filter(line => line.text);

            const occurrenceLineText = lines.map(line => line.rawText).join(' ');
            const occurrences = Array.from(occurrenceLineText.matchAll(periodDayRegex)).map(match => ({
                period: match[1],
                day: match[2]
            }));
            if (!occurrences.length) continue;

            const roomLine = lines.find(line => /^Room\b/i.test(line.text));
            const roomMatch = roomLine?.text.match(/\b(?:[A-Z]?\d{3,4}[A-Za-z]?|[A-Z]?GYM\d?)\b/i);
            const codeLineIndex = lines.findIndex(line => codeRegex.test(line.text));
            const roomLineIndex = roomLine ? lines.indexOf(roomLine) : -1;
            if (codeLineIndex <= 0 || roomLineIndex <= codeLineIndex) continue;

            const subject = extractCourseTextFromNoisyLine(lines.slice(0, codeLineIndex).map(line => line.text).join(' '));
            const teacher = cleanPdfLayoutText(lines.slice(codeLineIndex + 1, roomLineIndex).map(line => line.text).join(' '));
            const room = roomMatch ? roomMatch[0] : '';
            if (!subject || !teacher || !room) continue;

            const termsMatch = occurrenceLineText.match(/\b(\d{2})\s*-\s*(\d{2})\b|\b(\d{2})\s+(\d{2})\b/);
            const terms = termsMatch ? `${termsMatch[1] || termsMatch[3]}-${termsMatch[2] || termsMatch[4]}` : '';
            for (const occurrence of occurrences) {
                records.push({
                    day: occurrence.day,
                    period: occurrence.period,
                    terms,
                    subject_in_matrixview: subject,
                    teacher,
                    room
                });
            }
        }

        return records;
    }

    function extractSubjectName(subjectInMatrixView) {
        const raw = normalizeText(subjectInMatrixView);
        if (!raw) return 'Other';
        for (const [subject, pattern] of SUBJECT_RULES) {
            if (pattern.test(raw)) return subject;
        }
        const prefix = raw.split(/\s[-–—:|]\s|:/)[0].replace(/\b(HL|SL|IB|DP|AP)\b/gi, '').trim();
        if (prefix && prefix.length <= 28 && /^[A-Za-z][A-Za-z &/]+$/.test(prefix)) {
            return prefix;
        }
        return 'Other';
    }

    function isSchoolNonSubjectCourse(subjectInMatrixView) {
        const raw = normalizeText(subjectInMatrixView).toLowerCase();
        return /\b(community time|dorm check|advisory|homeroom|assembly|school meeting|mentor time|study hall)\b/i.test(raw);
    }

    function defaultSubjectForMatrixView(subjectInMatrixView) {
        const raw = normalizeText(subjectInMatrixView);
        if (!raw) return '';
        return isSchoolNonSubjectCourse(raw) ? OTHER_SCHOOL_PLAN_NAME : raw;
    }

    function sanitizeRecord(record) {
        const subjectInMatrixView = normalizeText(record.subject_in_matrixview).slice(0, 160);
        return {
            day: normalizeText(record.day).slice(0, 24),
            period: normalizeText(record.period).slice(0, 24),
            terms: normalizeText(record.terms).slice(0, 80),
            subject: defaultSubjectForMatrixView(subjectInMatrixView).slice(0, 160),
            subject_in_matrixview: subjectInMatrixView,
            teacher: normalizeText(record.teacher).slice(0, 100),
            room: normalizeText(record.room).slice(0, 60)
        };
    }

    function buildCourses(records) {
        const map = new Map();
        for (const record of records) {
            const key = [record.subject_in_matrixview, record.teacher, record.room].join('|');
            if (!map.has(key)) {
                map.set(key, {
                    subject: record.subject,
                    subject_in_matrixview: record.subject_in_matrixview,
                    teacher: record.teacher,
                    room: record.room,
                    meetings: []
                });
            }
            map.get(key).meetings.push({
                day: record.day,
                period: record.period,
                terms: record.terms
            });
        }
        return Array.from(map.values()).sort((a, b) => a.subject.localeCompare(b.subject) || a.subject_in_matrixview.localeCompare(b.subject_in_matrixview));
    }

    function buildByDay(records) {
        const map = new Map();
        for (const record of records) {
            if (!map.has(record.day)) {
                map.set(record.day, { day: record.day, periods: [] });
            }
            map.get(record.day).periods.push({
                period: record.period,
                terms: record.terms,
                subject: record.subject,
                subject_in_matrixview: record.subject_in_matrixview,
                teacher: record.teacher,
                room: record.room
            });
        }
        return Array.from(map.values())
            .sort((a, b) => a.day.localeCompare(b.day))
            .map(day => ({
                ...day,
                periods: day.periods.sort((a, b) => String(a.period).localeCompare(String(b.period), undefined, { numeric: true }))
            }));
    }

    function sanitizeMatrixViewData(data) {
        const recordMap = new Map();
        for (const record of (data.records || [])
            .map(sanitizeRecord)
            .filter(record => record.day && record.period && record.subject_in_matrixview)) {
            const key = [
                record.day,
                record.period,
                record.subject_in_matrixview,
                record.teacher,
                record.room
            ].join('|');
            const existing = recordMap.get(key);
            if (!existing || (!existing.terms && record.terms)) {
                recordMap.set(key, record);
            }
        }
        const records = Array.from(recordMap.values());
        return {
            source: 'matrixview',
            imported_at: data.imported_at || null,
            records,
            courses: buildCourses(records),
            by_day: buildByDay(records)
        };
    }

    function isReadableCourseText(value) {
        const text = normalizeText(value);
        if (!text || text.length < 3) return false;
        const letters = (text.match(/[A-Za-z\u4E00-\u9FFF]/g) || []).length;
        const symbols = (text.match(/[^A-Za-z0-9\u4E00-\u9FFF\s]/g) || []).length;
        const chunks = text.split(/\s+/).filter(Boolean);
        const alphaChunks = chunks.filter(chunk => /[A-Za-z\u4E00-\u9FFF]/.test(chunk));
        const letterRatio = letters / Math.max(text.length, 1);
        const symbolRatio = symbols / Math.max(text.length, 1);
        return letterRatio >= 0.38 && symbolRatio <= 0.28 && alphaChunks.length >= 2;
    }

    function hasReadablePdfQuality(parsed) {
        const courses = Array.isArray(parsed?.courses) ? parsed.courses : [];
        if (!courses.length) return false;
        const readableCount = courses.filter(course => isReadableCourseText(course.subject_in_matrixview)).length;
        const readableRatio = readableCount / courses.length;
        const records = Array.isArray(parsed?.records) ? parsed.records : [];
        const distinctDays = new Set(records.map(record => record.day)).size;

        return readableRatio >= 0.6 && readableCount >= 2 && distinctDays >= 2;
    }

    function hasCompleteCourseFields(parsed) {
        const courses = Array.isArray(parsed?.courses) ? parsed.courses : [];
        return courses.length > 0 && courses.every(course => {
            return normalizeText(course.subject_in_matrixview) && normalizeText(course.teacher) && normalizeText(course.room);
        });
    }

    function parseMatrixViewExtractedText(rawText) {
        const matrixTableParsed = parseMatrixViewHtmlTable(rawText);
        if (matrixTableParsed) return matrixTableParsed;

        const tableRecords = rowsToRecords(htmlRowsFromText(rawText));
        if (tableRecords.length) return sanitizeMatrixViewData({ records: tableRecords });

        const delimitedRecords = rowsToRecords(delimitedRowsFromText(rawText));
        if (delimitedRecords.length) return sanitizeMatrixViewData({ records: delimitedRecords });

        const pdfBlockRecords = buildRecordsFromPdfCourseBlocks(rawText);
        if (pdfBlockRecords.length) return sanitizeMatrixViewData({ records: pdfBlockRecords });

        const occurrenceRecords = buildRecordsFromOccurrenceLines(rawText);
        if (occurrenceRecords.length) return sanitizeMatrixViewData({ records: occurrenceRecords });

        return sanitizeMatrixViewData({ records: [] });
    }

    function parseMatrixViewMime(raw) {
        const decoded = decodeQuotedPrintable(raw);
        const parsed = parseMatrixViewExtractedText(decoded);
        if (parsed.parse_status === 'failed_quality') {
            return parsed;
        }
        const classification = classifyExportType(raw, decoded, parsed.records.length > 0);
        return {
            ...parsed,
            parse_status: classification.parse_status,
            export_type: classification.export_type,
            unsupported_reason: classification.unsupported_reason
        };
    }

    function bytesToBinaryString(bytes) {
        let out = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            out += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunk)));
        }
        return out;
    }

    function parsePdfObjects(binaryText) {
        const objects = [];
        const regex = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
        let match;
        while ((match = regex.exec(binaryText))) {
            objects.push({ id: match[1], gen: match[2], body: match[3] });
        }
        return objects;
    }

    async function decompressWithStream(bytes, format) {
        const ds = new DecompressionStream(format);
        const buffer = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
        return new Uint8Array(buffer);
    }

    async function withTimeout(promise, timeoutMs) {
        let timer;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('pdf_decompress_timeout')), timeoutMs);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            clearTimeout(timer);
        }
    }

    async function inflateFlate(bytes) {
        const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);
        if (isNode && typeof require === 'function') {
            try {
                const zlib = require('zlib');
                return zlib.inflateSync(Buffer.from(bytes));
            } catch (_) {
                try {
                    const zlib = require('zlib');
                    return zlib.inflateRawSync(Buffer.from(bytes));
                } catch (error) {
                    throw error;
                }
            }
        }

        if (typeof DecompressionStream !== 'undefined') {
            for (const format of ['deflate', 'deflate-raw']) {
                try {
                    return await withTimeout(decompressWithStream(bytes, format), 4000);
                } catch (_) {
                    // try next format
                }
            }
        }

        throw new Error('pdf_flate_decoder_unavailable');
    }

    async function decodePdfStream(body) {
        const streamMatch = body.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
        if (!streamMatch) return null;
        const binaryChunk = streamMatch[1];
        const chunkBytes = Uint8Array.from(binaryChunk, ch => ch.charCodeAt(0) & 0xFF);
        const isFlate = /\/Filter\s*\/FlateDecode/.test(body);
        if (!isFlate) return binaryChunk;
        const inflated = await inflateFlate(chunkBytes);
        return bytesToBinaryString(inflated);
    }

    function parseCMapMappings(cmapText) {
        const map = new Map();
        for (const match of cmapText.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
            const src = match[1].toUpperCase();
            const destHex = match[2];
            let out = '';
            for (let i = 0; i < destHex.length; i += 4) {
                const cp = parseInt(destHex.slice(i, i + 4), 16);
                if (Number.isFinite(cp)) out += String.fromCharCode(cp);
            }
            map.set(src, out);
        }

        for (const match of cmapText.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
            const start = parseInt(match[1], 16);
            const end = parseInt(match[2], 16);
            const dstStart = parseInt(match[3], 16);
            if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(dstStart) || end - start > 2048) continue;
            const width = match[1].length;
            for (let code = start; code <= end; code++) {
                map.set(code.toString(16).toUpperCase().padStart(width, '0'), String.fromCharCode(dstStart + (code - start)));
            }
        }
        return map;
    }

    function decodeHexWithFontMap(hexText, fontMap) {
        const hex = hexText.toUpperCase().replace(/\s+/g, '');
        const widths = Array.from(new Set(Array.from(fontMap.keys()).map(key => key.length))).sort((a, b) => b - a);
        let cursor = 0;
        let out = '';
        while (cursor < hex.length) {
            let matched = false;
            for (const width of widths) {
                const key = hex.slice(cursor, cursor + width);
                if (key.length === width && fontMap.has(key)) {
                    out += fontMap.get(key);
                    cursor += width;
                    matched = true;
                    break;
                }
            }
            if (!matched) cursor += 2;
        }
        return out;
    }

    async function extractPdfTextFromArrayBuffer(buffer) {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const binaryText = bytesToBinaryString(bytes);
        const objects = parsePdfObjects(binaryText);
        const objectByRef = new Map(objects.map(obj => [`${obj.id} ${obj.gen}`, obj.body]));

        const fontObjectToMap = new Map();
        for (const obj of objects) {
            const refMatch = obj.body.match(/\/ToUnicode\s+(\d+)\s+(\d+)\s+R/);
            if (!refMatch) continue;
            const cmapBody = objectByRef.get(`${refMatch[1]} ${refMatch[2]}`);
            if (!cmapBody) continue;
            const cmapStream = await decodePdfStream(cmapBody);
            if (!cmapStream) continue;
            fontObjectToMap.set(`${obj.id} ${obj.gen}`, parseCMapMappings(cmapStream));
        }

        const fontAliasToMap = new Map();
        for (const obj of objects) {
            for (const block of obj.body.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) {
                for (const entry of block[1].matchAll(/\/(\w+)\s+(\d+)\s+(\d+)\s+R/g)) {
                    const fontRef = `${entry[2]} ${entry[3]}`;
                    if (fontObjectToMap.has(fontRef)) {
                        fontAliasToMap.set(entry[1], fontObjectToMap.get(fontRef));
                    }
                }
            }
        }

        let extractedText = '';
        for (const obj of objects) {
            const stream = await decodePdfStream(obj.body);
            if (!stream) continue;
            let currentFont = null;
            const tokenRegex = /\/(\w+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]+)>\s*Tj|\bT\*\b|\bTd\b/g;
            let token;
            while ((token = tokenRegex.exec(stream))) {
                if (token[1]) {
                    currentFont = token[1];
                    continue;
                }
                if (token[2]) {
                    const map = currentFont ? fontAliasToMap.get(currentFont) : null;
                    if (map) extractedText += decodeHexWithFontMap(token[2], map);
                    continue;
                }
                extractedText += '\n';
            }
        }

        return cleanExtractedText(extractedText);
    }

    async function extractPdfTextItemsFromArrayBuffer(buffer) {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const binaryText = bytesToBinaryString(bytes);
        const objects = parsePdfObjects(binaryText);
        const objectByRef = new Map(objects.map(obj => [`${obj.id} ${obj.gen}`, obj.body]));

        const fontObjectToMap = new Map();
        for (const obj of objects) {
            const refMatch = obj.body.match(/\/ToUnicode\s+(\d+)\s+(\d+)\s+R/);
            if (!refMatch) continue;
            const cmapBody = objectByRef.get(`${refMatch[1]} ${refMatch[2]}`);
            if (!cmapBody) continue;
            const cmapStream = await decodePdfStream(cmapBody);
            if (!cmapStream) continue;
            fontObjectToMap.set(`${obj.id} ${obj.gen}`, parseCMapMappings(cmapStream));
        }

        const fontAliasToMap = new Map();
        for (const obj of objects) {
            for (const block of obj.body.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) {
                for (const entry of block[1].matchAll(/\/(\w+)\s+(\d+)\s+(\d+)\s+R/g)) {
                    const fontRef = `${entry[2]} ${entry[3]}`;
                    if (fontObjectToMap.has(fontRef)) {
                        fontAliasToMap.set(entry[1], fontObjectToMap.get(fontRef));
                    }
                }
            }
        }

        const items = [];
        for (const obj of objects) {
            const stream = await decodePdfStream(obj.body);
            if (!stream) continue;
            let currentFont = null;
            let x = 0;
            let y = 0;
            const tokenRegex = /\/(\w+)\s+[\d.]+\s+Tf|(-?[\d.]+)\s+(-?[\d.]+)\s+Td|(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm|<([0-9A-Fa-f\s]+)>\s*Tj/g;
            let token;
            while ((token = tokenRegex.exec(stream))) {
                if (token[1]) {
                    currentFont = token[1];
                    continue;
                }
                if (token[2]) {
                    x += Number(token[2]);
                    y += Number(token[3]);
                    continue;
                }
                if (token[4]) {
                    x = Number(token[8]);
                    y = Number(token[9]);
                    continue;
                }
                if (token[10]) {
                    const map = currentFont ? fontAliasToMap.get(currentFont) : null;
                    const text = map ? decodeHexWithFontMap(token[10], map) : '';
                    if (normalizeText(text)) {
                        items.push({
                            x: Math.round(x * 10) / 10,
                            y: Math.round(y * 10) / 10,
                            text
                        });
                    }
                }
            }
        }

        return items;
    }

    async function parseMatrixViewPdfArrayBuffer(buffer) {
        return {
            ...sanitizeMatrixViewData({ records: [] }),
            parse_status: 'unsupported',
            export_type: 'pdf_matrixview_unreliable',
            unsupported_reason: PDF_UNRELIABLE_EXPORT_TYPE
        };
    }

    function classifyExportType(raw, decoded, hasRecords) {
        if (hasRecords) {
            return {
                parse_status: 'ok',
                export_type: 'matrixview_schedule',
                unsupported_reason: null
            };
        }

        const lowerRaw = String(raw || '').toLowerCase();
        const lowerDecoded = String(decoded || '').toLowerCase();
        const hasSifStudentRecordExchangeType = /content-type:\s*application\/vnd\.sif\.studentrecordexchange\+xml/i.test(raw);
        const hasSifCourseTags = /<schoolcourseinfodata[\s>]/i.test(decoded) || /<studentrecordexchangerecord[\s>]/i.test(decoded);
        const hasScheduleTags = /<period[\s>]|<meeting[\s>]|<section[\s>]|<bell[\s>]|<room[\s>]|<teacher[\s>]|<schedule[\s>]/i.test(decoded);
        const hasHtmlSchedule = /<table[\s>]/i.test(decoded) || /matrixview|a-h day|period/i.test(lowerDecoded);

        if ((hasSifStudentRecordExchangeType || hasSifCourseTags) && !hasScheduleTags && !hasHtmlSchedule) {
            return {
                parse_status: 'unsupported',
                export_type: 'powerschool_student_record_exchange',
                unsupported_reason: UNSUPPORTED_EXPORT_TYPE
            };
        }

        if (/content-type:\s*multipart\/mixed/i.test(lowerRaw) && /<studentrecordexchange/i.test(lowerDecoded) && !hasRecords) {
            return {
                parse_status: 'unsupported',
                export_type: 'powerschool_student_record_exchange',
                unsupported_reason: UNSUPPORTED_EXPORT_TYPE
            };
        }

        return {
            parse_status: 'empty',
            export_type: 'unknown',
            unsupported_reason: null
        };
    }

    function normalizePlanName(name) {
        return normalizeText(name).toLowerCase();
    }

    function isClearlyNonSubjectPlan(plan) {
        return NON_SUBJECT_PLAN_NAMES.has(normalizePlanName(plan.name));
    }

    function isKnownSubjectPlan(plan, desiredSubjects) {
        if (plan.subject || plan.matrixview_managed || plan.source === 'matrixview') return true;
        const name = normalizePlanName(plan.name);
        const subjectNames = [...SUBJECT_PLAN_NAMES, ...desiredSubjects].map(normalizePlanName);
        return subjectNames.some(subject => name === subject || name.startsWith(`${subject} `) || name.startsWith(`${subject}-`));
    }

    function normalizeMappings(mappings) {
        const out = [];
        const seen = new Set();
        for (const mapping of mappings || []) {
            const subject = normalizeText(mapping.subject);
            const subjectInMatrixView = normalizeText(mapping.subject_in_matrixview);
            if (!subject || !subjectInMatrixView) continue;
            const key = `${subject}|${subjectInMatrixView}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
                subject,
                subject_in_matrixview: subjectInMatrixView,
                source: 'matrixview',
                updated_at: mapping.updated_at || null
            });
        }
        return out;
    }

    function colorForSubject(subject) {
        const palette = ['#2b56e3', '#10b981', '#f97316', '#8b5cf6', '#ef4444', '#14b8a6', '#f59e0b', '#6366f1'];
        let hash = 0;
        for (const ch of subject) hash = (hash + ch.charCodeAt(0)) % palette.length;
        return palette[hash];
    }

    async function ensureDefaultBuckets(db, planId, bucketTemplate = DEFAULT_BUCKETS) {
        const existing = await db.getBucketsByPlan(planId);
        const names = new Set(existing.map(bucket => bucket.name));
        const created = [];
        const baseSortOrder = existing.reduce((max, bucket) => Math.max(max, bucket.sort_order ?? -1), -1) + 1;
        for (const name of bucketTemplate) {
            if (names.has(name)) continue;
            created.push(await db.addBucket({ plan_id: planId, name, sort_order: baseSortOrder + created.length }));
            names.add(name);
        }
        if (typeof db.deleteEmptyLegacyBucketsForPlan === 'function') {
            await db.deleteEmptyLegacyBucketsForPlan(planId);
        }
        return created;
    }

    async function initializeSubjectPlans(db, mappingsInput) {
        const now = new Date().toISOString();
        const mappings = normalizeMappings(mappingsInput).map(mapping => ({ ...mapping, updated_at: now }));
        const desiredSubjects = Array.from(new Set(mappings
            .map(mapping => mapping.subject)
            .filter(subject => subject !== OTHER_SCHOOL_PLAN_NAME))).sort();
        const existingPlans = await db.getPlans();
        const deletedPlans = [];
        const preservedPlans = [];
        const uncertainPlans = [];

        for (const plan of existingPlans) {
            if (plan.name === OTHER_SCHOOL_PLAN_NAME) continue;
            if (isKnownSubjectPlan(plan, desiredSubjects)) {
                await db.deletePlan(plan.id);
                deletedPlans.push({ id: plan.id, name: plan.name, subject: plan.subject || null });
            } else if (isClearlyNonSubjectPlan(plan)) {
                preservedPlans.push({ id: plan.id, name: plan.name });
            } else {
                uncertainPlans.push({ id: plan.id, name: plan.name });
            }
        }

        const createdPlans = [];
        for (const subject of desiredSubjects) {
            const plan = await db.addPlan({
                name: subject,
                subject,
                color: colorForSubject(subject),
                icon_char: subject.charAt(0).toUpperCase()
            });
            createdPlans.push(plan);
            await ensureDefaultBuckets(db, plan.id);
        }

        let otherSchoolPlan = (await db.getPlans()).find(plan => plan.name === OTHER_SCHOOL_PLAN_NAME);
        let createdOtherSchoolPlan = false;
        if (!otherSchoolPlan) {
            otherSchoolPlan = await db.addPlan({
                name: OTHER_SCHOOL_PLAN_NAME,
                subject: null,
                color: '#64748b',
                icon_char: 'S'
            });
            createdOtherSchoolPlan = true;
        }
        await ensureDefaultBuckets(db, otherSchoolPlan.id, OTHER_SCHOOL_DEFAULT_BUCKETS);

        if (typeof db.setSetting === 'function') {
            await db.setSetting(SETTINGS_MAPPING_KEY, mappings);
        }

        return {
            mappings,
            createdPlans,
            deletedPlans,
            preservedPlans,
            uncertainPlans,
            otherSchoolPlan,
            createdOtherSchoolPlan
        };
    }

    async function previewSubjectPlanInitialization(db, mappingsInput) {
        const mappings = normalizeMappings(mappingsInput);
        const desiredSubjects = Array.from(new Set(mappings
            .map(mapping => mapping.subject)
            .filter(subject => subject !== OTHER_SCHOOL_PLAN_NAME))).sort();
        const existingPlans = await db.getPlans();
        const deleteRebuild = [];
        const preserved = [];
        const uncertain = [];

        for (const plan of existingPlans) {
            if (plan.name === OTHER_SCHOOL_PLAN_NAME) {
                preserved.push(plan.name);
                continue;
            }
            if (isKnownSubjectPlan(plan, desiredSubjects)) {
                deleteRebuild.push(plan.name);
            } else if (isClearlyNonSubjectPlan(plan)) {
                preserved.push(plan.name);
            } else {
                uncertain.push(plan.name);
            }
        }

        for (const subject of desiredSubjects) {
            if (!deleteRebuild.includes(subject)) {
                deleteRebuild.push(subject);
            }
        }

        return {
            desiredSubjects,
            deleteRebuildPlanNames: Array.from(new Set(deleteRebuild)).sort(),
            preservedPlanNames: Array.from(new Set(preserved)).sort(),
            uncertainPlanNames: Array.from(new Set(uncertain)).sort(),
            hasOtherSchoolPlan: existingPlans.some(plan => plan.name === OTHER_SCHOOL_PLAN_NAME),
            willEnsureOtherSchoolPlan: true
        };
    }

    const api = {
        DEFAULT_BUCKETS,
        OTHER_SCHOOL_DEFAULT_BUCKETS,
        OTHER_SCHOOL_PLAN_NAME,
        SETTINGS_IMPORT_KEY,
        SETTINGS_MAPPING_KEY,
        parseMatrixViewMime,
        parseMatrixViewPdfArrayBuffer,
        parseMatrixViewExtractedText,
        UNSUPPORTED_EXPORT_TYPE,
        PDF_UNREADABLE_TEXT,
        PDF_UNRELIABLE_EXPORT_TYPE,
        sanitizeMatrixViewData,
        extractSubjectName,
        normalizeMappings,
        previewSubjectPlanInitialization,
        initializeSubjectPlans,
        escapeHTML,
        escapeAttribute
    };

    global.TimeWhereMatrixView = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
