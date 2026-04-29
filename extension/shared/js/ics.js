/**
 * TimeWhere ICS Parser — Shared pure parsing utilities
 * Handles RFC 5545 iCalendar format with UTC→+8 conversion
 */

(function (global) {
    'use strict';

    /**
     * Parse a DTSTART/DTEND line into { date, time }.
     * Handles UTC (Z suffix) → Asia/Shanghai (UTC+8) conversion.
     */
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
            // All-day event, no time part
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

    /**
     * Parse ICS text into a plain array of event objects (no DB write).
     * Fixes: 1) RFC 5545 line folding  2) UTC→+8 conversion  3) Unescaping SUMMARY
     */
    function parseICSToEvents(content) {
        // RFC 5545 §3.1: unfold continuation lines (CRLF + space/tab)
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
                    // ICS escaping: \, → ,  \n → space  \\ → \
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

        return events;
    }

    global.TimeWhereICS = {
        parseDTLine,
        parseICSToEvents
    };
})(typeof window !== 'undefined' ? window : this);
