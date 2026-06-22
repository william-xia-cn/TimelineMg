/**
 * TimeWhere Google data sync foundation.
 *
 * v0.1 scope:
 * - local snapshot export/import helpers
 * - mockable Chrome Identity auth adapter
 * - mockable Google Drive appDataFolder adapter
 * - preview-first local/cloud diff helpers
 */
(function(global) {
    'use strict';

    const SNAPSHOT_SCHEMA = 'timewhere-snapshot-v1';
    const MANIFEST_SCHEMA = 'timewhere-sync-manifest-v1';
    const SYNC_SCHEMA = 'timewhere-sync-v1';
    const SNAPSHOT_FILE_NAME = 'timewhere-snapshot-v1.json';
    const MANIFEST_FILE_NAME = 'timewhere-sync-manifest.json';
    const SYNC_FILE_NAME = 'timewhere-sync-v1.json';
    const GOOGLE_SYNC_STATE_KEY = 'google_sync_state';
    const GOOGLE_SYNC_META_KEY = 'google_sync_meta';
    const GOOGLE_SYNC_TOMBSTONES_KEY = 'google_sync_tombstones';
    const GOOGLE_SYNC_DEVICE_ID_KEY = 'google_sync_device_id';
    const GOOGLE_SYNC_CONFLICTS_KEY = 'google_sync_conflicts';
    const GOOGLE_SYNC_PENDING_KEY = 'google_sync_pending';
    const GOOGLE_SYNC_LAST_RUN_KEY = 'google_sync_last_run_at';
    const GOOGLE_SYNC_LAST_SUCCESS_KEY = 'google_sync_last_success_at';
    const GOOGLE_SYNC_ACCOUNT_EMAIL_KEY = 'google_sync_account_email';
    const GOOGLE_SYNC_ACCOUNT_NAME_KEY = 'google_sync_account_name';
    const GOOGLE_SYNC_ACCOUNT_KEY_KEY = 'google_sync_account_key';
    const GOOGLE_SYNC_ACCOUNT_PICTURE_KEY = 'google_sync_account_picture';
    const GOOGLE_SYNC_HISTORY_KEY = 'google_sync_history';
    const DESKTOP_WORK_REMINDER_STATE_KEY = 'desktop_work_reminder_state_v1';
    const TASK_DERIVED_SYNC_FIELDS = new Set(['start_date', 'priority']);
    const AUTO_SYNC_THROTTLE_MS = 3 * 60 * 1000;
    const SAVE_DEBOUNCE_MS = 3 * 60 * 1000;
    const DEFAULT_DRIVE_REQUEST_TIMEOUT_MS = 45 * 1000;
    const GOOGLE_SYNC_HISTORY_LIMIT = 50;
    const ACCESS_TOKEN_PATTERN = new RegExp(`\\b(?:${['ya', '29'].join('')}|1\\/\\/)[A-Za-z0-9._-]+`, 'g');
    const CLIENT_SECRET_PATTERN = new RegExp(`\\b${['GOC', 'SPX-'].join('')}[A-Za-z0-9_-]+`, 'g');

    const SNAPSHOT_TABLES = [
        'plans',
        'buckets',
        'labels',
        'tasks',
        'containers',
        'events',
        'habits',
        'daily_journals'
    ];

    const SELECTED_SETTING_KEYS = [
        'matrixview_subject_mappings',
        'managebac_subject_mappings',
        'managebac_ics_config',
        'appearance_background',
        'appearance_avatar',
        'theme',
        'start_week_on',
        'default_duration',
        'default_priority'
    ];

    const EXCLUDED_SETTING_KEYS = new Set([
        'access_token',
        'refresh_token',
        'google_email',
        GOOGLE_SYNC_ACCOUNT_EMAIL_KEY,
        GOOGLE_SYNC_ACCOUNT_NAME_KEY,
        GOOGLE_SYNC_ACCOUNT_KEY_KEY,
        GOOGLE_SYNC_ACCOUNT_PICTURE_KEY,
        'management_review_pending',
        'task_arrange_pending',
        'managebac_pending_event_mappings',
        'matrixview_last_import_raw',
        'managebac_last_import_raw',
        'raw_import_file',
        'raw_import_files',
        GOOGLE_SYNC_META_KEY,
        GOOGLE_SYNC_TOMBSTONES_KEY,
        GOOGLE_SYNC_DEVICE_ID_KEY,
        GOOGLE_SYNC_CONFLICTS_KEY,
        GOOGLE_SYNC_PENDING_KEY,
        GOOGLE_SYNC_HISTORY_KEY,
        DESKTOP_WORK_REMINDER_STATE_KEY,
        GOOGLE_SYNC_LAST_RUN_KEY,
        GOOGLE_SYNC_LAST_SUCCESS_KEY
    ]);

    function nowISO() {
        return new Date().toISOString();
    }

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function emitGoogleSyncEvent(name, detail) {
        try {
            global.dispatchEvent?.(new CustomEvent(name, { detail: clone(detail) }));
        } catch (_) {
            // Status events are best-effort UI hints; persisted state remains authoritative.
        }
    }

    function sanitizeSyncHistoryText(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        return raw
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, '[account]')
            .replace(ACCESS_TOKEN_PATTERN, '[token]')
            .replace(CLIENT_SECRET_PATTERN, '[secret]')
            .replace(/[A-Z]:\\[^\s'"<>]+/g, '[local path]')
            .replace(/\/Users\/[^\s'"<>]+/g, '[local path]')
            .replace(/\/home\/[^\s'"<>]+/g, '[local path]')
            .slice(0, 240);
    }

    function normalizeSettings(settings) {
        if (Array.isArray(settings)) {
            const out = {};
            for (const item of settings) {
                if (!item || typeof item.key !== 'string') continue;
                out[item.key] = item.value;
            }
            return out;
        }
        return settings && typeof settings === 'object' ? { ...settings } : {};
    }

    function pickSelectedSettings(settings) {
        const normalized = normalizeSettings(settings);
        const selected = {};
        for (const key of SELECTED_SETTING_KEYS) {
            if (EXCLUDED_SETTING_KEYS.has(key)) continue;
            if (Object.prototype.hasOwnProperty.call(normalized, key)) {
                selected[key] = clone(normalized[key]);
            }
        }
        return selected;
    }

    function getTableAdapter(db, tableName) {
        return db?.db?.[tableName] || db?.[tableName] || null;
    }

    async function readTable(db, tableName) {
        const methodName = {
            plans: 'getPlans',
            tasks: 'getAllTasks',
            containers: 'getContainers',
            events: 'getEvents',
            habits: 'getHabits'
        }[tableName];

        if (methodName && typeof db?.[methodName] === 'function') {
            return clone(await db[methodName]());
        }

        const table = getTableAdapter(db, tableName);
        if (table && typeof table.toArray === 'function') {
            return clone(await table.toArray());
        }
        return [];
    }

    async function buildSnapshot(db, options = {}) {
        if (!db) throw new Error('TimeWhereDB is required to build snapshot');
        const settings = typeof db.getSettings === 'function'
            ? await db.getSettings()
            : await readTable(db, 'settings');
        const data = {};
        for (const tableName of SNAPSHOT_TABLES) {
            data[tableName] = await readTable(db, tableName);
        }
        data.settings = pickSelectedSettings(settings);

        return {
            schema: SNAPSHOT_SCHEMA,
            version: 1,
            app: 'TimeWhere',
            exported_at: options.exported_at || nowISO(),
            device_id: options.device_id || null,
            data
        };
    }

    function validateSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') {
            throw new Error('Invalid TimeWhere snapshot');
        }
        if (snapshot.schema !== SNAPSHOT_SCHEMA) {
            throw new Error(`Unsupported snapshot schema: ${snapshot.schema || 'unknown'}`);
        }
        if (!snapshot.data || typeof snapshot.data !== 'object') {
            throw new Error('Snapshot missing data');
        }
        for (const tableName of SNAPSHOT_TABLES) {
            if (tableName === 'daily_journals' && snapshot.data[tableName] === undefined) {
                snapshot.data[tableName] = [];
            }
            if (!Array.isArray(snapshot.data[tableName])) {
                throw new Error(`Snapshot table ${tableName} must be an array`);
            }
        }
        if (!snapshot.data.settings || typeof snapshot.data.settings !== 'object' || Array.isArray(snapshot.data.settings)) {
            throw new Error('Snapshot selected settings must be an object');
        }
        return true;
    }

    async function replaceTable(db, tableName, rows) {
        const table = getTableAdapter(db, tableName);
        if (!table || typeof table.clear !== 'function') {
            throw new Error(`Cannot restore table ${tableName}`);
        }
        await table.clear();
        if (rows.length > 0) {
            if (typeof table.bulkPut === 'function') {
                await table.bulkPut(clone(rows));
            } else if (typeof table.bulkAdd === 'function') {
                await table.bulkAdd(clone(rows));
            } else {
                for (const row of rows) {
                    await table.add(clone(row));
                }
            }
        }
    }

    async function applySnapshot(db, snapshot, options = {}) {
        validateSnapshot(snapshot);
        if (typeof db?.importGoogleSyncSnapshot === 'function') {
            return await db.importGoogleSyncSnapshot(snapshot, options);
        }

        const counts = {};
        if (db?.db && typeof db.db.transaction === 'function') {
            const tables = SNAPSHOT_TABLES.map(name => db.db[name]).filter(Boolean);
            await db.db.transaction('rw', tables, async () => {
                for (const tableName of SNAPSHOT_TABLES) {
                    await replaceTable(db, tableName, snapshot.data[tableName]);
                    counts[tableName] = snapshot.data[tableName].length;
                }
            });
        } else {
            for (const tableName of SNAPSHOT_TABLES) {
                await replaceTable(db, tableName, snapshot.data[tableName]);
                counts[tableName] = snapshot.data[tableName].length;
            }
        }

        if (typeof db.setSetting !== 'function') {
            throw new Error('Cannot restore selected settings');
        }
        for (const [key, value] of Object.entries(pickSelectedSettings(snapshot.data.settings))) {
            await db.setSetting(key, clone(value));
        }
        counts.settings = Object.keys(snapshot.data.settings).length;
        return { status: 'applied', counts };
    }

    function recordKey(tableName, record) {
        if (!record || typeof record !== 'object') return null;
        if (tableName === 'daily_journals' && record.date != null) return String(record.date);
        if (record.id != null) return String(record.id);
        if (tableName === 'settings' && record.key != null) return String(record.key);
        return null;
    }

    function makeDiffKey(type, table, id) {
        return `${type}:${table}:${id}`;
    }

    function indexRows(tableName, rows) {
        const map = new Map();
        for (const row of rows || []) {
            const key = recordKey(tableName, row);
            if (key != null) map.set(key, row);
        }
        return map;
    }

    function stableJson(value) {
        if (Array.isArray(value)) {
            return `[${value.map(stableJson).join(',')}]`;
        }
        if (value && typeof value === 'object') {
            return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
        }
        return JSON.stringify(value);
    }

    function hashValue(value) {
        const text = stableJson(value);
        let hash = 0x811c9dc5;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
    }

    function syncEntityKey(table, id) {
        return `${table}:${String(id)}`;
    }

    function splitEntityKey(key) {
        const index = String(key).indexOf(':');
        if (index < 0) return { table: '', id: String(key) };
        return { table: key.slice(0, index), id: key.slice(index + 1) };
    }

    function comparableRecord(record) {
        const out = clone(record) || {};
        delete out._sync;
        return out;
    }

    function normalizeDerivedFieldMap(value = {}) {
        const out = {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
        for (const [field, entry] of Object.entries(value)) {
            if (!TASK_DERIVED_SYNC_FIELDS.has(field)) continue;
            if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                out[field] = {
                    value: clone(entry.value ?? null),
                    base_value: clone(entry.base_value ?? null),
                    base_has_field: entry.base_has_field !== false,
                    source: entry.source || 'derived',
                    updated_at: entry.updated_at || null
                };
            } else {
                out[field] = {
                    value: clone(entry ?? null),
                    base_value: null,
                    base_has_field: true,
                    source: 'derived',
                    updated_at: null
                };
            }
        }
        return out;
    }

    function normalizeDerivedFieldList(fields = []) {
        if (!Array.isArray(fields)) return [];
        return Array.from(new Set(fields.filter(field => TASK_DERIVED_SYNC_FIELDS.has(field))));
    }

    function isDerivedFieldActive(record = {}, field, entry = null) {
        if (!entry || !TASK_DERIVED_SYNC_FIELDS.has(field)) return false;
        return stableJson(record?.[field] ?? null) === stableJson(entry.value ?? null);
    }

    function makeComparableRecordForSync(table, record, syncMeta = {}) {
        const out = comparableRecord(record);
        if (table !== 'tasks') return out;
        const derivedFields = normalizeDerivedFieldMap(syncMeta.derived_fields);
        for (const [field, entry] of Object.entries(derivedFields)) {
            if (!isDerivedFieldActive(record, field, entry)) continue;
            if (entry.base_has_field !== false) {
                out[field] = clone(entry.base_value ?? null);
            } else {
                delete out[field];
            }
        }
        return out;
    }

    function mergeRecordWithActiveDerivedFields(table, incomingRecord, localRecord, syncMeta = {}) {
        const next = clone(incomingRecord) || {};
        if (table !== 'tasks' || !localRecord) return next;
        const derivedFields = normalizeDerivedFieldMap(syncMeta.derived_fields);
        for (const [field, entry] of Object.entries(derivedFields)) {
            if (isDerivedFieldActive(localRecord, field, entry)) {
                next[field] = clone(localRecord[field] ?? null);
            }
        }
        return next;
    }

    function refreshDerivedFieldBaseValues(derivedFields, entity) {
        const next = normalizeDerivedFieldMap(derivedFields);
        if (entity?.table !== 'tasks') return next;
        for (const [field, entry] of Object.entries(next)) {
            entry.base_has_field = Object.prototype.hasOwnProperty.call(entity.record || {}, field);
            entry.base_value = clone(entity.record?.[field] ?? null);
        }
        return next;
    }

    function hasDerivedFields(derivedFields = {}) {
        return Object.keys(normalizeDerivedFieldMap(derivedFields)).length > 0;
    }

    async function getSettingValue(db, key, fallback) {
        if (!db?.getSetting) return fallback;
        const value = await db.getSetting(key);
        return value == null ? fallback : value;
    }

    async function setSettingValue(db, key, value) {
        if (!db?.setSetting) throw new Error('TimeWhereDB setting writer is required');
        await db.setSetting(key, value);
    }

    async function getOrCreateDeviceId(db) {
        let deviceId = await getSettingValue(db, GOOGLE_SYNC_DEVICE_ID_KEY, null);
        if (!deviceId) {
            const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            deviceId = `device-${randomPart}`;
            await setSettingValue(db, GOOGLE_SYNC_DEVICE_ID_KEY, deviceId);
        }
        return deviceId;
    }

    async function readSyncMeta(db) {
        const meta = await getSettingValue(db, GOOGLE_SYNC_META_KEY, {});
        return meta && typeof meta === 'object' && !Array.isArray(meta) ? clone(meta) : {};
    }

    async function writeSyncMeta(db, meta) {
        await setSettingValue(db, GOOGLE_SYNC_META_KEY, meta && typeof meta === 'object' ? meta : {});
    }

    async function readSyncTombstones(db) {
        const tombstones = await getSettingValue(db, GOOGLE_SYNC_TOMBSTONES_KEY, {});
        return tombstones && typeof tombstones === 'object' && !Array.isArray(tombstones) ? clone(tombstones) : {};
    }

    async function writeSyncTombstones(db, tombstones) {
        await setSettingValue(db, GOOGLE_SYNC_TOMBSTONES_KEY, tombstones && typeof tombstones === 'object' ? tombstones : {});
    }

    async function markEntityDirty(db, table, id, record, options = {}) {
        if (!table || id == null || options.skipGoogleSync) return null;
        const key = syncEntityKey(table, id);
        const meta = await readSyncMeta(db);
        const deviceId = options.device_id || await getOrCreateDeviceId(db);
        const previous = meta[key] || {};
        const changedFields = Array.isArray(options.changedFields) ? options.changedFields : [];
        const optionDerivedFields = table === 'tasks'
            ? normalizeDerivedFieldList(options.googleSyncDerivedFields)
            : [];
        const optionDerivedSet = new Set(optionDerivedFields);
        const derivedFields = normalizeDerivedFieldMap(previous.derived_fields);
        if (table === 'tasks') {
            for (const field of changedFields) {
                if (TASK_DERIVED_SYNC_FIELDS.has(field) && !optionDerivedSet.has(field)) {
                    delete derivedFields[field];
                }
            }
            for (const field of optionDerivedFields) {
                const baseRecord = options.googleSyncDerivedBaseRecord || {};
                derivedFields[field] = {
                    value: clone(record?.[field] ?? null),
                    base_value: clone(Object.prototype.hasOwnProperty.call(baseRecord, field)
                        ? baseRecord[field]
                        : (derivedFields[field]?.base_value ?? null)),
                    base_has_field: Object.prototype.hasOwnProperty.call(baseRecord, field)
                        ? true
                        : (derivedFields[field] ? derivedFields[field].base_has_field !== false : false),
                    source: options.googleSyncDerivedSource || 'task_arrange_auto',
                    updated_at: options.updated_at || nowISO()
                };
            }
        }
        const userChangedFields = changedFields.filter(field =>
            field !== 'updated_at' && !optionDerivedSet.has(field)
        );
        const derivedOnly = table === 'tasks'
            && optionDerivedFields.length > 0
            && userChangedFields.length === 0;
        const nextMeta = {
            ...previous,
            table,
            id: String(id),
            source_device_id: deviceId
        };
        if (hasDerivedFields(derivedFields)) nextMeta.derived_fields = derivedFields;
        else delete nextMeta.derived_fields;
        if (derivedOnly) {
            nextMeta.dirty = previous.dirty === true;
            nextMeta.hash = previous.hash
                || previous.last_synced_hash
                || hashValue(makeComparableRecordForSync(table, record, nextMeta));
            nextMeta.derived_updated_at = options.updated_at || nowISO();
            meta[key] = nextMeta;
            await writeSyncMeta(db, meta);
            return { ...meta[key], derived_only: true };
        }
        meta[key] = {
            ...nextMeta,
            dirty: true,
            hash: hashValue(makeComparableRecordForSync(table, record, nextMeta)),
            updated_at: options.updated_at || nowISO(),
            source_device_id: deviceId
        };
        await writeSyncMeta(db, meta);
        return meta[key];
    }

    async function markEntityDeleted(db, table, id, record, options = {}) {
        if (!table || id == null || options.skipGoogleSync) return null;
        const key = syncEntityKey(table, id);
        const deviceId = options.device_id || await getOrCreateDeviceId(db);
        const tombstones = await readSyncTombstones(db);
        const meta = await readSyncMeta(db);
        tombstones[key] = {
            table,
            id: String(id),
            deleted_at: options.deleted_at || nowISO(),
            last_synced_hash: meta[key]?.last_synced_hash || hashValue(makeComparableRecordForSync(table, record, meta[key] || {})),
            source_device_id: deviceId
        };
        delete meta[key];
        await writeSyncTombstones(db, tombstones);
        await writeSyncMeta(db, meta);
        return tombstones[key];
    }

    function diffRowSets(tableName, localRows, cloudRows) {
        const localMap = indexRows(tableName, localRows);
        const cloudMap = indexRows(tableName, cloudRows);
        const ids = new Set([...localMap.keys(), ...cloudMap.keys()]);
        const changes = [];
        for (const id of ids) {
            const local = localMap.get(id);
            const cloud = cloudMap.get(id);
            let changeType = null;
            if (local && !cloud) changeType = 'local_only';
            if (!local && cloud) changeType = 'cloud_only';
            if (local && cloud && stableJson(local) !== stableJson(cloud)) changeType = 'conflict';
            if (!changeType) continue;
            changes.push({
                key: makeDiffKey('record', tableName, id),
                item_type: 'record',
                table: tableName,
                id,
                change_type: changeType,
                local: clone(local),
                cloud: clone(cloud)
            });
        }
        return changes;
    }

    function chooseNewerDailyJournal(local, cloud) {
        if (!local || !cloud) return null;
        const localTime = new Date(local.updated_at || local.submitted_at || local.snapshot_at || 0).getTime();
        const cloudTime = new Date(cloud.updated_at || cloud.submitted_at || cloud.snapshot_at || 0).getTime();
        if (Number.isNaN(localTime) && Number.isNaN(cloudTime)) return null;
        return localTime >= cloudTime ? 'local' : 'cloud';
    }

    function diffSettings(localSettings, cloudSettings) {
        const local = pickSelectedSettings(localSettings);
        const cloud = pickSelectedSettings(cloudSettings);
        const keys = new Set([...Object.keys(local), ...Object.keys(cloud)]);
        const changes = [];
        for (const key of keys) {
            const hasLocal = Object.prototype.hasOwnProperty.call(local, key);
            const hasCloud = Object.prototype.hasOwnProperty.call(cloud, key);
            let changeType = null;
            if (hasLocal && !hasCloud) changeType = 'local_only';
            if (!hasLocal && hasCloud) changeType = 'cloud_only';
            if (hasLocal && hasCloud && stableJson(local[key]) !== stableJson(cloud[key])) changeType = 'conflict';
            if (!changeType) continue;
            changes.push({
                key: makeDiffKey('setting', 'settings', key),
                item_type: 'setting',
                table: 'settings',
                id: key,
                change_type: changeType,
                local: hasLocal ? clone(local[key]) : undefined,
                cloud: hasCloud ? clone(cloud[key]) : undefined
            });
        }
        return changes;
    }

    function computeSyncPreview(localSnapshot, cloudSnapshot) {
        validateSnapshot(localSnapshot);
        if (!cloudSnapshot) {
            return {
                status: 'no_cloud_snapshot',
                local_exported_at: localSnapshot.exported_at,
                cloud_exported_at: null,
                changes: [],
                conflict_count: 0
            };
        }
        validateSnapshot(cloudSnapshot);
        const changes = [];
        for (const tableName of SNAPSHOT_TABLES) {
            changes.push(...diffRowSets(tableName, localSnapshot.data[tableName], cloudSnapshot.data[tableName]));
        }
        changes.push(...diffSettings(localSnapshot.data.settings, cloudSnapshot.data.settings));
        return {
            status: changes.length ? 'has_changes' : 'up_to_date',
            local_exported_at: localSnapshot.exported_at,
            cloud_exported_at: cloudSnapshot.exported_at,
            changes,
            conflict_count: changes.filter(change => change.change_type === 'conflict').length
        };
    }

    async function applyCloudChoicesToLocal(db, preview, choices = {}) {
        if (!preview || !Array.isArray(preview.changes)) {
            throw new Error('Sync preview is required');
        }
        const applied = [];
        for (const change of preview.changes) {
            if (choices[change.key] !== 'cloud') continue;
            if (change.item_type === 'setting') {
                if (typeof db.setSetting !== 'function') throw new Error('Cannot write setting');
                await db.setSetting(change.id, clone(change.cloud));
                applied.push(change.key);
                continue;
            }
            const table = getTableAdapter(db, change.table);
            if (!table) throw new Error(`Cannot write ${change.table}`);
            if (change.cloud == null) {
                if (typeof table.delete !== 'function') throw new Error(`Cannot delete ${change.table}`);
                await table.delete(change.id);
            } else if (typeof table.put === 'function') {
                await table.put(clone(change.cloud));
            } else if (typeof table.update === 'function') {
                const existing = await table.get(change.id);
                if (existing) {
                    await table.update(change.id, clone(change.cloud));
                } else {
                    await table.add(clone(change.cloud));
                }
            }
            applied.push(change.key);
        }
        return { status: 'applied', applied_count: applied.length, applied };
    }

    function putSnapshotRecord(snapshot, tableName, record) {
        const rows = snapshot.data[tableName] || [];
        const id = recordKey(tableName, record);
        const index = rows.findIndex(row => recordKey(tableName, row) === id);
        if (index >= 0) {
            rows[index] = clone(record);
        } else {
            rows.push(clone(record));
        }
        snapshot.data[tableName] = rows;
    }

    function deleteSnapshotRecord(snapshot, tableName, id) {
        snapshot.data[tableName] = (snapshot.data[tableName] || []).filter(row => recordKey(tableName, row) !== String(id));
    }

    function buildUploadSnapshotFromChoices(localSnapshot, cloudSnapshot, preview, choices = {}, options = {}) {
        validateSnapshot(localSnapshot);
        validateSnapshot(cloudSnapshot);
        if (!preview || !Array.isArray(preview.changes)) {
            throw new Error('Sync preview is required');
        }

        const uploadSnapshot = clone(localSnapshot);
        uploadSnapshot.exported_at = options.exported_at || nowISO();
        uploadSnapshot.device_id = options.device_id ?? uploadSnapshot.device_id ?? null;

        for (const change of preview.changes) {
            const choice = choices[change.key] || 'skip';
            if (change.item_type === 'setting') {
                if (choice === 'skip') {
                    if (change.cloud === undefined) {
                        delete uploadSnapshot.data.settings[change.id];
                    } else {
                        uploadSnapshot.data.settings[change.id] = clone(change.cloud);
                    }
                } else if (choice === 'cloud') {
                    if (change.cloud === undefined) {
                        delete uploadSnapshot.data.settings[change.id];
                    } else {
                        uploadSnapshot.data.settings[change.id] = clone(change.cloud);
                    }
                }
                continue;
            }

            if (choice === 'skip' || choice === 'cloud') {
                if (change.cloud == null) {
                    deleteSnapshotRecord(uploadSnapshot, change.table, change.id);
                } else {
                    putSnapshotRecord(uploadSnapshot, change.table, change.cloud);
                }
            }
        }

        uploadSnapshot.data.settings = pickSelectedSettings(uploadSnapshot.data.settings);
        validateSnapshot(uploadSnapshot);
        return uploadSnapshot;
    }

    function createManifest(snapshot, options = {}) {
        validateSnapshot(snapshot);
        return {
            schema: MANIFEST_SCHEMA,
            app: 'TimeWhere',
            snapshot_file: SNAPSHOT_FILE_NAME,
            snapshot_schema: SNAPSHOT_SCHEMA,
            snapshot_exported_at: snapshot.exported_at,
            updated_at: options.updated_at || nowISO(),
            device_id: snapshot.device_id || options.device_id || null
        };
    }

    function getExtensionManifest(chromeRef) {
        try {
            return chromeRef?.runtime?.getManifest ? chromeRef.runtime.getManifest() : null;
        } catch (_) {
            return null;
        }
    }

    function getOAuthClientId(chromeRef) {
        const manifest = getExtensionManifest(chromeRef);
        const clientId = manifest?.oauth2?.client_id || '';
        if (!clientId || /YOUR_|TODO|PLACEHOLDER|CLIENT_ID/i.test(clientId)) return '';
        return clientId;
    }

    function chromeLastError(chromeRef) {
        return chromeRef?.runtime?.lastError?.message || null;
    }

    function requestChromeToken(chromeRef, interactive) {
        return new Promise((resolve, reject) => {
            if (!chromeRef?.identity?.getAuthToken) {
                resolve({ status: 'not_configured', reason: 'chrome_identity_unavailable' });
                return;
            }
            chromeRef.identity.getAuthToken({ interactive }, token => {
                const err = chromeLastError(chromeRef);
                if (err) {
                    reject(new Error(err));
                    return;
                }
                if (!token) {
                    reject(new Error('Google auth token unavailable'));
                    return;
                }
                resolve({ status: 'connected', token });
            });
        });
    }

    function createChromeIdentityAuthAdapter(chromeRef = global.chrome) {
        return {
            async getStatus() {
                if (!chromeRef?.identity || !getOAuthClientId(chromeRef)) {
                    return { status: 'not_configured', reason: 'oauth_client_id_missing' };
                }
                return { status: 'configured' };
            },
            async connect() {
                const status = await this.getStatus();
                if (status.status === 'not_configured') return status;
                return await requestChromeToken(chromeRef, true);
            },
            async getToken(options = {}) {
                const status = await this.getStatus();
                if (status.status === 'not_configured') return status;
                return await requestChromeToken(chromeRef, options.interactive === true);
            },
            async getAccountInfo() {
                if (!chromeRef?.identity?.getProfileUserInfo) {
                    return { email: null };
                }
                return new Promise(resolve => {
                    chromeRef.identity.getProfileUserInfo({ accountStatus: 'ANY' }, info => {
                        const err = chromeLastError(chromeRef);
                        if (err) {
                            resolve({ email: null, error: err });
                            return;
                        }
                        resolve({ email: info?.email || null });
                    });
                });
            },
            async disconnect() {
                if (!chromeRef?.identity?.clearAllCachedAuthTokens) {
                    return { status: 'disconnected' };
                }
                return new Promise(resolve => {
                    chromeRef.identity.clearAllCachedAuthTokens(() => resolve({ status: 'disconnected' }));
                });
            }
        };
    }

    function createTimeWherePlatformAuthAdapter(platform = global.TimeWherePlatform) {
        function makePlatformAuthError(result = {}) {
            const reason = result.reason || result.status || 'platform_auth_failed';
            const message = result.message || `Google platform authorization failed: ${reason}`;
            const error = new Error(message);
            error.code = reason;
            error.reason = reason;
            error.http_status = result.http_status || null;
            error.google_reason = result.google_error || null;
            error.google_status = result.google_error_subtype || null;
            error.google_message = result.message || null;
            error.auth_error_subtype = result.google_error_subtype || null;
            error.oauth_diagnostics = result.oauth_diagnostics || null;
            return error;
        }

        return {
            async getStatus() {
                if (!platform?.auth?.getGoogleToken) {
                    return { status: 'not_configured', reason: 'platform_auth_unavailable' };
                }
                if (typeof platform.auth.getStatus === 'function') {
                    return await platform.auth.getStatus();
                }
                return { status: 'configured' };
            },
            async connect(options = {}) {
                const status = await this.getStatus();
                if (status.status === 'not_configured') return status;
                const result = await platform.auth.getGoogleToken({
                    interactive: true,
                    force_account_selection: options.force_account_selection === true
                });
                if (result?.status === 'not_configured') return result;
                if (result?.status === 'account_mismatch') return result;
                if (result?.status === 'failed') throw makePlatformAuthError(result);
                if (result?.status === 'not_authorized') throw makePlatformAuthError(result);
                if (!result?.token) throw new Error('Google auth token unavailable');
                return { status: 'connected', token: result.token };
            },
            async getToken(options = {}) {
                const status = await this.getStatus();
                if (status.status === 'not_configured') return status;
                const result = await platform.auth.getGoogleToken({ interactive: options.interactive === true });
                if (result?.status === 'not_configured') return result;
                if (result?.status === 'account_mismatch') return result;
                if (result?.status === 'not_authorized') return result;
                if (result?.status === 'failed') throw makePlatformAuthError(result);
                if (!result?.token) throw new Error('Google auth token unavailable');
                return { status: 'connected', token: result.token };
            },
            async getAccountInfo() {
                if (typeof platform?.auth?.getAccountInfo !== 'function') return { email: null };
                const info = await platform.auth.getAccountInfo();
                return {
                    account_key: info?.account_key || null,
                    name: info?.name || null,
                    email: info?.email || null,
                    picture: info?.picture || null,
                    connected: info?.connected === true
                };
            },
            async disconnect() {
                if (typeof platform?.auth?.disconnectGoogleToken === 'function') {
                    await platform.auth.disconnectGoogleToken();
                    return { status: 'disconnected' };
                }
                if (typeof platform?.auth?.revokeGoogleToken !== 'function') return { status: 'disconnected' };
                await platform.auth.revokeGoogleToken();
                return { status: 'disconnected' };
            },
            async revoke() {
                if (typeof platform?.auth?.revokeGoogleToken !== 'function') return { status: 'not_supported' };
                await platform.auth.revokeGoogleToken();
                return { status: 'revoked' };
            }
        };
    }

    function driveRequestUrl(path, params = {}) {
        const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
        for (const [key, value] of Object.entries(params)) {
            if (value != null) url.searchParams.set(key, value);
        }
        return url.toString();
    }

    async function parseJsonResponse(response) {
        if (!response.ok) {
            throw await makeGoogleDriveError(response);
        }
        if (response.status === 204) return null;
        return await response.json();
    }

    async function makeGoogleDriveError(response) {
        let detail = '';
        let payload = null;
        try {
            detail = await response.text();
            payload = detail ? JSON.parse(detail) : null;
        } catch (_) {
            payload = null;
        }
        const googleError = payload?.error || {};
        const googleReason = googleError.errors?.[0]?.reason || googleError.status || '';
        const message = googleError.message || detail || 'unknown error';
        const error = new Error(`Google Drive request failed (${response.status})${message ? `: ${String(message).slice(0, 220)}` : ''}`);
        error.code = googleReason || `google_drive_http_${response.status}`;
        error.reason = error.code;
        error.http_status = response.status;
        error.google_reason = googleReason || null;
        error.google_status = googleError.status || null;
        error.google_message = googleError.message || null;
        error.retryable = response.status >= 500 || response.status === 429;
        return error;
    }

    function serializeSyncError(error = {}) {
        return {
            reason: error.code || error.reason || error.name || 'google_sync_failed',
            message: error.message || 'Google sync failed',
            http_status: error.http_status || null,
            google_reason: error.google_reason || null,
            google_status: error.google_status || null,
            google_message: error.google_message || null,
            auth_error_subtype: error.auth_error_subtype || null,
            oauth_diagnostics: error.oauth_diagnostics || null,
            retryable: error.retryable === true
        };
    }

    function makeDriveTimeoutError(timeoutMs) {
        const error = new Error(`Google Drive request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
        error.code = 'google_drive_request_timeout';
        error.reason = 'google_drive_request_timeout';
        error.retryable = true;
        return error;
    }

    function createDriveAppDataClient({ authAdapter, fetchImpl = global.fetch, request_timeout_ms = DEFAULT_DRIVE_REQUEST_TIMEOUT_MS } = {}) {
        if (!authAdapter) throw new Error('authAdapter is required');
        if (!fetchImpl) throw new Error('fetch implementation is required');

        function makeAuthUnavailableError(auth = {}) {
            const reason = auth.reason || auth.status || 'google_auth_unavailable';
            const error = new Error(auth.message || `Google authorization unavailable: ${reason}`);
            error.code = reason;
            error.reason = reason;
            error.google_reason = auth.google_error || null;
            error.google_status = auth.google_error_subtype || null;
            error.google_message = auth.message || null;
            error.auth_error_subtype = auth.google_error_subtype || null;
            error.oauth_diagnostics = auth.oauth_diagnostics || null;
            return error;
        }

        async function getAuthHeader() {
            const auth = await authAdapter.getToken({ interactive: false });
            if (auth.status === 'not_configured') return auth;
            if (auth.status === 'not_authorized' || auth.status === 'failed' || auth.status === 'account_mismatch') {
                throw makeAuthUnavailableError(auth);
            }
            if (!auth.token) throw new Error('Google auth token unavailable');
            return { Authorization: `Bearer ${auth.token}` };
        }

        async function authorizedFetch(url, options = {}) {
            const authHeader = await getAuthHeader();
            if (authHeader.status === 'not_configured') return authHeader;
            const timeoutMs = Number(options.request_timeout_ms ?? request_timeout_ms ?? 0);
            const fetchOptions = {
                ...options,
                headers: {
                    ...(options.headers || {}),
                    ...authHeader
                }
            };
            delete fetchOptions.request_timeout_ms;
            let timeoutId = null;
            let controller = null;
            if (timeoutMs > 0 && typeof global.AbortController === 'function' && !fetchOptions.signal) {
                controller = new global.AbortController();
                fetchOptions.signal = controller.signal;
                timeoutId = global.setTimeout(() => controller.abort(), timeoutMs);
            }
            let response;
            try {
                response = await fetchImpl(url, fetchOptions);
            } catch (error) {
                if (controller?.signal?.aborted || error?.name === 'AbortError') {
                    throw makeDriveTimeoutError(timeoutMs);
                }
                throw error;
            } finally {
                if (timeoutId) global.clearTimeout(timeoutId);
            }
            return await parseJsonResponse(response);
        }

        async function findJsonFile(name) {
            const escapedName = String(name).replace(/'/g, "\\'");
            const result = await authorizedFetch(driveRequestUrl('files', {
                spaces: 'appDataFolder',
                fields: 'files(id,name,modifiedTime)',
                q: `name='${escapedName}' and 'appDataFolder' in parents and trashed=false`
            }));
            if (result?.status === 'not_configured') return result;
            return (result.files || [])[0] || null;
        }

        async function uploadJsonFile(name, json) {
            const existing = await findJsonFile(name);
            if (existing?.status === 'not_configured') return existing;
            const body = JSON.stringify(json, null, 2);
            if (existing?.id) {
                return await authorizedFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=media&fields=id,name,modifiedTime`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body
                });
            }

            const boundary = `timewhere_${Math.random().toString(36).slice(2)}`;
            const metadata = JSON.stringify({ name, parents: ['appDataFolder'] });
            const multipartBody = [
                `--${boundary}`,
                'Content-Type: application/json; charset=UTF-8',
                '',
                metadata,
                `--${boundary}`,
                'Content-Type: application/json',
                '',
                body,
                `--${boundary}--`
            ].join('\r\n');
            return await authorizedFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime', {
                method: 'POST',
                headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                body: multipartBody
            });
        }

        async function downloadJsonFile(name) {
            const existing = await findJsonFile(name);
            if (existing?.status === 'not_configured') return existing;
            if (!existing?.id) return null;
            return await authorizedFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(existing.id)}?alt=media`);
        }

        return {
            findJsonFile,
            uploadJsonFile,
            downloadJsonFile
        };
    }

    async function getGoogleSyncState(db) {
        if (!db?.getSetting) return null;
        return await db.getSetting(GOOGLE_SYNC_STATE_KEY);
    }

    async function saveGoogleSyncState(db, patch) {
        if (!db?.setSetting) throw new Error('TimeWhereDB setting writer is required');
        const existing = (await getGoogleSyncState(db)) || {};
        const next = {
            ...existing,
            ...patch,
            updated_at: nowISO()
        };
        await db.setSetting(GOOGLE_SYNC_STATE_KEY, next);
        emitGoogleSyncEvent('timewhere-google-sync-state', next);
        return next;
    }

    function normalizeHistoryCount(value) {
        const number = Number(value || 0);
        return Number.isFinite(number) && number > 0 ? number : 0;
    }

    function normalizeHistoryReasonList(value) {
        const list = Array.isArray(value) ? value : [];
        const out = [];
        for (const item of list) {
            const text = sanitizeSyncHistoryText(item).slice(0, 48);
            if (text && !out.includes(text)) out.push(text);
        }
        return out.slice(0, 8);
    }

    function normalizeGoogleSyncHistoryEntry(entry = {}) {
        const startedAt = entry.started_at || entry.startedAt || nowISO();
        const finishedAt = entry.finished_at || entry.finishedAt || nowISO();
        const durationMs = entry.duration_ms != null
            ? normalizeHistoryCount(entry.duration_ms)
            : Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime() || 0);
        const status = String(entry.status || 'unknown').slice(0, 48);
        const reason = sanitizeSyncHistoryText(entry.reason || '');
        const error = entry.error && typeof entry.error === 'object'
            ? {
                reason: sanitizeSyncHistoryText(entry.error.reason || ''),
                http_status: entry.error.http_status || null,
                google_reason: sanitizeSyncHistoryText(entry.error.google_reason || ''),
                google_status: sanitizeSyncHistoryText(entry.error.google_status || ''),
                message: sanitizeSyncHistoryText(entry.error.message || entry.error.google_message || '')
            }
            : null;
        const counts = entry.counts && typeof entry.counts === 'object'
            ? {
                applied_local: normalizeHistoryCount(entry.counts.applied_local),
                uploaded: normalizeHistoryCount(entry.counts.uploaded),
                tombstones: normalizeHistoryCount(entry.counts.tombstones),
                entity_count: normalizeHistoryCount(entry.counts.entity_count),
                tombstone_count: normalizeHistoryCount(entry.counts.tombstone_count)
            }
            : {
                applied_local: normalizeHistoryCount(entry.applied_local),
                uploaded: normalizeHistoryCount(entry.uploaded),
                tombstones: normalizeHistoryCount(entry.tombstones),
                entity_count: normalizeHistoryCount(entry.entity_count),
                tombstone_count: normalizeHistoryCount(entry.tombstone_count)
            };
        const normalized = {
            id: entry.id || hashValue({
                started_at: startedAt,
                finished_at: finishedAt,
                status,
                trigger: entry.trigger || entry.source || 'unknown'
            }).slice(0, 16),
            started_at: startedAt,
            finished_at: finishedAt,
            duration_ms: durationMs,
            trigger: sanitizeSyncHistoryText(entry.trigger || entry.source || 'unknown').slice(0, 48),
            status,
            reason,
            retryable: entry.retryable === true,
            conflict_count: normalizeHistoryCount(entry.conflict_count),
            cloud_updated_at: entry.cloud_updated_at || null,
            queued_at: entry.queued_at || null,
            queue_wait_ms: normalizeHistoryCount(entry.queue_wait_ms),
            coalesced_pending: entry.coalesced_pending === true,
            coalesced_trigger_count: normalizeHistoryCount(entry.coalesced_trigger_count || entry.pending_trigger_count),
            coalesced_reasons: normalizeHistoryReasonList(entry.coalesced_reasons || entry.pending_reasons),
            long_running: entry.long_running === true,
            request_timeout_ms: normalizeHistoryCount(entry.request_timeout_ms),
            counts
        };
        if (error && (error.reason || error.http_status || error.google_reason || error.google_status || error.message)) {
            normalized.error = error;
        }
        return normalized;
    }

    async function getGoogleSyncHistory(db, options = {}) {
        const limit = Math.max(1, Math.min(Number(options.limit || GOOGLE_SYNC_HISTORY_LIMIT), GOOGLE_SYNC_HISTORY_LIMIT));
        const list = await getSettingValue(db, GOOGLE_SYNC_HISTORY_KEY, []);
        return Array.isArray(list) ? clone(list).slice(0, limit) : [];
    }

    async function appendGoogleSyncHistory(db, entry) {
        if (!db?.setSetting) throw new Error('TimeWhereDB setting writer is required');
        const normalized = normalizeGoogleSyncHistoryEntry(entry);
        const existing = await getSettingValue(db, GOOGLE_SYNC_HISTORY_KEY, []);
        const list = Array.isArray(existing) ? existing : [];
        const next = [normalized, ...list].slice(0, GOOGLE_SYNC_HISTORY_LIMIT);
        await setSettingValue(db, GOOGLE_SYNC_HISTORY_KEY, next);
        emitGoogleSyncEvent('timewhere-google-sync-history', { entry: normalized, history: next });
        return normalized;
    }

    async function clearGoogleSyncHistory(db) {
        await setSettingValue(db, GOOGLE_SYNC_HISTORY_KEY, []);
        emitGoogleSyncEvent('timewhere-google-sync-history', { history: [] });
        return { status: 'cleared' };
    }

    function conflictSideUpdatedAt(value = null) {
        return value?.updated_at || value?.record?.updated_at || value?.deleted_at || value?.last_synced_at || null;
    }

    function normalizeGoogleSyncConflict(conflict = {}, index = 0) {
        const copy = clone(conflict) || {};
        const key = copy.key || syncEntityKey(copy.table || 'unknown', copy.id ?? index);
        const type = copy.conflict_type || copy.reason || 'sync_conflict';
        const localUpdatedAt = conflictSideUpdatedAt(copy.local || copy.local_tombstone);
        const cloudUpdatedAt = conflictSideUpdatedAt(copy.cloud || copy.cloud_tombstone);
        const signature = hashValue({
            key,
            type,
            local_hash: copy.local?.hash || copy.local_tombstone?.last_synced_hash || localUpdatedAt || null,
            cloud_hash: copy.cloud?.hash || copy.cloud_tombstone?.last_synced_hash || cloudUpdatedAt || null
        }).slice(0, 16);
        return {
            ...copy,
            conflict_id: copy.conflict_id || `${key}:${type}:${signature}`,
            key,
            table: copy.table || splitEntityKey(key).table,
            id: copy.id ?? splitEntityKey(key).id,
            conflict_type: type,
            local_updated_at: copy.local_updated_at || localUpdatedAt,
            cloud_updated_at: copy.cloud_updated_at || cloudUpdatedAt,
            detected_at: copy.detected_at || nowISO()
        };
    }

    async function saveGoogleSyncConflicts(db, conflicts = [], patch = {}) {
        const list = Array.isArray(conflicts)
            ? conflicts.map((conflict, index) => normalizeGoogleSyncConflict(conflict, index))
            : [];
        await setSettingValue(db, GOOGLE_SYNC_CONFLICTS_KEY, list);
        if (list.length > 0) {
            return await saveGoogleSyncState(db, {
                ...patch,
                status: 'conflict',
                conflict_count: list.length,
                last_conflict_at: patch.last_conflict_at || nowISO()
            });
        }
        return await saveGoogleSyncState(db, {
            ...patch,
            status: patch.status || 'connected',
            conflict_count: 0
        });
    }

    async function backupToDrive(db, driveClient, options = {}) {
        const snapshot = await buildSnapshot(db, options);
        const manifest = createManifest(snapshot, options);
        const snapshotResult = await driveClient.uploadJsonFile(SNAPSHOT_FILE_NAME, snapshot);
        if (snapshotResult?.status === 'not_configured') return snapshotResult;
        await driveClient.uploadJsonFile(MANIFEST_FILE_NAME, manifest);
        await saveGoogleSyncState(db, {
            status: 'connected',
            last_backup_at: manifest.updated_at,
            last_snapshot_exported_at: snapshot.exported_at
        });
        return { status: 'uploaded', snapshot, manifest };
    }

    async function loadCloudSnapshot(driveClient) {
        const snapshot = await driveClient.downloadJsonFile(SNAPSHOT_FILE_NAME);
        if (!snapshot) return null;
        if (snapshot.status === 'not_configured') return snapshot;
        validateSnapshot(snapshot);
        return snapshot;
    }

    function entityFromRecord(table, record, meta = {}, deviceId = null) {
        const id = recordKey(table, record);
        if (id == null) return null;
        const key = syncEntityKey(table, id);
        const syncMeta = meta[key] || {};
        const cleanRecord = makeComparableRecordForSync(table, record, syncMeta);
        const hash = hashValue(cleanRecord);
        return {
            key,
            table,
            id: String(id),
            record: cleanRecord,
            hash,
            updated_at: record?.updated_at || syncMeta.updated_at || nowISO(),
            dirty: syncMeta.dirty !== false,
            last_synced_hash: syncMeta.last_synced_hash || null,
            source_device_id: syncMeta.source_device_id || deviceId || null
        };
    }

    async function buildLocalSyncDocument(db, options = {}) {
        if (!db) throw new Error('TimeWhereDB is required to build sync document');
        const deviceId = options.device_id || await getOrCreateDeviceId(db);
        const meta = await readSyncMeta(db);
        const tombstones = await readSyncTombstones(db);
        const snapshot = await buildSnapshot(db, { device_id: deviceId, exported_at: options.cloud_updated_at || nowISO() });
        const entities = {};

        for (const table of SNAPSHOT_TABLES) {
            for (const row of snapshot.data[table] || []) {
                const entity = entityFromRecord(table, row, meta, deviceId);
                if (entity) entities[entity.key] = entity;
            }
        }
        for (const [key, value] of Object.entries(snapshot.data.settings || {})) {
            const record = { key, value };
            const entity = entityFromRecord('settings', record, meta, deviceId);
            if (entity) entities[entity.key] = entity;
        }

        return {
            schema: SYNC_SCHEMA,
            version: 1,
            app: 'TimeWhere',
            device_id: deviceId,
            cloud_updated_at: options.cloud_updated_at || nowISO(),
            devices: {
                [deviceId]: {
                    device_id: deviceId,
                    last_seen_at: nowISO()
                }
            },
            entities,
            tombstones: clone(tombstones),
            manifest: {
                entity_count: Object.keys(entities).length,
                tombstone_count: Object.keys(tombstones).length,
                source: 'indexeddb'
            }
        };
    }

    function validateSyncDocument(doc) {
        if (!doc || typeof doc !== 'object') throw new Error('Invalid TimeWhere sync document');
        if (doc.schema !== SYNC_SCHEMA) throw new Error(`Unsupported sync schema: ${doc.schema || 'unknown'}`);
        if (!doc.entities || typeof doc.entities !== 'object' || Array.isArray(doc.entities)) {
            throw new Error('Sync document entities must be an object');
        }
        if (!doc.tombstones || typeof doc.tombstones !== 'object' || Array.isArray(doc.tombstones)) {
            throw new Error('Sync document tombstones must be an object');
        }
        return true;
    }

    function syncDocumentFromSnapshot(snapshot, options = {}) {
        validateSnapshot(snapshot);
        const deviceId = options.device_id || snapshot.device_id || `snapshot-${Date.now()}`;
        const entities = {};
        for (const table of SNAPSHOT_TABLES) {
            for (const row of snapshot.data[table] || []) {
                const entity = entityFromRecord(table, row, {}, deviceId);
                if (!entity) continue;
                entity.dirty = false;
                entity.last_synced_hash = entity.hash;
                entities[entity.key] = entity;
            }
        }
        for (const [key, value] of Object.entries(snapshot.data.settings || {})) {
            const entity = entityFromRecord('settings', { key, value }, {}, deviceId);
            if (!entity) continue;
            entity.dirty = false;
            entity.last_synced_hash = entity.hash;
            entities[entity.key] = entity;
        }
        return {
            schema: SYNC_SCHEMA,
            version: 1,
            app: 'TimeWhere',
            device_id: deviceId,
            cloud_updated_at: options.cloud_updated_at || snapshot.exported_at || nowISO(),
            devices: {
                [deviceId]: {
                    device_id: deviceId,
                    last_seen_at: snapshot.exported_at || nowISO()
                }
            },
            entities,
            tombstones: {},
            manifest: {
                entity_count: Object.keys(entities).length,
                tombstone_count: 0,
                migrated_from: SNAPSHOT_SCHEMA
            }
        };
    }

    async function loadCloudSyncDocument(driveClient, options = {}) {
        const syncDoc = await driveClient.downloadJsonFile(SYNC_FILE_NAME);
        if (syncDoc?.status === 'not_configured') return syncDoc;
        if (syncDoc) {
            validateSyncDocument(syncDoc);
            return syncDoc;
        }
        const snapshot = await loadCloudSnapshot(driveClient);
        if (!snapshot || snapshot.status === 'not_configured') return snapshot;
        return syncDocumentFromSnapshot(snapshot, options);
    }

    function addMergeChange(changes, change) {
        changes.push({
            key: change.key,
            table: change.table,
            id: change.id,
            action: change.action,
            local: clone(change.local),
            cloud: clone(change.cloud),
            tombstone: clone(change.tombstone),
            reason: change.reason || change.action
        });
    }

    function planSyncMerge(localDoc, cloudDoc) {
        validateSyncDocument(localDoc);
        if (!cloudDoc) {
            return {
                status: 'upload_required',
                base_cloud_updated_at: null,
                apply_local: [],
                upload_keys: Object.keys(localDoc.entities),
                upload_tombstones: Object.keys(localDoc.tombstones || {}),
                conflicts: [],
                changes: []
            };
        }
        validateSyncDocument(cloudDoc);

        const applyLocal = [];
        const uploadKeys = [];
        const uploadTombstones = [];
        const conflicts = [];
        const changes = [];
        const keys = new Set([
            ...Object.keys(localDoc.entities || {}),
            ...Object.keys(cloudDoc.entities || {}),
            ...Object.keys(localDoc.tombstones || {}),
            ...Object.keys(cloudDoc.tombstones || {})
        ]);

        for (const key of keys) {
            const local = localDoc.entities[key] || null;
            const cloud = cloudDoc.entities[key] || null;
            const localTombstone = localDoc.tombstones?.[key] || null;
            const cloudTombstone = cloudDoc.tombstones?.[key] || null;
            const { table, id } = local || cloud || localTombstone || cloudTombstone || splitEntityKey(key);
            const localDirty = local?.dirty === true;
            const lastSyncedHash = local?.last_synced_hash || localTombstone?.last_synced_hash || null;

            if (localTombstone) {
                if (!cloud || cloud.hash === lastSyncedHash) {
                    uploadTombstones.push(key);
                    addMergeChange(changes, { key, table, id, action: 'upload_delete', tombstone: localTombstone, cloud });
                } else {
                    const conflict = { key, table, id, conflict_type: 'delete_vs_remote_update', local_tombstone: clone(localTombstone), cloud: clone(cloud) };
                    conflicts.push(conflict);
                    addMergeChange(changes, { key, table, id, action: 'conflict', tombstone: localTombstone, cloud, reason: conflict.conflict_type });
                }
                continue;
            }

            if (cloudTombstone) {
                if (!local || !localDirty || local.hash === cloudTombstone.last_synced_hash) {
                    applyLocal.push({ key, table, id, action: 'delete_local', tombstone: clone(cloudTombstone) });
                    addMergeChange(changes, { key, table, id, action: 'apply_delete', local, tombstone: cloudTombstone });
                } else {
                    const conflict = { key, table, id, conflict_type: 'local_update_vs_remote_delete', local: clone(local), cloud_tombstone: clone(cloudTombstone) };
                    conflicts.push(conflict);
                    addMergeChange(changes, { key, table, id, action: 'conflict', local, tombstone: cloudTombstone, reason: conflict.conflict_type });
                }
                continue;
            }

            if (local && !cloud) {
                if (localDirty) {
                    uploadKeys.push(key);
                    addMergeChange(changes, { key, table, id, action: 'upload_local', local });
                } else {
                    applyLocal.push({ key, table, id, action: 'delete_local' });
                    addMergeChange(changes, { key, table, id, action: 'apply_missing_remote_delete', local });
                }
                continue;
            }

            if (!local && cloud) {
                applyLocal.push({ key, table, id, action: 'put_local', entity: clone(cloud) });
                addMergeChange(changes, { key, table, id, action: 'apply_cloud', cloud });
                continue;
            }

            if (!local || !cloud) continue;
            if (local.hash === cloud.hash) continue;

            const cloudChangedSinceSync = !lastSyncedHash || cloud.hash !== lastSyncedHash;
            if (localDirty && cloudChangedSinceSync) {
                if (table === 'daily_journals') {
                    const newer = chooseNewerDailyJournal(local.record, cloud.record);
                    if (newer === 'local') {
                        uploadKeys.push(key);
                        addMergeChange(changes, { key, table, id, action: 'upload_local', local, cloud, reason: 'daily_journal_newer_local' });
                        continue;
                    }
                    if (newer === 'cloud') {
                        applyLocal.push({ key, table, id, action: 'put_local', entity: clone(cloud) });
                        addMergeChange(changes, { key, table, id, action: 'apply_cloud', local, cloud, reason: 'daily_journal_newer_cloud' });
                        continue;
                    }
                }
                const conflict = { key, table, id, conflict_type: 'local_update_vs_remote_update', local: clone(local), cloud: clone(cloud) };
                conflicts.push(conflict);
                addMergeChange(changes, { key, table, id, action: 'conflict', local, cloud, reason: conflict.conflict_type });
            } else if (localDirty) {
                uploadKeys.push(key);
                addMergeChange(changes, { key, table, id, action: 'upload_local', local, cloud });
            } else {
                applyLocal.push({ key, table, id, action: 'put_local', entity: clone(cloud) });
                addMergeChange(changes, { key, table, id, action: 'apply_cloud', local, cloud });
            }
        }

        return {
            status: conflicts.length ? 'conflicts' : (changes.length ? 'changes' : 'up_to_date'),
            base_cloud_updated_at: cloudDoc.cloud_updated_at || null,
            apply_local: applyLocal,
            upload_keys: uploadKeys,
            upload_tombstones: uploadTombstones,
            conflicts,
            changes
        };
    }

    function mergedCloudDocument(localDoc, cloudDoc, mergePlan, options = {}) {
        validateSyncDocument(localDoc);
        const next = cloudDoc ? clone(cloudDoc) : {
            schema: SYNC_SCHEMA,
            version: 1,
            app: 'TimeWhere',
            cloud_updated_at: nowISO(),
            devices: {},
            entities: {},
            tombstones: {},
            manifest: {}
        };
        next.schema = SYNC_SCHEMA;
        next.version = 1;
        next.app = 'TimeWhere';
        next.devices = { ...(next.devices || {}), ...(localDoc.devices || {}) };
        next.entities = next.entities || {};
        next.tombstones = next.tombstones || {};

        for (const key of mergePlan.upload_keys || []) {
            if (localDoc.entities[key]) {
                const entity = clone(localDoc.entities[key]);
                entity.dirty = false;
                entity.last_synced_hash = entity.hash;
                next.entities[key] = entity;
                delete next.tombstones[key];
            }
        }
        for (const key of mergePlan.upload_tombstones || []) {
            if (localDoc.tombstones[key]) {
                next.tombstones[key] = clone(localDoc.tombstones[key]);
                delete next.entities[key];
            }
        }
        next.cloud_updated_at = options.cloud_updated_at || nowISO();
        next.manifest = {
            entity_count: Object.keys(next.entities).length,
            tombstone_count: Object.keys(next.tombstones).length,
            updated_at: next.cloud_updated_at
        };
        validateSyncDocument(next);
        return next;
    }

    async function putEntityToLocal(db, entity, options = {}) {
        if (!entity) return null;
        if (entity.table === 'settings') {
            await setSettingValue(db, entity.id, clone(entity.record.value));
            if (!options.skipMeta) await markEntityClean(db, entity);
            return entity.record;
        }
        const table = getTableAdapter(db, entity.table);
        if (!table) throw new Error(`Cannot write ${entity.table}`);
        let nextRecord = clone(entity.record);
        if (entity.table === 'tasks') {
            const meta = await readSyncMeta(db);
            const localRecord = typeof table.get === 'function' ? await table.get(entity.id) : null;
            nextRecord = mergeRecordWithActiveDerivedFields(entity.table, nextRecord, localRecord, meta[entity.key] || {});
        }
        await table.put(nextRecord);
        if (!options.skipMeta) await markEntityClean(db, entity);
        return nextRecord;
    }

    async function deleteEntityFromLocal(db, tableName, id, options = {}) {
        if (tableName === 'settings') {
            await setSettingValue(db, id, null);
        } else {
            const table = getTableAdapter(db, tableName);
            if (!table || typeof table.delete !== 'function') throw new Error(`Cannot delete ${tableName}`);
            await table.delete(id);
        }
        if (!options.skipMeta) {
            const meta = await readSyncMeta(db);
            delete meta[syncEntityKey(tableName, id)];
            await writeSyncMeta(db, meta);
        }
    }

    async function markEntityClean(db, entity) {
        const meta = await readSyncMeta(db);
        const previous = meta[entity.key] || {};
        const derivedFields = refreshDerivedFieldBaseValues(previous.derived_fields, entity);
        const next = {
            table: entity.table,
            id: entity.id,
            dirty: false,
            hash: entity.hash,
            last_synced_hash: entity.hash,
            last_synced_at: nowISO(),
            source_device_id: entity.source_device_id || null
        };
        if (hasDerivedFields(derivedFields)) next.derived_fields = derivedFields;
        meta[entity.key] = next;
        await writeSyncMeta(db, meta);
    }

    async function applyMergePlanToLocal(db, mergePlan, cloudDoc) {
        const applied = [];
        for (const change of mergePlan.apply_local || []) {
            if (change.action === 'put_local') {
                await putEntityToLocal(db, change.entity);
                applied.push(change.key);
            } else if (change.action === 'delete_local') {
                await deleteEntityFromLocal(db, change.table, change.id);
                applied.push(change.key);
            }
        }
        if (cloudDoc) {
            const tombstones = await readSyncTombstones(db);
            for (const [key, tombstone] of Object.entries(cloudDoc.tombstones || {})) {
                tombstones[key] = clone(tombstone);
            }
            await writeSyncTombstones(db, tombstones);
        }
        return { status: 'applied', applied_count: applied.length, applied };
    }

    function syncHistoryCountsFromPlan(mergePlan = {}, uploadDoc = null) {
        return {
            applied_local: Array.isArray(mergePlan.apply_local) ? mergePlan.apply_local.length : 0,
            uploaded: Array.isArray(mergePlan.upload_keys) ? mergePlan.upload_keys.length : 0,
            tombstones: Array.isArray(mergePlan.upload_tombstones) ? mergePlan.upload_tombstones.length : 0,
            entity_count: normalizeHistoryCount(uploadDoc?.manifest?.entity_count),
            tombstone_count: normalizeHistoryCount(uploadDoc?.manifest?.tombstone_count)
        };
    }

    async function markUploadedEntitiesClean(db, uploadDoc, mergePlan) {
        const meta = await readSyncMeta(db);
        const tombstones = await readSyncTombstones(db);
        const syncedAt = nowISO();
        for (const key of mergePlan.upload_keys || []) {
            const entity = uploadDoc.entities[key];
            if (!entity) continue;
            const derivedFields = refreshDerivedFieldBaseValues(meta[key]?.derived_fields, entity);
            const next = {
                table: entity.table,
                id: entity.id,
                dirty: false,
                hash: entity.hash,
                last_synced_hash: entity.hash,
                last_synced_at: syncedAt,
                source_device_id: entity.source_device_id || null
            };
            if (hasDerivedFields(derivedFields)) next.derived_fields = derivedFields;
            meta[key] = next;
        }
        for (const key of mergePlan.upload_tombstones || []) {
            if (tombstones[key]) tombstones[key].last_synced_at = syncedAt;
        }
        await writeSyncMeta(db, meta);
        await writeSyncTombstones(db, tombstones);
    }

    async function runAutoSync(db, driveClient, options = {}) {
        const startedAt = nowISO();
        const trigger = options.sync_trigger || options.reason || (options.force ? 'manual' : 'auto');
        const startedMs = Date.now();
        const queuedAt = options.queued_at || null;
        const queuedTime = queuedAt ? new Date(queuedAt).getTime() : NaN;
        const historyRunContext = {
            queued_at: queuedAt,
            queue_wait_ms: Number.isFinite(queuedTime) ? Math.max(0, startedMs - queuedTime) : normalizeHistoryCount(options.queue_wait_ms),
            coalesced_pending: options.coalesced_pending === true,
            coalesced_trigger_count: normalizeHistoryCount(options.pending_trigger_count || options.coalesced_trigger_count),
            coalesced_reasons: normalizeHistoryReasonList(options.pending_reasons || options.coalesced_reasons),
            request_timeout_ms: normalizeHistoryCount(options.request_timeout_ms || DEFAULT_DRIVE_REQUEST_TIMEOUT_MS)
        };
        async function finishHistory(status, extra = {}) {
            return await appendGoogleSyncHistory(db, {
                started_at: startedAt,
                finished_at: nowISO(),
                duration_ms: Date.now() - startedMs,
                trigger,
                ...historyRunContext,
                long_running: (Date.now() - startedMs) >= 90 * 1000,
                status,
                ...extra
            });
        }
        try {
            await setSettingValue(db, GOOGLE_SYNC_LAST_RUN_KEY, startedAt);
            await saveGoogleSyncState(db, { status: 'syncing', last_run_at: startedAt });
            const localDoc = await buildLocalSyncDocument(db, options);
            const cloudDoc = await loadCloudSyncDocument(driveClient, { device_id: localDoc.device_id });
            if (cloudDoc?.status === 'not_configured') {
                await finishHistory('not_configured', { reason: cloudDoc.reason || 'not_configured' });
                return cloudDoc;
            }
            const mergePlan = planSyncMerge(localDoc, cloudDoc);

            if (mergePlan.conflicts.length > 0) {
                await saveGoogleSyncConflicts(db, mergePlan.conflicts);
                await finishHistory('conflict', {
                    conflict_count: mergePlan.conflicts.length,
                    counts: syncHistoryCountsFromPlan(mergePlan),
                    cloud_updated_at: cloudDoc?.cloud_updated_at || null
                });
                return { status: 'conflict', mergePlan, conflicts: mergePlan.conflicts };
            }

            if (mergePlan.apply_local.length > 0) {
                await applyMergePlanToLocal(db, mergePlan, cloudDoc);
            }

            if (mergePlan.apply_local.length === 0 && mergePlan.upload_keys.length === 0 && mergePlan.upload_tombstones.length === 0) {
                const successAt = nowISO();
                await saveGoogleSyncConflicts(db, [], { status: 'connected', last_success_at: successAt });
                await finishHistory('up_to_date', {
                    counts: syncHistoryCountsFromPlan(mergePlan),
                    cloud_updated_at: cloudDoc?.cloud_updated_at || successAt
                });
                return { status: 'up_to_date', mergePlan };
            }

            const localAfterApply = await buildLocalSyncDocument(db, options);
            const verifyCloudDoc = await loadCloudSyncDocument(driveClient, { device_id: localAfterApply.device_id });
            if (verifyCloudDoc?.status === 'not_configured') {
                await finishHistory('not_configured', { reason: verifyCloudDoc.reason || 'not_configured' });
                return verifyCloudDoc;
            }
            const verifyStamp = verifyCloudDoc?.cloud_updated_at || null;
            if ((mergePlan.base_cloud_updated_at || null) !== verifyStamp && cloudDoc) {
                await saveGoogleSyncState(db, { status: 'pending_retry', reason: 'cloud_changed_during_sync' });
                await finishHistory('pending_retry', {
                    reason: 'cloud_changed_during_sync',
                    counts: syncHistoryCountsFromPlan(mergePlan),
                    cloud_updated_at: verifyStamp
                });
                return { status: 'stale_cloud_retry', reason: 'cloud_changed_during_sync' };
            }

            const uploadMergePlan = planSyncMerge(localAfterApply, verifyCloudDoc || cloudDoc);
            const uploadDoc = mergedCloudDocument(localAfterApply, verifyCloudDoc || cloudDoc, uploadMergePlan, options);
            const uploadResult = await driveClient.uploadJsonFile(SYNC_FILE_NAME, uploadDoc);
            if (uploadResult?.status === 'not_configured') {
                await finishHistory('not_configured', { reason: uploadResult.reason || 'not_configured' });
                return uploadResult;
            }
            await markUploadedEntitiesClean(db, uploadDoc, uploadMergePlan);
            await setSettingValue(db, GOOGLE_SYNC_LAST_SUCCESS_KEY, uploadDoc.cloud_updated_at);
            await saveGoogleSyncConflicts(db, [], {
                status: 'connected',
                last_success_at: uploadDoc.cloud_updated_at,
                last_sync_entity_count: uploadDoc.manifest.entity_count,
                last_sync_tombstone_count: uploadDoc.manifest.tombstone_count
            });
            await finishHistory('synced', {
                counts: syncHistoryCountsFromPlan({
                    apply_local: mergePlan.apply_local,
                    upload_keys: uploadMergePlan.upload_keys,
                    upload_tombstones: uploadMergePlan.upload_tombstones
                }, uploadDoc),
                cloud_updated_at: uploadDoc.cloud_updated_at
            });
            return { status: 'synced', mergePlan, uploadDoc, uploadResult };
        } catch (error) {
            const syncError = serializeSyncError(error);
            await finishHistory('failed', {
                reason: syncError.reason,
                retryable: syncError.retryable,
                error: syncError
            });
            throw error;
        }
    }

    async function shouldRunAutoSync(db, options = {}) {
        const force = options.force === true;
        if (force) return true;
        const state = await getGoogleSyncState(db);
        if (state?.status !== 'connected' && state?.status !== 'conflict' && state?.status !== 'pending_retry') return false;
        const lastRun = await getSettingValue(db, GOOGLE_SYNC_LAST_RUN_KEY, null);
        if (!lastRun) return true;
        return Date.now() - new Date(lastRun).getTime() >= (options.throttle_ms ?? AUTO_SYNC_THROTTLE_MS);
    }

    async function maybeRunAutoSync(db, driveClient, options = {}) {
        if (!await shouldRunAutoSync(db, options)) {
            return { status: 'throttled' };
        }
        try {
            return await runAutoSync(db, driveClient, options);
        } catch (error) {
            const syncError = serializeSyncError(error);
            await saveGoogleSyncState(db, {
                status: 'failed',
                reason: syncError.reason,
                last_error: syncError.message,
                last_failed_at: nowISO(),
                last_http_status: syncError.http_status,
                last_google_reason: syncError.google_reason,
                last_google_status: syncError.google_status,
                last_google_message: syncError.google_message,
                last_auth_error_subtype: syncError.auth_error_subtype,
                last_oauth_diagnostics: syncError.oauth_diagnostics,
                retryable: syncError.retryable
            });
            throw error;
        }
    }

    function createDefaultDriveClient() {
        const authAdapter = global.TimeWherePlatform?.auth?.getGoogleToken
            ? createTimeWherePlatformAuthAdapter(global.TimeWherePlatform)
            : createChromeIdentityAuthAdapter(typeof chrome !== 'undefined' ? chrome : null);
        return createDriveAppDataClient({ authAdapter });
    }

    function getPlatformSyncService() {
        const service = global.TimeWherePlatform?.name === 'desktop-electron'
            ? global.TimeWhereDesktopSyncService
            : (global.TimeWherePlatform?.name === 'chrome-extension' ? global.TimeWhereChromeSyncService : null);
        return service && typeof service.requestRun === 'function' ? service : null;
    }

    async function runPageAutoSync(db, options = {}) {
        const service = getPlatformSyncService();
        if (service && !options.bypassPlatformSyncService && !options.bypassDesktopSyncService) {
            return await service.requestRun({
                reason: options.reason || 'page_open',
                force: options.force === true
            });
        }
        const driveClient = options.driveClient || createDefaultDriveClient();
        return await maybeRunAutoSync(db, driveClient, options);
    }

    let saveDebounceTimer = null;
    function scheduleAutoSync(db, driveClientFactory, options = {}) {
        if (!db || typeof driveClientFactory !== 'function') return { status: 'not_scheduled' };
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = setTimeout(async () => {
            try {
                const driveClient = driveClientFactory();
                await maybeRunAutoSync(db, driveClient, { ...options, force: true });
            } catch (_) {
                // Non-blocking background save sync. Status is persisted by maybeRunAutoSync.
            }
        }, options.debounce_ms ?? SAVE_DEBOUNCE_MS);
        return { status: 'scheduled' };
    }

    function schedulePageAutoSync(db, options = {}) {
        const service = getPlatformSyncService();
        if (service && !options.bypassPlatformSyncService && !options.bypassDesktopSyncService && typeof service.scheduleRun === 'function') {
            return service.scheduleRun({
                reason: options.reason || 'local_write',
                debounce_ms: options.debounce_ms ?? SAVE_DEBOUNCE_MS,
                force: true
            });
        }
        return scheduleAutoSync(db, () => createDefaultDriveClient(), options);
    }

    async function forceUploadLocalToCloud(db, driveClient, options = {}) {
        const startedAt = nowISO();
        const startedMs = Date.now();
        try {
            const localDoc = await buildLocalSyncDocument(db, options);
            const uploadDoc = {
                ...localDoc,
                cloud_updated_at: nowISO(),
                manifest: {
                    entity_count: Object.keys(localDoc.entities).length,
                    tombstone_count: Object.keys(localDoc.tombstones || {}).length,
                    force: 'local_over_cloud'
                }
            };
            const result = await driveClient.uploadJsonFile(SYNC_FILE_NAME, uploadDoc);
            if (result?.status === 'not_configured') {
                await appendGoogleSyncHistory(db, {
                    started_at: startedAt,
                    finished_at: nowISO(),
                    duration_ms: Date.now() - startedMs,
                    trigger: options.sync_trigger || options.reason || 'force_upload',
                    status: 'not_configured',
                    reason: result.reason || 'not_configured'
                });
                return result;
            }
            const mergePlan = {
                upload_keys: Object.keys(uploadDoc.entities),
                upload_tombstones: Object.keys(uploadDoc.tombstones || {})
            };
            await markUploadedEntitiesClean(db, uploadDoc, mergePlan);
            await saveGoogleSyncConflicts(db, [], { status: 'connected', last_force_upload_at: uploadDoc.cloud_updated_at });
            await appendGoogleSyncHistory(db, {
                started_at: startedAt,
                finished_at: nowISO(),
                duration_ms: Date.now() - startedMs,
                trigger: options.sync_trigger || options.reason || 'force_upload',
                status: 'force_uploaded',
                counts: syncHistoryCountsFromPlan(mergePlan, uploadDoc),
                cloud_updated_at: uploadDoc.cloud_updated_at
            });
            return { status: 'uploaded', uploadDoc, result };
        } catch (error) {
            const syncError = serializeSyncError(error);
            await appendGoogleSyncHistory(db, {
                started_at: startedAt,
                finished_at: nowISO(),
                duration_ms: Date.now() - startedMs,
                trigger: options.sync_trigger || options.reason || 'force_upload',
                status: 'failed',
                reason: syncError.reason,
                retryable: syncError.retryable,
                error: syncError
            });
            throw error;
        }
    }

    async function forceRestoreCloudToLocal(db, driveClient, options = {}) {
        const startedAt = nowISO();
        const startedMs = Date.now();
        try {
            const cloudDoc = await loadCloudSyncDocument(driveClient, options);
            if (!cloudDoc || cloudDoc.status === 'not_configured') {
                const status = cloudDoc?.status || 'no_cloud_sync_document';
                await appendGoogleSyncHistory(db, {
                    started_at: startedAt,
                    finished_at: nowISO(),
                    duration_ms: Date.now() - startedMs,
                    trigger: options.sync_trigger || options.reason || 'force_restore',
                    status,
                    reason: cloudDoc?.reason || status
                });
                return cloudDoc || { status: 'no_cloud_sync_document' };
            }
            const mergePlan = {
                apply_local: [
                    ...Object.values(cloudDoc.entities || {}).map(entity => ({ key: entity.key, table: entity.table, id: entity.id, action: 'put_local', entity })),
                    ...Object.values(cloudDoc.tombstones || {}).map(tombstone => ({ key: syncEntityKey(tombstone.table, tombstone.id), table: tombstone.table, id: tombstone.id, action: 'delete_local', tombstone }))
                ]
            };
            await applyMergePlanToLocal(db, mergePlan, cloudDoc);
            await saveGoogleSyncConflicts(db, [], { status: 'connected', last_restore_at: nowISO() });
            await appendGoogleSyncHistory(db, {
                started_at: startedAt,
                finished_at: nowISO(),
                duration_ms: Date.now() - startedMs,
                trigger: options.sync_trigger || options.reason || 'force_restore',
                status: 'restored',
                counts: syncHistoryCountsFromPlan(mergePlan, cloudDoc),
                cloud_updated_at: cloudDoc.cloud_updated_at || null
            });
            return { status: 'restored', applied_count: mergePlan.apply_local.length };
        } catch (error) {
            const syncError = serializeSyncError(error);
            await appendGoogleSyncHistory(db, {
                started_at: startedAt,
                finished_at: nowISO(),
                duration_ms: Date.now() - startedMs,
                trigger: options.sync_trigger || options.reason || 'force_restore',
                status: 'failed',
                reason: syncError.reason,
                retryable: syncError.retryable,
                error: syncError
            });
            throw error;
        }
    }

    async function resolveSyncConflicts(db, driveClient, conflicts = [], choices = {}, options = {}) {
        const applied = [];
        for (const conflict of conflicts || []) {
            const choice = choices[conflict.conflict_id] || choices[conflict.key] || 'skip';
            if (choice === 'skip') continue;
            if (choice === 'cloud') {
                if (conflict.cloud) {
                    await putEntityToLocal(db, conflict.cloud);
                    applied.push(conflict.key);
                } else if (conflict.cloud_tombstone) {
                    await deleteEntityFromLocal(db, conflict.table, conflict.id);
                    applied.push(conflict.key);
                }
            } else if (choice === 'local') {
                if (conflict.local) {
                    await markEntityDirty(db, conflict.table, conflict.id, conflict.local.record, options);
                    applied.push(conflict.key);
                } else if (conflict.local_tombstone) {
                    await markEntityDeleted(db, conflict.table, conflict.id, { id: conflict.id }, options);
                    applied.push(conflict.key);
                }
            }
        }
        const remaining = (conflicts || []).filter(conflict => !applied.includes(conflict.key));
        if (remaining.length > 0) {
            await saveGoogleSyncConflicts(db, remaining);
            await appendGoogleSyncHistory(db, {
                trigger: options.sync_trigger || options.reason || 'resolve_conflicts',
                status: 'conflict_remaining',
                conflict_count: remaining.length,
                counts: { applied_local: applied.length }
            });
            return {
                status: 'conflict_remaining',
                resolved_count: applied.length,
                applied_count: applied.length,
                remaining_count: remaining.length,
                conflicts: remaining.map((conflict, index) => normalizeGoogleSyncConflict(conflict, index))
            };
        }
        await saveGoogleSyncConflicts(db, [], { status: 'connected' });
        const result = await runAutoSync(db, driveClient, { ...options, force: true });
        if (result?.status === 'conflict') {
            await appendGoogleSyncHistory(db, {
                trigger: options.sync_trigger || options.reason || 'resolve_conflicts',
                status: 'conflict_remaining',
                conflict_count: result.conflicts?.length || 0,
                counts: { applied_local: applied.length }
            });
            return {
                status: 'conflict_remaining',
                resolved_count: applied.length,
                applied_count: applied.length,
                remaining_count: result.conflicts?.length || 0,
                conflicts: result.conflicts || [],
                sync_result: result
            };
        }
        await appendGoogleSyncHistory(db, {
            trigger: options.sync_trigger || options.reason || 'resolve_conflicts',
            status: 'resolved',
            conflict_count: 0,
            counts: { applied_local: applied.length },
            cloud_updated_at: result?.uploadDoc?.cloud_updated_at || null
        });
        return {
            status: 'resolved',
            resolved_count: applied.length,
            applied_count: applied.length,
            remaining_count: 0,
            conflicts: [],
            sync_result: result
        };
    }

    const api = {
        SNAPSHOT_SCHEMA,
        MANIFEST_SCHEMA,
        SYNC_SCHEMA,
        SNAPSHOT_FILE_NAME,
        MANIFEST_FILE_NAME,
        SYNC_FILE_NAME,
        GOOGLE_SYNC_STATE_KEY,
        GOOGLE_SYNC_META_KEY,
        GOOGLE_SYNC_TOMBSTONES_KEY,
        GOOGLE_SYNC_DEVICE_ID_KEY,
        GOOGLE_SYNC_CONFLICTS_KEY,
        GOOGLE_SYNC_PENDING_KEY,
        GOOGLE_SYNC_LAST_RUN_KEY,
        GOOGLE_SYNC_LAST_SUCCESS_KEY,
        GOOGLE_SYNC_ACCOUNT_EMAIL_KEY,
        GOOGLE_SYNC_ACCOUNT_NAME_KEY,
        GOOGLE_SYNC_ACCOUNT_KEY_KEY,
        GOOGLE_SYNC_ACCOUNT_PICTURE_KEY,
        GOOGLE_SYNC_HISTORY_KEY,
        DESKTOP_WORK_REMINDER_STATE_KEY,
        GOOGLE_SYNC_HISTORY_LIMIT,
        AUTO_SYNC_THROTTLE_MS,
        SAVE_DEBOUNCE_MS,
        DEFAULT_DRIVE_REQUEST_TIMEOUT_MS,
        SNAPSHOT_TABLES: SNAPSHOT_TABLES.slice(),
        SELECTED_SETTING_KEYS: SELECTED_SETTING_KEYS.slice(),
        EXCLUDED_SETTING_KEYS,
        stableJson,
        hashValue,
        syncEntityKey,
        markEntityDirty,
        markEntityDeleted,
        readSyncMeta,
        readSyncTombstones,
        pickSelectedSettings,
        buildSnapshot,
        validateSnapshot,
        applySnapshot,
        computeSyncPreview,
        applyCloudChoicesToLocal,
        buildUploadSnapshotFromChoices,
        createManifest,
        createChromeIdentityAuthAdapter,
        createTimeWherePlatformAuthAdapter,
        createDriveAppDataClient,
        getGoogleSyncState,
        saveGoogleSyncState,
        appendGoogleSyncHistory,
        getGoogleSyncHistory,
        clearGoogleSyncHistory,
        saveGoogleSyncConflicts,
        normalizeGoogleSyncConflict,
        serializeSyncError,
        backupToDrive,
        loadCloudSnapshot,
        buildLocalSyncDocument,
        validateSyncDocument,
        syncDocumentFromSnapshot,
        loadCloudSyncDocument,
        planSyncMerge,
        mergedCloudDocument,
        applyMergePlanToLocal,
        runAutoSync,
        shouldRunAutoSync,
        maybeRunAutoSync,
        createDefaultDriveClient,
        runPageAutoSync,
        scheduleAutoSync,
        schedulePageAutoSync,
        forceUploadLocalToCloud,
        forceRestoreCloudToLocal,
        resolveSyncConflicts
    };

    global.TimeWhereGoogleSync = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);


