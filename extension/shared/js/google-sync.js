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
    const AUTO_SYNC_THROTTLE_MS = 60 * 1000;
    const SAVE_DEBOUNCE_MS = 30 * 1000;

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
        GOOGLE_SYNC_LAST_RUN_KEY,
        GOOGLE_SYNC_LAST_SUCCESS_KEY
    ]);

    function nowISO() {
        return new Date().toISOString();
    }

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
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
        meta[key] = {
            ...previous,
            table,
            id: String(id),
            dirty: true,
            hash: hashValue(comparableRecord(record)),
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
            last_synced_hash: meta[key]?.last_synced_hash || hashValue(comparableRecord(record)),
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
                    connected: info?.connected === true
                };
            },
            async disconnect() {
                if (typeof platform?.auth?.revokeGoogleToken !== 'function') return { status: 'disconnected' };
                await platform.auth.revokeGoogleToken();
                return { status: 'disconnected' };
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
            let detail = '';
            try { detail = await response.text(); } catch (_) { detail = ''; }
            throw new Error(`Google Drive request failed (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ''}`);
        }
        if (response.status === 204) return null;
        return await response.json();
    }

    function createDriveAppDataClient({ authAdapter, fetchImpl = global.fetch } = {}) {
        if (!authAdapter) throw new Error('authAdapter is required');
        if (!fetchImpl) throw new Error('fetch implementation is required');

        function makeAuthUnavailableError(auth = {}) {
            const reason = auth.reason || auth.status || 'google_auth_unavailable';
            const error = new Error(auth.message || `Google authorization unavailable: ${reason}`);
            error.code = reason;
            error.reason = reason;
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
            const response = await fetchImpl(url, {
                ...options,
                headers: {
                    ...(options.headers || {}),
                    ...authHeader
                }
            });
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
        return next;
    }

    async function saveGoogleSyncConflicts(db, conflicts = [], patch = {}) {
        const list = Array.isArray(conflicts) ? clone(conflicts) : [];
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
        const cleanRecord = comparableRecord(record);
        const hash = hashValue(cleanRecord);
        const syncMeta = meta[key] || {};
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
        await table.put(clone(entity.record));
        if (!options.skipMeta) await markEntityClean(db, entity);
        return entity.record;
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
        meta[entity.key] = {
            table: entity.table,
            id: entity.id,
            dirty: false,
            hash: entity.hash,
            last_synced_hash: entity.hash,
            last_synced_at: nowISO(),
            source_device_id: entity.source_device_id || null
        };
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

    async function markUploadedEntitiesClean(db, uploadDoc, mergePlan) {
        const meta = await readSyncMeta(db);
        const tombstones = await readSyncTombstones(db);
        const syncedAt = nowISO();
        for (const key of mergePlan.upload_keys || []) {
            const entity = uploadDoc.entities[key];
            if (!entity) continue;
            meta[key] = {
                table: entity.table,
                id: entity.id,
                dirty: false,
                hash: entity.hash,
                last_synced_hash: entity.hash,
                last_synced_at: syncedAt,
                source_device_id: entity.source_device_id || null
            };
        }
        for (const key of mergePlan.upload_tombstones || []) {
            if (tombstones[key]) tombstones[key].last_synced_at = syncedAt;
        }
        await writeSyncMeta(db, meta);
        await writeSyncTombstones(db, tombstones);
    }

    async function runAutoSync(db, driveClient, options = {}) {
        const startedAt = nowISO();
        await setSettingValue(db, GOOGLE_SYNC_LAST_RUN_KEY, startedAt);
        await saveGoogleSyncState(db, { status: 'syncing', last_run_at: startedAt });
        const localDoc = await buildLocalSyncDocument(db, options);
        const cloudDoc = await loadCloudSyncDocument(driveClient, { device_id: localDoc.device_id });
        if (cloudDoc?.status === 'not_configured') return cloudDoc;
        const mergePlan = planSyncMerge(localDoc, cloudDoc);

        if (mergePlan.conflicts.length > 0) {
            await saveGoogleSyncConflicts(db, mergePlan.conflicts);
            return { status: 'conflict', mergePlan, conflicts: mergePlan.conflicts };
        }

        if (mergePlan.apply_local.length > 0) {
            await applyMergePlanToLocal(db, mergePlan, cloudDoc);
        }

        if (mergePlan.apply_local.length === 0 && mergePlan.upload_keys.length === 0 && mergePlan.upload_tombstones.length === 0) {
            await saveGoogleSyncConflicts(db, [], { status: 'connected', last_success_at: nowISO() });
            return { status: 'up_to_date', mergePlan };
        }

        const localAfterApply = await buildLocalSyncDocument(db, options);
        const verifyCloudDoc = await loadCloudSyncDocument(driveClient, { device_id: localAfterApply.device_id });
        if (verifyCloudDoc?.status === 'not_configured') return verifyCloudDoc;
        const verifyStamp = verifyCloudDoc?.cloud_updated_at || null;
        if ((mergePlan.base_cloud_updated_at || null) !== verifyStamp && cloudDoc) {
            await saveGoogleSyncState(db, { status: 'pending_retry', reason: 'cloud_changed_during_sync' });
            return { status: 'stale_cloud_retry', reason: 'cloud_changed_during_sync' };
        }

        const uploadDoc = mergedCloudDocument(localAfterApply, verifyCloudDoc || cloudDoc, planSyncMerge(localAfterApply, verifyCloudDoc || cloudDoc), options);
        const uploadResult = await driveClient.uploadJsonFile(SYNC_FILE_NAME, uploadDoc);
        if (uploadResult?.status === 'not_configured') return uploadResult;
        await markUploadedEntitiesClean(db, uploadDoc, planSyncMerge(localAfterApply, verifyCloudDoc || cloudDoc));
        await setSettingValue(db, GOOGLE_SYNC_LAST_SUCCESS_KEY, uploadDoc.cloud_updated_at);
        await saveGoogleSyncConflicts(db, [], {
            status: 'connected',
            last_success_at: uploadDoc.cloud_updated_at,
            last_sync_entity_count: uploadDoc.manifest.entity_count,
            last_sync_tombstone_count: uploadDoc.manifest.tombstone_count
        });
        return { status: 'synced', mergePlan, uploadDoc, uploadResult };
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
            await saveGoogleSyncState(db, {
                status: 'failed',
                last_error: error.message,
                last_failed_at: nowISO()
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

    async function runPageAutoSync(db, options = {}) {
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
        return scheduleAutoSync(db, () => createDefaultDriveClient(), options);
    }

    async function forceUploadLocalToCloud(db, driveClient, options = {}) {
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
        if (result?.status === 'not_configured') return result;
        const mergePlan = {
            upload_keys: Object.keys(uploadDoc.entities),
            upload_tombstones: Object.keys(uploadDoc.tombstones || {})
        };
        await markUploadedEntitiesClean(db, uploadDoc, mergePlan);
        await saveGoogleSyncConflicts(db, [], { status: 'connected', last_force_upload_at: uploadDoc.cloud_updated_at });
        return { status: 'uploaded', uploadDoc, result };
    }

    async function forceRestoreCloudToLocal(db, driveClient, options = {}) {
        const cloudDoc = await loadCloudSyncDocument(driveClient, options);
        if (!cloudDoc || cloudDoc.status === 'not_configured') return cloudDoc || { status: 'no_cloud_sync_document' };
        const mergePlan = {
            apply_local: [
                ...Object.values(cloudDoc.entities || {}).map(entity => ({ key: entity.key, table: entity.table, id: entity.id, action: 'put_local', entity })),
                ...Object.values(cloudDoc.tombstones || {}).map(tombstone => ({ key: syncEntityKey(tombstone.table, tombstone.id), table: tombstone.table, id: tombstone.id, action: 'delete_local', tombstone }))
            ]
        };
        await applyMergePlanToLocal(db, mergePlan, cloudDoc);
        await saveGoogleSyncConflicts(db, [], { status: 'connected', last_restore_at: nowISO() });
        return { status: 'restored', applied_count: mergePlan.apply_local.length };
    }

    async function resolveSyncConflicts(db, driveClient, conflicts = [], choices = {}, options = {}) {
        const applied = [];
        for (const conflict of conflicts || []) {
            const choice = choices[conflict.key] || 'skip';
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
            return { status: 'conflict_remaining', applied_count: applied.length, remaining_count: remaining.length };
        }
        await saveGoogleSyncConflicts(db, [], { status: 'connected' });
        const result = await runAutoSync(db, driveClient, { ...options, force: true });
        return { status: 'resolved', applied_count: applied.length, sync_result: result };
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
        AUTO_SYNC_THROTTLE_MS,
        SAVE_DEBOUNCE_MS,
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
        saveGoogleSyncConflicts,
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
