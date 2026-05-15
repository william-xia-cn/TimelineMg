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
    const SNAPSHOT_FILE_NAME = 'timewhere-snapshot-v1.json';
    const MANIFEST_FILE_NAME = 'timewhere-sync-manifest.json';
    const GOOGLE_SYNC_STATE_KEY = 'google_sync_state';

    const SNAPSHOT_TABLES = [
        'plans',
        'buckets',
        'labels',
        'tasks',
        'containers',
        'events',
        'habits'
    ];

    const SELECTED_SETTING_KEYS = [
        'matrixview_subject_mappings',
        'managebac_subject_mappings',
        'managebac_ics_config',
        GOOGLE_SYNC_STATE_KEY
    ];

    const EXCLUDED_SETTING_KEYS = new Set([
        'access_token',
        'refresh_token',
        'google_email',
        'management_review_pending',
        'managebac_pending_event_mappings',
        'matrixview_last_import_raw',
        'managebac_last_import_raw',
        'raw_import_file',
        'raw_import_files'
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

        async function getAuthHeader() {
            const auth = await authAdapter.getToken({ interactive: false });
            if (auth.status === 'not_configured') return auth;
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

    const api = {
        SNAPSHOT_SCHEMA,
        MANIFEST_SCHEMA,
        SNAPSHOT_FILE_NAME,
        MANIFEST_FILE_NAME,
        GOOGLE_SYNC_STATE_KEY,
        SNAPSHOT_TABLES: SNAPSHOT_TABLES.slice(),
        SELECTED_SETTING_KEYS: SELECTED_SETTING_KEYS.slice(),
        EXCLUDED_SETTING_KEYS,
        pickSelectedSettings,
        buildSnapshot,
        validateSnapshot,
        applySnapshot,
        computeSyncPreview,
        applyCloudChoicesToLocal,
        buildUploadSnapshotFromChoices,
        createManifest,
        createChromeIdentityAuthAdapter,
        createDriveAppDataClient,
        getGoogleSyncState,
        saveGoogleSyncState,
        backupToDrive,
        loadCloudSnapshot
    };

    global.TimeWhereGoogleSync = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
