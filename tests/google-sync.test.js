/**
 * Google data sync foundation tests.
 * Run: node tests/google-sync.test.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const GoogleSync = require('../extension/shared/js/google-sync.js');
const GoogleSyncStatusUI = require('../extension/shared/js/google-sync-status-ui.js');
const SyncRuntimeService = require('../extension/shared/js/sync-runtime-service.js');
const { createChromeSyncService } = require('../extension/shared/js/chrome-sync-service.js');
const { createDesktopSyncService } = require('../extension/shared/js/desktop-sync-service.js');

let passed = 0;
let failed = 0;

function assert(desc, condition) {
    if (condition) {
        passed++;
        console.log(`  PASS ${desc}`);
    } else {
        failed++;
        console.log(`  FAIL ${desc}`);
    }
}

function assertEqual(desc, got, expected) {
    assert(`${desc} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(expected));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function extensionIdFromManifestKey(manifestKey) {
    const der = Buffer.from(manifestKey, 'base64');
    const hash = crypto.createHash('sha256').update(der).digest();
    return Array.from(hash.subarray(0, 16)).map(byte => {
        const hex = byte.toString(16).padStart(2, '0');
        return [...hex].map(ch => String.fromCharCode('a'.charCodeAt(0) + parseInt(ch, 16))).join('');
    }).join('');
}

class FakeTable {
    constructor(rows = []) {
        this.rows = rows.map(row => ({ ...row }));
    }

    async toArray() {
        return this.rows.map(row => ({ ...row }));
    }

    async clear() {
        this.rows = [];
    }

    async bulkPut(rows) {
        for (const row of rows) await this.put(row);
    }

    async put(row) {
        const id = row.id ?? row.date ?? row.key;
        const index = this.rows.findIndex(item => String(item.id ?? item.date ?? item.key) === String(id));
        if (index >= 0) {
            this.rows[index] = { ...row };
        } else {
            this.rows.push({ ...row });
        }
    }

    async get(id) {
        return this.rows.find(item => String(item.id ?? item.date ?? item.key) === String(id)) || null;
    }

    async delete(id) {
        this.rows = this.rows.filter(item => String(item.id ?? item.date ?? item.key) !== String(id));
    }
}

class FakeDB {
    constructor() {
        this.db = {
            plans: new FakeTable([{ id: 1, name: 'English', subject: 'English' }]),
            buckets: new FakeTable([{ id: 10, plan_id: 1, name: '作业' }]),
            labels: new FakeTable([{ id: 20, plan_id: 1, name: 'Draft', color: '#334155' }]),
            tasks: new FakeTable([{ id: 'task-1', plan_id: 1, title: 'Essay', due_date: '2026-05-20', progress: 'not_started' }]),
            containers: new FakeTable([{ id: 'container-1', name: '学习时间', time_start: '18:30', time_end: '21:30' }]),
            events: new FakeTable([{ id: 'event-1', title: 'Class', date: '2026-05-20', source: 'timetable' }]),
            habits: new FakeTable([{ id: 'habit-1', title: 'Words', created_at: '2026-05-01T00:00:00.000Z' }]),
            daily_journals: new FakeTable([{ date: '2026-05-15', status: 'submitted', updated_at: '2026-05-15T22:00:00.000Z' }])
        };
        this.settings = {
            matrixview_subject_mappings: [{ subject: 'English', subject_in_matrixview: 'English HL' }],
            managebac_subject_mappings: [{ subject: 'English', subject_in_managebac: 'English HL', plan_id: 1 }],
            managebac_ics_config: { link: 'webcal://example.invalid/student/events/token/redacted.ics' },
            appearance_background: 'calm',
            appearance_avatar: 'default',
            theme: 'light',
            start_week_on: 1,
            default_duration: 45,
            default_priority: 'medium',
            google_sync_state: { status: 'connected' },
            google_sync_account_key: 'account-key-redacted',
            google_sync_account_name: 'Student Name',
            google_sync_account_email: 'student@example.invalid',
            google_sync_account_picture: 'https://lh3.googleusercontent.com/a/redacted',
            google_sync_history: [],
            desktop_work_reminder_state_v1: { status: 'notification_visible', total_count: 2 },
            access_token: 'secret-access-token',
            refresh_token: 'secret-refresh-token',
            google_email: 'student@example.invalid',
            management_review_pending: [{ event_uid: 'private-pending' }],
            task_arrange_pending: [{ task_id: 'private-arrange' }],
            raw_import_file: '<private raw file>'
        };
    }

    async getPlans() { return await this.db.plans.toArray(); }
    async getAllTasks() { return await this.db.tasks.toArray(); }
    async getContainers() { return await this.db.containers.toArray(); }
    async getEvents() { return await this.db.events.toArray(); }
    async getHabits() { return await this.db.habits.toArray(); }
    async getSettings() { return { ...this.settings }; }
    async getSetting(key) { return this.settings[key] ?? null; }
    async setSetting(key, value) { this.settings[key] = value; }
}

function makeEntity(table, id, record, overrides = {}) {
    const key = `${table}:${id}`;
    const cleanRecord = { ...record, id };
    const hash = GoogleSync.hashValue(cleanRecord);
    return {
        key,
        table,
        id: String(id),
        record: cleanRecord,
        hash,
        updated_at: overrides.updated_at || '2026-05-15T00:00:00.000Z',
        dirty: overrides.dirty ?? false,
        last_synced_hash: overrides.last_synced_hash ?? hash,
        source_device_id: overrides.source_device_id || 'device-a'
    };
}

function makeSyncDoc(entities = {}, tombstones = {}, cloudUpdatedAt = '2026-05-15T00:00:00.000Z') {
    return {
        schema: GoogleSync.SYNC_SCHEMA,
        version: 1,
        app: 'TimeWhere',
        cloud_updated_at: cloudUpdatedAt,
        devices: { 'device-a': { device_id: 'device-a', last_seen_at: cloudUpdatedAt } },
        entities,
        tombstones,
        manifest: {
            entity_count: Object.keys(entities).length,
            tombstone_count: Object.keys(tombstones).length
        }
    };
}

function makeDriveClient(initialDoc = null) {
    const state = { doc: initialDoc, uploads: [] };
    return {
        state,
        async downloadJsonFile(name) {
            if (name === GoogleSync.SYNC_FILE_NAME) return state.doc ? JSON.parse(JSON.stringify(state.doc)) : null;
            return null;
        },
        async uploadJsonFile(name, json) {
            state.uploads.push({ name, json: JSON.parse(JSON.stringify(json)) });
            if (name === GoogleSync.SYNC_FILE_NAME) state.doc = JSON.parse(JSON.stringify(json));
            return { id: 'sync-file', name };
        }
    };
}

function read(relPath) {
    return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

async function run() {
    console.log('\nTimeWhere Google data sync tests\n' + '='.repeat(42));

    const fakeDb = new FakeDB();
    const snapshot = await GoogleSync.buildSnapshot(fakeDb, {
        exported_at: '2026-05-15T00:00:00.000Z',
        device_id: 'device-a'
    });

    assertEqual('snapshot schema is timewhere-snapshot-v1', snapshot.schema, 'timewhere-snapshot-v1');
    assert('snapshot exports plans', snapshot.data.plans.length === 1);
    assert('snapshot exports buckets', snapshot.data.buckets.length === 1);
    assert('snapshot exports labels', snapshot.data.labels.length === 1);
    assert('snapshot exports tasks', snapshot.data.tasks.length === 1);
    assert('snapshot exports containers', snapshot.data.containers.length === 1);
    assert('snapshot exports events', snapshot.data.events.length === 1);
    assert('snapshot exports habits', snapshot.data.habits.length === 1);
    assert('snapshot exports daily journals', snapshot.data.daily_journals.length === 1);
    assert('snapshot includes MatrixView subject mappings', Array.isArray(snapshot.data.settings.matrixview_subject_mappings));
    assert('snapshot includes ManageBac subject mappings', Array.isArray(snapshot.data.settings.managebac_subject_mappings));
    assert('snapshot includes ManageBac ICS config', snapshot.data.settings.managebac_ics_config?.link?.includes('example.invalid'));
    assert('snapshot includes approved appearance settings', snapshot.data.settings.appearance_background === 'calm' && snapshot.data.settings.appearance_avatar === 'default');
    assert('snapshot includes approved task default settings', snapshot.data.settings.default_duration === 45 && snapshot.data.settings.default_priority === 'medium');
    assert('snapshot excludes Google sync runtime state', !('google_sync_state' in snapshot.data.settings));
    assert('snapshot excludes local Google account email display', !('google_sync_account_email' in snapshot.data.settings));
    assert('snapshot excludes local Google account name display', !('google_sync_account_name' in snapshot.data.settings));
    assert('snapshot excludes local Google account key display', !('google_sync_account_key' in snapshot.data.settings));
    assert('snapshot excludes local Google account picture display', !('google_sync_account_picture' in snapshot.data.settings));
    assert('snapshot excludes local Google sync history', !('google_sync_history' in snapshot.data.settings));
    assert('snapshot excludes local Desktop work reminder state', !('desktop_work_reminder_state_v1' in snapshot.data.settings));
    assert('snapshot excludes OAuth access token', !('access_token' in snapshot.data.settings));
    assert('snapshot excludes OAuth refresh token', !('refresh_token' in snapshot.data.settings));
    assert('snapshot excludes Google email display', !('google_email' in snapshot.data.settings));
    assert('snapshot excludes pending UI state', !('management_review_pending' in snapshot.data.settings)
        && !('task_arrange_pending' in snapshot.data.settings));
    assert('snapshot excludes raw import files', !('raw_import_file' in snapshot.data.settings));

    assert('snapshot validates', GoogleSync.validateSnapshot(snapshot) === true);
    const legacySnapshot = JSON.parse(JSON.stringify(snapshot));
    delete legacySnapshot.data.daily_journals;
    assert('snapshot validation accepts old snapshots without daily journals', GoogleSync.validateSnapshot(legacySnapshot) === true
        && Array.isArray(legacySnapshot.data.daily_journals));
    const manifest = GoogleSync.createManifest(snapshot, { updated_at: '2026-05-15T00:05:00.000Z' });
    assertEqual('manifest schema is sync manifest v1', manifest.schema, 'timewhere-sync-manifest-v1');
    assertEqual('manifest points to snapshot file', manifest.snapshot_file, 'timewhere-snapshot-v1.json');

    const noOauthChrome = {
        runtime: { getManifest: () => ({ name: 'TimeWhere' }) },
        identity: {}
    };
    const auth = GoogleSync.createChromeIdentityAuthAdapter(noOauthChrome);
    const authStatus = await auth.getStatus();
    assertEqual('auth adapter reports not_configured without OAuth client id', authStatus.status, 'not_configured');

    const profileChrome = {
        runtime: { getManifest: () => ({ oauth2: { client_id: 'mock-client.apps.googleusercontent.com' } }) },
        identity: {
            getProfileUserInfo(_options, callback) {
                callback({ email: 'student@example.invalid' });
            }
        }
    };
    const profileAuth = GoogleSync.createChromeIdentityAuthAdapter(profileChrome);
    const profileInfo = await profileAuth.getAccountInfo();
    assertEqual('auth adapter reads local Google account email for UI only', profileInfo.email, 'student@example.invalid');

    let localDisconnectCalled = false;
    let revokeCalled = false;
    const desktopDisconnectAuth = GoogleSync.createTimeWherePlatformAuthAdapter({
        auth: {
            getStatus: async () => ({ status: 'configured' }),
            getGoogleToken: async () => ({ status: 'not_authorized', reason: 'desktop_oauth_not_connected' }),
            getAccountInfo: async () => ({
                connected: true,
                account_key: 'account-key-redacted',
                name: 'Student Name',
                email: 'student@example.invalid',
                picture: 'https://lh3.googleusercontent.com/a/redacted'
            }),
            disconnectGoogleToken: async () => {
                localDisconnectCalled = true;
                return { status: 'disconnected' };
            },
            revokeGoogleToken: async () => {
                revokeCalled = true;
                return { status: 'revoked' };
            }
        }
    });
    const desktopAccountInfo = await desktopDisconnectAuth.getAccountInfo();
    assert('Platform auth adapter returns account picture for local UI only', desktopAccountInfo.picture === 'https://lh3.googleusercontent.com/a/redacted');
    await desktopDisconnectAuth.disconnect();
    assert('Platform auth adapter disconnect is local-only and does not revoke Google authorization', localDisconnectCalled && !revokeCalled);
    await desktopDisconnectAuth.revoke();
    assert('Platform auth adapter exposes explicit revoke for dangerous authorization removal', revokeCalled);

    const fetchCalls = [];
    const mockFetch = async (url, options = {}) => {
        fetchCalls.push({ url, options });
        if (url.includes('/drive/v3/files?')) {
            return { ok: true, status: 200, json: async () => ({ files: [] }) };
        }
        if (url.includes('/upload/drive/v3/files')) {
            return { ok: true, status: 200, json: async () => ({ id: 'file-1', name: 'timewhere-snapshot-v1.json' }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
    };
    const drive = GoogleSync.createDriveAppDataClient({
        authAdapter: { getToken: async () => ({ status: 'connected', token: 'mock-token' }) },
        fetchImpl: mockFetch
    });
    await drive.uploadJsonFile(GoogleSync.SNAPSHOT_FILE_NAME, snapshot);
    assert('Drive upload lists appDataFolder files first', fetchCalls.some(call => call.url.includes('spaces=appDataFolder')));
    assert('Drive upload creates file in appDataFolder', fetchCalls.some(call => String(call.options.body || '').includes('"parents":["appDataFolder"]')));
    assert('Drive adapter uses bearer token without persisting it', fetchCalls.every(call => call.options.headers?.Authorization === 'Bearer mock-token'));

    const disconnectedDrive = GoogleSync.createDriveAppDataClient({
        authAdapter: { getToken: async () => ({ status: 'not_authorized', reason: 'desktop_oauth_not_connected' }) },
        fetchImpl: mockFetch
    });
    let disconnectedReason = '';
    try {
        await disconnectedDrive.downloadJsonFile(GoogleSync.SYNC_FILE_NAME);
    } catch (error) {
        disconnectedReason = error.code || error.reason || '';
    }
    assertEqual('Drive adapter preserves desktop not-authorized reason for Settings diagnostics', disconnectedReason, 'desktop_oauth_not_connected');

    let revokedFetchCalled = false;
    const revokedDrive = GoogleSync.createDriveAppDataClient({
        authAdapter: {
            getToken: async () => ({
                status: 'not_authorized',
                reason: 'desktop_oauth_refresh_token_revoked',
                message: 'Google authorization expired, was revoked, or no longer matches this desktop package OAuth client metadata.',
                google_error: 'invalid_grant',
                google_error_subtype: 'invalid_rapt',
                oauth_diagnostics: {
                    oauth: {
                        client_id_tail: 'redacted',
                        env_client_id_override: false,
                        client_secret_present: true
                    }
                }
            })
        },
        fetchImpl: async () => {
            revokedFetchCalled = true;
            return { ok: true, status: 200, json: async () => ({}) };
        }
    });
    let revokedError = null;
    try {
        await revokedDrive.downloadJsonFile(GoogleSync.SYNC_FILE_NAME);
    } catch (error) {
        revokedError = error;
    }
    assertEqual('Drive adapter preserves revoked refresh token reason', revokedError?.code || revokedError?.reason || '', 'desktop_oauth_refresh_token_revoked');
    assertEqual('Drive adapter preserves desktop auth error subtype', revokedError?.auth_error_subtype || '', 'invalid_rapt');
    assert('Drive adapter preserves sanitized OAuth diagnostics without calling Drive', revokedError?.oauth_diagnostics?.oauth?.client_secret_present === true && !revokedFetchCalled);

    let mismatchFetchCalled = false;
    const mismatchDrive = GoogleSync.createDriveAppDataClient({
        authAdapter: { getToken: async () => ({ status: 'account_mismatch', reason: 'account_mismatch', message: 'wrong account' }) },
        fetchImpl: async () => {
            mismatchFetchCalled = true;
            return { ok: true, status: 200, json: async () => ({}) };
        }
    });
    let mismatchReason = '';
    try {
        await mismatchDrive.downloadJsonFile(GoogleSync.SYNC_FILE_NAME);
    } catch (error) {
        mismatchReason = error.code || error.reason || '';
    }
    assertEqual('Drive adapter blocks account mismatch before network fetch', mismatchReason, 'account_mismatch');
    assert('Drive adapter does not call Drive when desktop account mismatches profile', !mismatchFetchCalled);

    const forbiddenDrive = GoogleSync.createDriveAppDataClient({
        authAdapter: { getToken: async () => ({ status: 'connected', token: 'mock-token' }) },
        fetchImpl: async () => ({
            ok: false,
            status: 403,
            text: async () => JSON.stringify({
                error: {
                    code: 403,
                    message: 'Request had insufficient authentication scopes.',
                    status: 'PERMISSION_DENIED',
                    errors: [{ reason: 'insufficientPermissions' }]
                }
            })
        })
    });
    let forbiddenError = null;
    try {
        await forbiddenDrive.downloadJsonFile(GoogleSync.SYNC_FILE_NAME);
    } catch (error) {
        forbiddenError = error;
    }
    assert('Drive adapter preserves Google 403 reason for diagnostics',
        forbiddenError?.http_status === 403
        && forbiddenError.google_reason === 'insufficientPermissions'
        && forbiddenError.google_status === 'PERMISSION_DENIED'
        && forbiddenError.retryable === false);

    const cloudSnapshot = JSON.parse(JSON.stringify(snapshot));
    cloudSnapshot.exported_at = '2026-05-15T00:10:00.000Z';
    cloudSnapshot.data.tasks[0].title = 'Cloud Essay';
    cloudSnapshot.data.tasks.push({ id: 'task-cloud', plan_id: 1, title: 'Cloud only', progress: 'not_started' });
    const preview = GoogleSync.computeSyncPreview(snapshot, cloudSnapshot);
    assertEqual('sync preview reports changes', preview.status, 'has_changes');
    assert('sync preview includes task conflict', preview.changes.some(change => change.table === 'tasks' && change.id === 'task-1' && change.change_type === 'conflict'));
    assert('sync preview includes cloud-only task', preview.changes.some(change => change.table === 'tasks' && change.id === 'task-cloud' && change.change_type === 'cloud_only'));
    assert('preview calculation does not mutate local DB before apply', (await fakeDb.db.tasks.get('task-1')).title === 'Essay');
    await GoogleSync.applyCloudChoicesToLocal(fakeDb, preview, {
        'record:tasks:task-1': 'cloud',
        'record:tasks:task-cloud': 'skip'
    });
    assert('confirmed cloud choice writes IndexedDB', (await fakeDb.db.tasks.get('task-1')).title === 'Cloud Essay');
    assert('skipped cloud-only item is not written', !(await fakeDb.db.tasks.get('task-cloud')));

    const localAfterApply = await GoogleSync.buildSnapshot(fakeDb, { exported_at: '2026-05-15T00:20:00.000Z' });
    const uploadSnapshot = GoogleSync.buildUploadSnapshotFromChoices(localAfterApply, cloudSnapshot, preview, {
        'record:tasks:task-1': 'cloud',
        'record:tasks:task-cloud': 'skip'
    }, { exported_at: '2026-05-15T00:21:00.000Z' });
    assert('upload snapshot preserves skipped cloud-only record in cloud copy', uploadSnapshot.data.tasks.some(task => task.id === 'task-cloud'));
    assert('upload snapshot keeps confirmed cloud record', uploadSnapshot.data.tasks.some(task => task.id === 'task-1' && task.title === 'Cloud Essay'));

    const localOnlyEntity = makeEntity('tasks', 'local-only', { title: 'Local only' }, { dirty: true, last_synced_hash: null });
    const localOnlyPlan = GoogleSync.planSyncMerge(makeSyncDoc({ [localOnlyEntity.key]: localOnlyEntity }), makeSyncDoc({}));
    assert('sync v1 local-only dirty record uploads automatically', localOnlyPlan.upload_keys.includes('tasks:local-only') && localOnlyPlan.conflicts.length === 0);

    const cloudOnlyEntity = makeEntity('tasks', 'cloud-only', { title: 'Cloud only' });
    const cloudOnlyPlan = GoogleSync.planSyncMerge(makeSyncDoc({}), makeSyncDoc({ [cloudOnlyEntity.key]: cloudOnlyEntity }));
    assert('sync v1 cloud-only record applies locally', cloudOnlyPlan.apply_local.some(change => change.key === 'tasks:cloud-only' && change.action === 'put_local'));

    const baseRecord = { title: 'Essay' };
    const baseHash = GoogleSync.hashValue({ ...baseRecord, id: 'same-task' });
    const localConflict = makeEntity('tasks', 'same-task', { title: 'Local edit' }, { dirty: true, last_synced_hash: baseHash });
    const cloudConflict = makeEntity('tasks', 'same-task', { title: 'Cloud edit' }, { dirty: false, last_synced_hash: baseHash });
    const conflictPlan = GoogleSync.planSyncMerge(makeSyncDoc({ [localConflict.key]: localConflict }), makeSyncDoc({ [cloudConflict.key]: cloudConflict }));
    assert('sync v1 local/cloud same record conflict does not auto write', conflictPlan.conflicts.length === 1 && conflictPlan.apply_local.length === 0 && conflictPlan.upload_keys.length === 0);

    const baseJournal = { date: '2026-05-15', status: 'draft', updated_at: '2026-05-15T20:00:00.000Z' };
    const baseJournalHash = GoogleSync.hashValue(baseJournal);
    const localJournal = makeEntity('daily_journals', '2026-05-15', { date: '2026-05-15', status: 'submitted', updated_at: '2026-05-15T22:00:00.000Z' }, { dirty: true, last_synced_hash: baseJournalHash });
    const cloudJournal = makeEntity('daily_journals', '2026-05-15', { date: '2026-05-15', status: 'draft', updated_at: '2026-05-15T21:00:00.000Z' }, { dirty: false, last_synced_hash: baseJournalHash });
    const journalMergePlan = GoogleSync.planSyncMerge(makeSyncDoc({ [localJournal.key]: localJournal }), makeSyncDoc({ [cloudJournal.key]: cloudJournal }));
    assert('sync v1 daily journal conflict keeps newer updated_at without manual conflict',
        journalMergePlan.conflicts.length === 0 && journalMergePlan.upload_keys.includes('daily_journals:2026-05-15'));

    const firstSyncLocal = makeEntity('tasks', 'first-sync', { title: 'Local first sync' }, { dirty: true, last_synced_hash: null });
    const firstSyncCloud = makeEntity('tasks', 'first-sync', { title: 'Cloud first sync' }, { dirty: false, last_synced_hash: null });
    const firstSyncConflictPlan = GoogleSync.planSyncMerge(makeSyncDoc({ [firstSyncLocal.key]: firstSyncLocal }), makeSyncDoc({ [firstSyncCloud.key]: firstSyncCloud }));
    assert('sync v1 first sync same key mismatch creates conflict', firstSyncConflictPlan.conflicts.length === 1 && firstSyncConflictPlan.conflicts[0].key === 'tasks:first-sync');

    const deletedEntity = makeEntity('tasks', 'deleted-task', { title: 'Deleted remotely' });
    const cloudDeletePlan = GoogleSync.planSyncMerge(
        makeSyncDoc({ [deletedEntity.key]: { ...deletedEntity, dirty: false } }),
        makeSyncDoc({}, { [deletedEntity.key]: { table: 'tasks', id: 'deleted-task', deleted_at: '2026-05-15T01:00:00.000Z', last_synced_hash: deletedEntity.hash } })
    );
    assert('sync v1 cloud tombstone deletes clean local record', cloudDeletePlan.apply_local.some(change => change.key === 'tasks:deleted-task' && change.action === 'delete_local'));

    const localDeletePlan = GoogleSync.planSyncMerge(
        makeSyncDoc({}, { [deletedEntity.key]: { table: 'tasks', id: 'deleted-task', deleted_at: '2026-05-15T01:00:00.000Z', last_synced_hash: deletedEntity.hash } }),
        makeSyncDoc({ [deletedEntity.key]: deletedEntity })
    );
    assert('sync v1 local tombstone uploads delete when cloud unchanged', localDeletePlan.upload_tombstones.includes('tasks:deleted-task'));

    const remoteUpdatedAfterDelete = makeEntity('tasks', 'deleted-task', { title: 'Remote changed' }, { last_synced_hash: deletedEntity.hash });
    const deleteConflictPlan = GoogleSync.planSyncMerge(
        makeSyncDoc({}, { [deletedEntity.key]: { table: 'tasks', id: 'deleted-task', deleted_at: '2026-05-15T01:00:00.000Z', last_synced_hash: deletedEntity.hash } }),
        makeSyncDoc({ [deletedEntity.key]: remoteUpdatedAfterDelete })
    );
    assert('sync v1 tombstone versus remote update creates conflict', deleteConflictPlan.conflicts.some(conflict => conflict.conflict_type === 'delete_vs_remote_update'));

    const dirtyDb = new FakeDB();
    await GoogleSync.markEntityDirty(dirtyDb, 'tasks', 'task-1', { id: 'task-1', title: 'Essay' }, { device_id: 'device-a' });
    const driveForAuto = makeDriveClient(makeSyncDoc({}, {}, '2026-05-15T00:00:00.000Z'));
    const autoResult = await GoogleSync.runAutoSync(dirtyDb, driveForAuto, { device_id: 'device-a' });
    assert('sync v1 auto sync uploads dirty local record', autoResult.status === 'synced' && driveForAuto.state.uploads.some(upload => upload.name === GoogleSync.SYNC_FILE_NAME));
    const autoHistory = await GoogleSync.getGoogleSyncHistory(dirtyDb, { limit: 5 });
    assert('sync v1 auto sync records local history summary',
        autoHistory[0]?.status === 'synced'
        && autoHistory[0].counts.uploaded >= 1
        && autoHistory[0].cloud_updated_at);

    const historyDb = new FakeDB();
    const sensitiveAccessToken = `${['ya', '29'].join('')}.redacted-token-fragment`;
    const sensitiveClientSecret = `${['GOC', 'SPX-'].join('')}redactedSecret`;
    await GoogleSync.appendGoogleSyncHistory(historyDb, {
        trigger: 'manual_sync',
        status: 'failed',
        reason: 'invalid_grant',
        error: {
            reason: 'invalid_grant',
            http_status: 400,
            message: `student@example.invalid ${sensitiveAccessToken} ${sensitiveClientSecret}`
        }
    });
    const failureHistory = await GoogleSync.getGoogleSyncHistory(historyDb, { limit: 1 });
    const sanitizedFailure = failureHistory[0];
    assert('sync history sanitizes account token and secret-like values',
        sanitizedFailure?.error?.message?.includes('[account]')
        && sanitizedFailure.error.message.includes('[token]')
        && sanitizedFailure.error.message.includes('[secret]')
        && !sanitizedFailure.error.message.includes('student@example.invalid')
        && !sanitizedFailure.error.message.includes(sensitiveAccessToken)
        && !sanitizedFailure.error.message.includes(sensitiveClientSecret));
    for (let i = 0; i < 55; i += 1) {
        await GoogleSync.appendGoogleSyncHistory(historyDb, { trigger: 'auto', status: 'up_to_date', id: `history-${i}` });
    }
    const cappedHistory = await GoogleSync.getGoogleSyncHistory(historyDb, { limit: 80 });
    assert('sync history is capped to 50 records', cappedHistory.length === 50);
    await GoogleSync.clearGoogleSyncHistory(historyDb);
    assert('sync history can be cleared without touching sync state', Array.isArray(historyDb.settings.google_sync_history) && historyDb.settings.google_sync_history.length === 0);

    await GoogleSync.appendGoogleSyncHistory(historyDb, {
        trigger: 'coalesced_pending',
        status: 'synced',
        queued_at: '2026-05-15T00:00:00.000Z',
        queue_wait_ms: 65000,
        coalesced_pending: true,
        pending_trigger_count: 3,
        pending_reasons: ['interval', 'local_write', 'manual_sync'],
        long_running: true,
        request_timeout_ms: GoogleSync.DEFAULT_DRIVE_REQUEST_TIMEOUT_MS
    });
    const queuedHistory = await GoogleSync.getGoogleSyncHistory(historyDb, { limit: 1 });
    assert('sync history records queue wait and coalesced trigger details',
        queuedHistory[0]?.queue_wait_ms === 65000
        && queuedHistory[0]?.coalesced_pending === true
        && queuedHistory[0]?.coalesced_trigger_count === 3
        && queuedHistory[0]?.coalesced_reasons.includes('local_write')
        && queuedHistory[0]?.long_running === true
        && queuedHistory[0]?.request_timeout_ms === GoogleSync.DEFAULT_DRIVE_REQUEST_TIMEOUT_MS);

    const previousPlatform = globalThis.TimeWherePlatform;
    globalThis.TimeWherePlatform = { name: 'desktop-electron' };
    const syncDb = new FakeDB();
    syncDb.settings.google_sync_state = { status: 'connected' };
    const runCalls = [];
    const runResolvers = [];
    const desktopService = createDesktopSyncService({
        db: syncDb,
        driveClientFactory: () => ({ status: 'drive-ready' }),
        api: {
            GOOGLE_SYNC_CONFLICTS_KEY: GoogleSync.GOOGLE_SYNC_CONFLICTS_KEY,
            getGoogleSyncState: db => GoogleSync.getGoogleSyncState(db),
            saveGoogleSyncState: (db, patch) => GoogleSync.saveGoogleSyncState(db, patch),
            serializeSyncError: error => GoogleSync.serializeSyncError(error),
            runAutoSync: async (db, driveClient, options) => {
                runCalls.push(options);
                if (runCalls.length === 1) {
                    await new Promise(resolve => runResolvers.push(resolve));
                }
                return { status: 'up_to_date' };
            }
        }
    });
    const firstRun = desktopService.requestRun({ reason: 'startup', force: false });
    await sleep(0);
    const queuedInterval = await desktopService.requestRun({ reason: 'interval', force: false });
    const queuedWrite = await desktopService.requestRun({ reason: 'local_write', force: true });
    const queuedStatus = await desktopService.getStatus();
    assert('desktop sync coalesces triggers while a run is active',
        queuedInterval.status === 'queued'
        && queuedWrite.status === 'queued'
        && queuedStatus.pending_trigger_count === 2
        && queuedStatus.pending_reasons.includes('interval')
        && queuedStatus.pending_reasons.includes('local_write')
        && queuedStatus.pending_force === true);
    runResolvers.shift()();
    await firstRun;
    await sleep(20);
    assert('desktop sync runs one force follow-up for coalesced pending triggers',
        runCalls.length === 2
        && runCalls[1].force === true
        && runCalls[1].sync_trigger === 'coalesced_pending'
        && runCalls[1].pending_trigger_count === 2
        && runCalls[1].pending_reasons.includes('local_write')
        && runCalls[1].coalesced_pending === true);

    const longDb = new FakeDB();
    longDb.settings.google_sync_state = { status: 'connected' };
    const longResolvers = [];
    const longService = createDesktopSyncService({
        db: longDb,
        long_running_ms: 5,
        driveClientFactory: () => ({ status: 'drive-ready' }),
        api: {
            GOOGLE_SYNC_CONFLICTS_KEY: GoogleSync.GOOGLE_SYNC_CONFLICTS_KEY,
            getGoogleSyncState: db => GoogleSync.getGoogleSyncState(db),
            saveGoogleSyncState: (db, patch) => GoogleSync.saveGoogleSyncState(db, patch),
            serializeSyncError: error => GoogleSync.serializeSyncError(error),
            runAutoSync: async () => {
                await new Promise(resolve => longResolvers.push(resolve));
                return { status: 'up_to_date' };
            }
        }
    });
    const longRun = longService.requestRun({ reason: 'manual_sync', force: true });
    await sleep(15);
    const longStatus = await longService.getStatus();
    assert('desktop sync marks long running jobs without starting a concurrent sync',
        longStatus.status === 'long_running'
        && longStatus.running === true
        && longStatus.current_run_duration_ms > 0);
    longResolvers.shift()();
    await longRun;
    globalThis.TimeWherePlatform = previousPlatform;

    const timeoutClient = GoogleSync.createDriveAppDataClient({
        authAdapter: { getToken: async () => ({ token: 'test-access-token' }) },
        request_timeout_ms: 5,
        fetchImpl: async (_url, options = {}) => await new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
            }, { once: true });
        })
    });
    let timeoutError = null;
    try {
        await timeoutClient.findJsonFile('timewhere-sync-v1.json');
    } catch (error) {
        timeoutError = error;
    }
    assert('Drive appDataFolder client converts request timeout into retryable sync error',
        timeoutError?.reason === 'google_drive_request_timeout'
        && timeoutError.retryable === true);

    const conflictDb = new FakeDB();
    const savedConflict = makeEntity('tasks', 'conflict-save', { title: 'Saved conflict' });
    await GoogleSync.saveGoogleSyncConflicts(conflictDb, [{ key: savedConflict.key, table: 'tasks', id: 'conflict-save', local: savedConflict, cloud: savedConflict }]);
    assertEqual('sync v1 conflict helper stores count from conflict detail list',
        conflictDb.settings.google_sync_state.conflict_count,
        conflictDb.settings.google_sync_conflicts.length);
    assert('sync v1 conflict helper stores stable conflict ids and timestamps',
        conflictDb.settings.google_sync_conflicts[0].conflict_id
        && conflictDb.settings.google_sync_conflicts[0].conflict_type === 'sync_conflict'
        && conflictDb.settings.google_sync_conflicts[0].detected_at);

    const arrangeOnlyDb = new FakeDB();
    const baseArrangeTask = await arrangeOnlyDb.db.tasks.get('task-1');
    const baseArrangeEntity = makeEntity('tasks', 'task-1', baseArrangeTask, { dirty: false });
    arrangeOnlyDb.settings.google_sync_meta = {
        [baseArrangeEntity.key]: {
            table: 'tasks',
            id: 'task-1',
            dirty: false,
            hash: baseArrangeEntity.hash,
            last_synced_hash: baseArrangeEntity.hash,
            last_synced_at: '2026-05-15T00:00:00.000Z'
        }
    };
    const arrangedTask = { ...baseArrangeTask, start_date: '2026-05-29', priority: 'urgent' };
    await arrangeOnlyDb.db.tasks.put(arrangedTask);
    const arrangeOnlyMeta = await GoogleSync.markEntityDirty(arrangeOnlyDb, 'tasks', 'task-1', arrangedTask, {
        changedFields: ['start_date', 'priority'],
        googleSyncDerivedFields: ['start_date', 'priority'],
        googleSyncDerivedBaseRecord: baseArrangeTask,
        googleSyncDerivedSource: 'task_arrange_auto',
        device_id: 'device-a'
    });
    const arrangeOnlyDoc = await GoogleSync.buildLocalSyncDocument(arrangeOnlyDb, { device_id: 'device-a' });
    const arrangeOnlyEntity = arrangeOnlyDoc.entities[baseArrangeEntity.key];
    const arrangeOnlyPlan = GoogleSync.planSyncMerge(arrangeOnlyDoc, makeSyncDoc({ [baseArrangeEntity.key]: baseArrangeEntity }));
    assert('Arrange-only start_date and priority changes are recorded as derived but not dirty',
        arrangeOnlyMeta.derived_only === true
        && arrangeOnlyMeta.dirty === false
        && arrangeOnlyEntity.dirty === false
        && arrangeOnlyEntity.hash === baseArrangeEntity.hash);
    assert('Arrange-only task field differences do not create sync conflicts',
        !arrangeOnlyPlan.conflicts.some(conflict => conflict.key === baseArrangeEntity.key)
        && !arrangeOnlyPlan.apply_local.some(change => change.key === baseArrangeEntity.key)
        && !arrangeOnlyPlan.upload_keys.includes(baseArrangeEntity.key)
        && !arrangeOnlyPlan.changes.some(change => change.key === baseArrangeEntity.key));

    const cloudNotesEntity = makeEntity('tasks', 'task-1', { ...baseArrangeTask, notes: 'Remote note' }, { dirty: false, last_synced_hash: baseArrangeEntity.hash });
    const cloudNotesDoc = makeSyncDoc({ [cloudNotesEntity.key]: cloudNotesEntity }, {}, '2026-05-15T00:10:00.000Z');
    const cloudNotesPlan = GoogleSync.planSyncMerge(arrangeOnlyDoc, cloudNotesDoc);
    await GoogleSync.applyMergePlanToLocal(arrangeOnlyDb, cloudNotesPlan, cloudNotesDoc);
    const afterCloudApply = await arrangeOnlyDb.db.tasks.get('task-1');
    assert('Applying cloud user changes preserves local Arrange-derived fields',
        afterCloudApply.notes === 'Remote note'
        && afterCloudApply.start_date === '2026-05-29'
        && afterCloudApply.priority === 'urgent');

    const manualTask = { ...afterCloudApply, start_date: '2026-06-01' };
    await arrangeOnlyDb.db.tasks.put(manualTask);
    const manualMeta = await GoogleSync.markEntityDirty(arrangeOnlyDb, 'tasks', 'task-1', manualTask, {
        changedFields: ['start_date'],
        device_id: 'device-a'
    });
    assert('Manual edit of start_date clears derived marker and becomes a real dirty task change',
        manualMeta.dirty === true
        && !manualMeta.derived_fields?.start_date);

    const raceDrive = makeDriveClient(makeSyncDoc({}, {}, '2026-05-15T00:00:00.000Z'));
    let firstDownload = true;
    const originalDownload = raceDrive.downloadJsonFile;
    raceDrive.downloadJsonFile = async name => {
        const value = await originalDownload.call(raceDrive, name);
        if (name === GoogleSync.SYNC_FILE_NAME && firstDownload) {
            firstDownload = false;
            raceDrive.state.doc.cloud_updated_at = '2026-05-15T00:30:00.000Z';
        }
        return value;
    };
    const raceDb = new FakeDB();
    await GoogleSync.markEntityDirty(raceDb, 'tasks', 'task-1', { id: 'task-1', title: 'Race edit' }, { device_id: 'device-a' });
    const raceResult = await GoogleSync.runAutoSync(raceDb, raceDrive, { device_id: 'device-a' });
    assertEqual('sync v1 detects cloud revision changed before upload', raceResult.status, 'stale_cloud_retry');
    const raceHistory = await GoogleSync.getGoogleSyncHistory(raceDb, { limit: 1 });
    assert('sync v1 records pending retry history when cloud changes mid-sync',
        raceHistory[0]?.status === 'pending_retry'
        && raceHistory[0]?.reason === 'cloud_changed_during_sync');

    const settingsHtml = read('extension/pages/settings/settings.html');
    const settingsScript = read('extension/pages/settings/script.js');
    const settingsCss = read('extension/pages/settings/styles.css');
    const dbScript = read('extension/shared/js/db.js');
    const googleSyncScript = read('extension/shared/js/google-sync.js');
    const platformScript = read('extension/shared/js/platform.js');
    const syncRuntimeServiceScript = read('extension/shared/js/sync-runtime-service.js');
    const chromeSyncServiceScript = read('extension/shared/js/chrome-sync-service.js');
    const desktopSyncServiceScript = read('extension/shared/js/desktop-sync-service.js');
    const schedulingScript = read('extension/shared/js/scheduling.js');
    const taskArrangeAutoScript = read('extension/shared/js/task-arrange-auto.js');
    const desktopAuthScript = read('platforms/desktop-electron/desktop-auth.js');
    const desktopPackage = JSON.parse(read('platforms/desktop-electron/package.json'));
    const gitignore = read('.gitignore');
    assert('Settings UI contains Google 数据同步 section', settingsHtml.includes('Google 数据同步'));
    assert('Settings UI places Google sync after task defaults and before data management',
        settingsHtml.indexOf('任务默认值') > -1
        && settingsHtml.indexOf('Google 数据同步') > settingsHtml.indexOf('任务默认值')
        && settingsHtml.indexOf('数据管理') > settingsHtml.indexOf('Google 数据同步'));
    assert('Settings UI no longer contains initialization wizard flow',
        !settingsHtml.includes('wizardView')
        && !settingsHtml.includes('wizardStep')
        && !settingsHtml.includes('重新初始化')
        && !settingsHtml.includes('重新引导')
        && !settingsScript.includes('setupWizardEvents')
        && !settingsScript.includes('checkAndShowWizard'));
    assert('Settings UI contains connection status card', settingsHtml.includes('连接状态') && settingsHtml.includes('googleSyncAccountEmail'));
    assert('Settings UI contains sync status card', settingsHtml.includes('同步状态') && settingsHtml.includes('googleSyncLastSyncAt'));
    assert('Settings UI includes sync history entry and local-only history panel',
        settingsHtml.includes('toggleGoogleSyncHistoryBtn')
        && settingsHtml.includes('googleSyncHistoryPanel')
        && settingsHtml.includes('googleSyncHistoryList')
        && settingsHtml.includes('仅保存本机最近同步摘要'));
    assert('Settings UI includes connect button', settingsHtml.includes('connectGoogleSyncBtn') && settingsHtml.includes('连接 Google 账户同步'));
    assert('Settings UI includes reinstall recovery prompt',
        settingsHtml.includes('googleSyncRecoveryHint')
        && settingsHtml.includes('connectAndRestoreGoogleSyncBtn')
        && settingsHtml.includes('连接 Google 并从云端恢复')
        && settingsHtml.includes('恢复前会要求再次确认，不会静默覆盖本地数据。'));
    assert('Settings UI includes manual sync button', settingsHtml.includes('syncGoogleNowBtn') && settingsHtml.includes('手动同步'));
    assert('Settings UI includes cloud download danger button', settingsHtml.includes('restoreGoogleSyncBtn') && settingsHtml.includes('↓ 下载到本地'));
    assert('Settings UI includes cloud upload danger button', settingsHtml.includes('uploadGoogleSyncBtn') && settingsHtml.includes('↑ 上传到云端'));
    assert('Settings UI includes disconnect button', settingsHtml.includes('disconnectGoogleSyncBtn') && settingsHtml.includes('断开连接'));
    assert('Settings UI includes explicit Google authorization revoke button', settingsHtml.includes('revokeGoogleSyncBtn') && settingsHtml.includes('撤销授权'));
    assert('Settings UI includes conflict processing entry', settingsHtml.includes('processGoogleConflictsBtn') && settingsHtml.includes('处理冲突'));
    assert('Settings UI includes formal dangerous sync modal', settingsHtml.includes('googleSyncDangerModal') && settingsHtml.includes('googleSyncDangerConfirmInput'));
    assert('Settings UI dangerous modal requires phrase-gated confirmation', settingsScript.includes('updateGoogleSyncDangerConfirmState') && settingsScript.includes("config.phrase"));
    assert('Google upload/download danger actions open modal instead of window.confirm', settingsScript.includes("openGoogleSyncDangerModal('upload')") && settingsScript.includes("openGoogleSyncDangerModal('restore')"));
    assert('Google danger modal contains upload download and revoke confirmation phrases', settingsScript.includes("phrase: '上传到云端'") && settingsScript.includes("phrase: '下载到本地'") && settingsScript.includes("phrase: '撤销 Google 授权'"));
    assert('Settings loads google-sync.js before page script', settingsHtml.indexOf('google-sync.js') > -1 && settingsHtml.indexOf('google-sync.js') < settingsHtml.indexOf('script.js"></script>'));
    assert('Settings loads platform adapter before google-sync runtime',
        settingsHtml.indexOf('platform.js') > -1
        && settingsHtml.indexOf('platform.js') < settingsHtml.indexOf('google-sync.js'));
    assert('Settings loads shared and platform sync services after google-sync runtime',
        settingsHtml.indexOf('sync-runtime-service.js') > settingsHtml.indexOf('google-sync.js')
        && settingsHtml.indexOf('chrome-sync-service.js') > settingsHtml.indexOf('sync-runtime-service.js')
        && settingsHtml.indexOf('desktop-sync-service.js') > settingsHtml.indexOf('chrome-sync-service.js')
        && settingsHtml.indexOf('desktop-sync-service.js') < settingsHtml.indexOf('script.js"></script>'));
    assert('Settings Google sync runtime prefers TimeWherePlatform auth adapter',
        settingsScript.includes('createTimeWherePlatformAuthAdapter(globalThis.TimeWherePlatform)')
        && settingsScript.includes('createChromeIdentityAuthAdapter(typeof chrome'));
    assert('Settings caches Google account picture locally and clears it on disconnect/revoke',
        settingsScript.includes('google_sync_account_picture')
        && settingsScript.includes('isSafeGoogleAccountPictureUrl')
        && (settingsScript.match(/setSetting\('google_sync_account_picture', null\)/g) || []).length >= 2);
    assert('Settings renders sync history and listens to real sync state/history events',
        settingsScript.includes('renderGoogleSyncHistory')
        && settingsScript.includes('getGoogleSyncHistory(TimeWhereDB')
        && settingsScript.includes('timewhere-google-sync-state')
        && settingsScript.includes('timewhere-google-sync-history')
        && settingsScript.includes('同步排队中')
        && settingsScript.includes('同步耗时较长')
        && settingsScript.includes('requestDesktopSyncAfterConnect')
        && settingsScript.includes("reason = 'connect_success'")
        && settingsScript.includes("setGoogleSyncStatus('● 等待重试', 'retry')"));
    assert('Google sync exposes platform auth adapter and default Drive client uses it',
        typeof GoogleSync.createTimeWherePlatformAuthAdapter === 'function'
        && settingsScript.includes('TimeWherePlatform?.auth?.getGoogleToken')
        && read('extension/shared/js/google-sync.js').includes('createTimeWherePlatformAuthAdapter(global.TimeWherePlatform)'));
    assert('Google sync platform auth adapter propagates structured desktop auth failures',
        googleSyncScript.includes('makePlatformAuthError')
        && googleSyncScript.includes("result?.status === 'failed'")
        && googleSyncScript.includes('error.code = reason')
        && googleSyncScript.includes('disconnectGoogleToken')
        && googleSyncScript.includes('async revoke()'));
    assert('Shared sync runtime serializes jobs with pending runs and retry backoff for Chrome and Desktop',
        typeof SyncRuntimeService.createSyncRuntimeService === 'function'
        && typeof createChromeSyncService === 'function'
        && syncRuntimeServiceScript.includes('createSyncRuntimeService')
        && syncRuntimeServiceScript.includes('currentRun')
        && syncRuntimeServiceScript.includes('pendingState')
        && syncRuntimeServiceScript.includes('DEFAULT_INTERVAL_MS = 3 * 60 * 1000')
        && syncRuntimeServiceScript.includes('DEFAULT_DEBOUNCE_MS = 3 * 60 * 1000')
        && syncRuntimeServiceScript.includes('LONG_RUNNING_MS = 90 * 1000')
        && syncRuntimeServiceScript.includes('BACKOFF_MS')
        && syncRuntimeServiceScript.includes('pending_trigger_count')
        && syncRuntimeServiceScript.includes('pending_reasons')
        && syncRuntimeServiceScript.includes("pause('conflict')")
        && syncRuntimeServiceScript.includes("requestRun({ reason: 'interval'")
        && chromeSyncServiceScript.includes('chrome_page_runtime')
        && desktopSyncServiceScript.includes('desktop_runtime'));
    assert('Google sync cadence and Drive timeout use desktop-friendly defaults',
        GoogleSync.AUTO_SYNC_THROTTLE_MS === 3 * 60 * 1000
        && GoogleSync.SAVE_DEBOUNCE_MS === 3 * 60 * 1000
        && GoogleSync.DEFAULT_DRIVE_REQUEST_TIMEOUT_MS === 45 * 1000
        && googleSyncScript.includes('makeDriveTimeoutError')
        && googleSyncScript.includes('request_timeout_ms = DEFAULT_DRIVE_REQUEST_TIMEOUT_MS'));
    assert('Google page sync delegates to platform sync service when running in Chrome or Electron',
        googleSyncScript.includes('getPlatformSyncService')
        && googleSyncScript.includes('TimeWhereChromeSyncService')
        && googleSyncScript.includes('TimeWhereDesktopSyncService')
        && googleSyncScript.includes('service.requestRun')
        && googleSyncScript.includes('service.scheduleRun')
        && googleSyncScript.includes('bypassPlatformSyncService'));
    assert('TimeWherePlatform exposes Chrome and Desktop sync service contracts',
        platformScript.includes("sync: ['getStatus', 'requestRun', 'pause', 'resume']")
        && platformScript.includes('TimeWhereChromeSyncService?.requestRun')
        && platformScript.includes('chrome_page_sync_service_unavailable')
        && platformScript.includes('TimeWhereDesktopSyncService?.requestRun')
        && platformScript.includes('desktop_sync_service_unavailable'));
    assert('Desktop Google sync OAuth path uses bundled installed-app client id, PKCE plus bundled client metadata secret, and safe token storage',
        desktopAuthScript.includes('541406150907')
        && desktopAuthScript.includes('0koum8v8mms5d4lrnhuavuh5b55hhben.apps.googleusercontent.com')
        && desktopAuthScript.includes(".join('-')")
        && desktopAuthScript.includes('DEFAULT_DESKTOP_OAUTH_CLIENT_SECRET')
        && desktopAuthScript.includes("require('./desktop-oauth-secrets')")
        && !desktopAuthScript.includes(['GOC', 'SPX-'].join(''))
        && desktopAuthScript.includes('TIMEWHERE_GOOGLE_DESKTOP_CLIENT_ID')
        && desktopAuthScript.includes('net.fetch')
        && desktopAuthScript.includes('openid')
        && desktopAuthScript.includes('profile')
        && desktopAuthScript.includes('email')
        && desktopAuthScript.includes('USERINFO_ENDPOINT')
        && desktopAuthScript.includes('account_key')
        && desktopAuthScript.includes('sha256Hex')
        && !desktopAuthScript.includes('return { email: null }')
        && desktopAuthScript.includes('desktop_oauth_network_failed')
        && desktopAuthScript.includes('desktop_oauth_refresh_token_revoked')
        && desktopAuthScript.includes('desktop_oauth_session_control_required')
        && desktopAuthScript.includes('markStoredRefreshTokenInvalid')
        && desktopAuthScript.includes('getOAuthConfigDiagnostics')
        && desktopAuthScript.includes('client_id_tail')
        && desktopAuthScript.includes('client_secret_fingerprint')
        && desktopAuthScript.includes('env_client_id_override')
        && desktopAuthScript.includes('google_error_subtype')
        && desktopAuthScript.includes('force_consent')
        && desktopAuthScript.includes('disconnectGoogleToken')
        && desktopAuthScript.includes('client_secret: credentials.clientSecret')
        && desktopAuthScript.includes("auth_mode: credentials.clientSecret")
        && desktopAuthScript.includes('pkce_desktop_client_metadata_secret')
        && desktopAuthScript.includes('pkce_public_client_override')
        && desktopAuthScript.includes('code_challenge_method')
        && desktopAuthScript.includes('S256')
        && desktopAuthScript.includes('safeStorage.encryptString')
        && desktopAuthScript.includes('refusing to save a plaintext refresh token')
        && desktopAuthScript.includes('desktop_oauth_saved_token_unreadable')
        && desktopAuthScript.includes('await clearState()'));
    assert('Desktop packaging prepares and bundles generated OAuth secret module without tracking it',
        desktopPackage.scripts['prepackage:win'].includes('prepare-desktop-oauth-secret.ps1')
        && desktopPackage.scripts['prepackage:mac'].includes('prepare-desktop-oauth-secret.ps1')
        && desktopPackage.build.files.includes('desktop-oauth-secrets.js')
        && gitignore.includes('platforms/desktop-electron/desktop-oauth-secrets.js'));
    assert('Settings surfaces actionable desktop OAuth failure reasons',
        settingsScript.includes('getGoogleSyncFailureMessage')
        && settingsScript.includes('desktop_token_storage_unavailable')
        && settingsScript.includes('desktop_oauth_saved_token_unreadable')
        && settingsScript.includes('desktop_oauth_not_connected')
        && settingsScript.includes('desktop_oauth_network_failed')
        && settingsScript.includes('desktop_oauth_account_required')
        && settingsScript.includes('desktop_oauth_refresh_token_revoked')
        && settingsScript.includes('desktop_oauth_session_control_required')
        && settingsScript.includes('expired or revoked')
        && settingsScript.includes('OAuth client metadata 不匹配')
        && settingsScript.includes('handleRevokeGoogleSyncAuthorization')
        && settingsScript.includes('executeRevokeGoogleSyncAuthorization')
        && settingsScript.includes('断开这台设备的 Google 数据同步')
        && settingsScript.includes('其他设备授权不受影响')
        && settingsScript.includes('同一 Google 项目下其他设备的授权也可能失效')
        && settingsScript.includes('account_mismatch')
        && settingsScript.includes('conflict_detail_missing')
        && settingsScript.includes('oauth2.googleapis.com')
        && settingsScript.includes('client_secret is missing')
        && settingsScript.includes('内置 Google Desktop OAuth client metadata')
        && settingsScript.includes('client ID/secret 是否匹配')
        && !settingsScript.includes('不需要也不会保存 client secret')
        && !settingsScript.includes('desktop-oauth.local.json')
        && settingsScript.includes('redirect_uri_mismatch')
        && settingsScript.includes('Drive API')
        && settingsScript.includes('last_auth_error_subtype')
        && settingsScript.includes('last_oauth_diagnostics')
        && settingsScript.includes('last_error: message'));
    assert('Settings surfaces detailed Drive 403 reasons and desktop background sync state',
        settingsScript.includes('insufficientPermissions')
        && settingsScript.includes('appNotConfiguredForUser')
        && settingsScript.includes('accessNotConfigured')
        && settingsScript.includes('last_google_reason')
        && settingsScript.includes('updateGoogleSyncServiceDisplay')
        && settingsScript.includes('桌面后台同步：冲突暂停'));
    assert('Settings keeps connect button visible after first failed Google authorization',
        settingsScript.includes("state?.status !== 'failed'")
        && settingsScript.includes('state.connected_at || state.last_success_at || state.last_restore_at || state.last_force_upload_at'));
    assert('Settings keeps defensive desktop sync not-configured copy without blocking local use',
        settingsScript.includes('desktop_oauth_client_id_missing')
        && settingsScript.includes('桌面同步未配置')
        && settingsScript.includes('Windows 本地功能不受影响'));
    assert('Settings sync preview has explicit confirmation handler', settingsScript.includes('handleApplyGoogleSyncPreview') && settingsScript.includes('确认同步选中项'));
    assert('Settings confirmation supports v1 conflict choices', settingsScript.includes("mode === 'v1_conflicts'") && settingsScript.includes('resolveSyncConflicts'));
    assert('Settings renders connected Google account chip and switch account action',
        settingsHtml.includes('googleSyncAccountEmail')
        && settingsHtml.includes('switchGoogleSyncAccountBtn')
        && settingsScript.includes('formatGoogleSyncAccountLabel')
        && settingsScript.includes('confirmGoogleAccountSwitch')
        && settingsScript.includes('force_account_selection'));
    assert('Settings conflict detail recovery does not rely on argument object shims',
        settingsScript.includes('renderGoogleSyncConflictEmpty')
        && settingsScript.includes('conflict_detail_missing')
        && settingsScript.includes('showStoredGoogleSyncConflicts(options = {})')
        && !settingsScript.includes('arguments[0]'));
    assert('Settings conflict UI summarizes records with business fields',
        settingsScript.includes('summarizeGoogleSyncBusinessRecord')
        && settingsScript.includes("table === 'tasks'")
        && settingsScript.includes("label: '开始日期'")
        && settingsScript.includes("label: '截止日期'")
        && settingsScript.includes("label: '状态'")
        && settingsScript.includes('GOOGLE_SYNC_PROGRESS_LABELS'));
    assert('Settings conflict UI renders local and cloud comparison columns',
        settingsScript.includes('google-sync-conflict-compare')
        && settingsScript.includes('本设备版本')
        && settingsScript.includes('云端版本')
        && settingsScript.includes('renderGoogleSyncConflictSide'));
    assert('Settings conflict UI shows delete conflicts as deleted business state',
        settingsScript.includes("value: '已删除'")
        && settingsScript.includes("deleted ? ' deleted' : ''"));
    assert('Settings conflict UI labels selected settings in Chinese',
        settingsScript.includes('GOOGLE_SYNC_SETTING_LABELS')
        && settingsScript.includes('ManageBac 订阅链接')
        && settingsScript.includes('默认时长'));
    assert('Settings conflict actions still keep skip local cloud choices',
        settingsScript.includes('<option value="skip" selected>跳过</option>')
        && settingsScript.includes('<option value="local">使用本地</option>')
        && settingsScript.includes('<option value="cloud">使用云端</option>'));
    assert('Settings conflict CSS supports two-column comparison and changed fields',
        settingsCss.includes('.google-sync-conflict-compare')
        && settingsCss.includes('.google-sync-conflict-side')
        && settingsCss.includes('.google-sync-conflict-field.changed'));
    assert('Settings dangerous upload/restore use v1 force helpers', settingsScript.includes('forceUploadLocalToCloud') && settingsScript.includes('forceRestoreCloudToLocal'));
    assert('Settings recovery prompt only shows for disconnected empty user data',
        settingsScript.includes('function getGoogleSyncLocalUserDataCounts')
        && settingsScript.includes('getAllTasks')
        && settingsScript.includes('getEvents')
        && settingsScript.includes('getHabits')
        && settingsScript.includes('listDailyJournals')
        && settingsScript.includes('isMeaningfulGoogleSyncRecoveryJournal')
        && settingsScript.includes('counts.total !== 0')
        && settingsScript.includes('isGoogleSyncConnectedState(state)'));
    const connectAndRestoreBlock = (settingsScript.match(/async function handleConnectAndRestoreGoogleSync[\s\S]*?async function handleUploadGoogleSync/) || [''])[0];
    assert('Settings connect-and-restore flow opens restore confirmation instead of restoring directly',
        connectAndRestoreBlock.includes('async function handleConnectAndRestoreGoogleSync')
        && connectAndRestoreBlock.includes("openGoogleSyncDangerModal('restore')")
        && !connectAndRestoreBlock.includes('forceRestoreCloudToLocal'));
    assert('main pages load google-sync.js for page-open sync checks',
        [
            'extension/pages/focus/focus.html',
            'extension/pages/calendar/calendar.html',
            'extension/pages/tasks/tasks.html',
            'extension/popup/popup.html'
        ].every(file => read(file).includes('google-sync.js')));
    assert('desktop-capable pages load shared sync services after google-sync.js',
        [
            'extension/pages/focus/focus.html',
            'extension/pages/calendar/calendar.html',
            'extension/pages/tasks/tasks.html',
            'extension/pages/settings/settings.html',
            'extension/popup/popup.html',
            'extension/popup/sidepanel.html'
        ].every(file => {
            const html = read(file);
            return html.indexOf('sync-runtime-service.js') > html.indexOf('google-sync.js')
                && html.indexOf('chrome-sync-service.js') > html.indexOf('sync-runtime-service.js')
                && html.indexOf('desktop-sync-service.js') > html.indexOf('chrome-sync-service.js');
        }));
    assert('main page scripts call non-blocking Google page sync check',
        [
            'extension/pages/focus/script.js',
            'extension/pages/calendar/script.js',
            'extension/pages/tasks/script.js',
            'extension/popup/popup.js'
        ].every(file => read(file).includes('runPageAutoSync(TimeWhereDB)')));
    assert('DB write paths mark Google sync dirty metadata', dbScript.includes('markGoogleSyncDirty') && dbScript.includes('markEntityDirty'));
    assert('DB delete paths mark Google sync tombstones', dbScript.includes('markGoogleSyncDeleted') && dbScript.includes('markEntityDeleted'));
    assert('DB write/delete sync scheduling uses shared 3-minute debounce default without local 30-second override',
        dbScript.includes('api.schedulePageAutoSync(this);')
        && !dbScript.includes('debounce_ms: 30 * 1000'));
    assert('DB updateTask can preserve user updated_at for derived Arrange writes',
        dbScript.includes('skipUserUpdatedAt')
        && dbScript.includes('googleSyncDerivedBaseRecord')
        && dbScript.includes('changedFields: Object.keys(data || {})'));
    assert('Task Arrange writes start_date and priority as local derived sync fields',
        schedulingScript.includes('googleSyncDerivedFields')
        && schedulingScript.includes('googleSyncDerivedSource')
        && schedulingScript.includes('task_arrange_auto')
        && schedulingScript.includes('skipUserUpdatedAt'));
    assert('Pending Task Arrange review writes derived fields with the same sync semantics',
        taskArrangeAutoScript.includes('googleSyncDerivedFields')
        && taskArrangeAutoScript.includes('googleSyncDerivedSource')
        && taskArrangeAutoScript.includes('task_arrange_auto')
        && taskArrangeAutoScript.includes('skipUserUpdatedAt'));
    assert('DB settings sync is limited to approved selected keys', dbScript.includes('SELECTED_SETTING_KEYS?.includes(key)'));
    assert('Google sync runtime state is not in selected cloud settings', !GoogleSync.SELECTED_SETTING_KEYS.includes(GoogleSync.GOOGLE_SYNC_STATE_KEY));
    assert('Google account display keys are excluded from cloud settings',
        GoogleSync.EXCLUDED_SETTING_KEYS.has(GoogleSync.GOOGLE_SYNC_ACCOUNT_EMAIL_KEY)
        && GoogleSync.EXCLUDED_SETTING_KEYS.has(GoogleSync.GOOGLE_SYNC_ACCOUNT_NAME_KEY)
        && GoogleSync.EXCLUDED_SETTING_KEYS.has(GoogleSync.GOOGLE_SYNC_ACCOUNT_KEY_KEY)
        && GoogleSync.EXCLUDED_SETTING_KEYS.has(GoogleSync.GOOGLE_SYNC_ACCOUNT_PICTURE_KEY)
        && GoogleSync.EXCLUDED_SETTING_KEYS.has(GoogleSync.GOOGLE_SYNC_HISTORY_KEY));
    assert('Desktop work reminder state is excluded from cloud settings',
        GoogleSync.DESKTOP_WORK_REMINDER_STATE_KEY === 'desktop_work_reminder_state_v1'
        && GoogleSync.EXCLUDED_SETTING_KEYS.has(GoogleSync.DESKTOP_WORK_REMINDER_STATE_KEY)
        && !GoogleSync.SELECTED_SETTING_KEYS.includes(GoogleSync.DESKTOP_WORK_REMINDER_STATE_KEY));
    assert('Google sync history helpers are exported for Settings diagnostics',
        typeof GoogleSync.appendGoogleSyncHistory === 'function'
        && typeof GoogleSync.getGoogleSyncHistory === 'function'
        && typeof GoogleSync.clearGoogleSyncHistory === 'function'
        && GoogleSync.GOOGLE_SYNC_HISTORY_LIMIT === 50);

    const manifestJson = JSON.parse(read('extension/manifest.json'));
    assert('manifest includes Chrome identity permission', manifestJson.permissions.includes('identity'));
    assert('manifest includes Chrome identity.email permission for local account display', manifestJson.permissions.includes('identity.email'));
    assert('manifest OAuth2 client id is configured', /^[0-9a-z-]+\.apps\.googleusercontent\.com$/.test(manifestJson.oauth2?.client_id || ''));
    assertEqual('source manifest keeps development OAuth client for fixed unpacked extension ID',
        manifestJson.oauth2?.client_id,
        '541406150907-rj6d6npl4dnoqcfiaol68tqh8chbpdpg.apps.googleusercontent.com');
    assert('manifest OAuth2 client id placeholder removed', !/YOUR_GOOGLE_OAUTH_CLIENT_ID/.test(manifestJson.oauth2?.client_id || ''));
    assert('manifest only requests Drive appDataFolder scope', manifestJson.oauth2?.scopes?.length === 1 && manifestJson.oauth2.scopes[0] === 'https://www.googleapis.com/auth/drive.appdata');
    assert('manifest includes fixed development public key', typeof manifestJson.key === 'string' && manifestJson.key.length > 300);
    assertEqual('manifest key derives expected development extension ID', extensionIdFromManifestKey(manifestJson.key), 'ogdjmelmfkfahppahhkkggdejjainbnd');
    assert('manifest includes narrow Drive API host permission', manifestJson.host_permissions.includes('https://www.googleapis.com/drive/v3/*'));
    assert('manifest includes narrow Drive upload host permission', manifestJson.host_permissions.includes('https://www.googleapis.com/upload/drive/v3/*'));

    const cwsPackageScript = read('tools/package-cws.ps1');
    assert('CWS packaging script injects CWS OAuth client for store extension ID',
        cwsPackageScript.includes('541406150907-u6pvenpfdpgfmgnv8h9f126l4hc4oru9.apps.googleusercontent.com')
        && cwsPackageScript.includes('PSObject.Properties.Remove("key")'));

    const localPackageScript = read('tools/package-local-unpacked.ps1');
    assert('local unpacked packaging script keeps fixed development ID and OAuth client',
        localPackageScript.includes('ogdjmelmfkfahppahhkkggdejjainbnd')
        && localPackageScript.includes('541406150907-rj6d6npl4dnoqcfiaol68tqh8chbpdpg.apps.googleusercontent.com')
        && localPackageScript.includes('Local unpacked bundle requires manifest.key'));

    const repoText = [
        googleSyncScript,
        desktopSyncServiceScript,
        read('tests/google-sync.test.js'),
        read('extension/pages/settings/settings.html'),
        read('extension/pages/settings/script.js'),
        read('extension/shared/js/google-sync-status-ui.js'),
        read('platforms/desktop-electron/desktop-auth.js'),
        read('tools/prepare-desktop-oauth-secret.ps1')
    ].join('\n');
    assert('repo Google sync code/tests do not contain real OAuth token values or client secrets',
        !repoText.includes(['ya', '29.'].join(''))
        && !repoText.includes(['GOC', 'SPX-'].join('')));

    const disconnectedDisplay = GoogleSyncStatusUI._test.deriveDisplayState({ syncState: { status: 'not_configured' } });
    assertEqual('product sync indicator maps not configured to disconnected UI', disconnectedDisplay.state, 'disconnected');
    assertEqual('product sync indicator disconnected label is clear', disconnectedDisplay.label, 'Google 未连接');

    const connectedDisplay = GoogleSyncStatusUI._test.deriveDisplayState({
        syncState: { status: 'connected', last_success_at: new Date().toISOString() },
        accountInfo: { connected: true, name: 'Student', email: 'student@example.invalid', picture: 'https://lh3.googleusercontent.com/a/redacted' }
    });
    assertEqual('product sync indicator maps connected account to connected UI', connectedDisplay.state, 'connected');
    assert('product sync indicator connected account shows account identity in popover data', connectedDisplay.account_label.includes('Student'));
    assert('product sync indicator keeps Google account picture for avatar rendering', connectedDisplay.account_picture === 'https://lh3.googleusercontent.com/a/redacted');

    const syncingDisplay = GoogleSyncStatusUI._test.deriveDisplayState({ syncState: { status: 'syncing' } });
    assertEqual('product sync indicator maps active sync to syncing UI', syncingDisplay.state, 'syncing');

    const longRunningDisplay = GoogleSyncStatusUI._test.deriveDisplayState({
        serviceState: { status: 'long_running', running: true, current_run_duration_ms: 92000 }
    });
    assertEqual('product sync indicator maps long running service state to long running UI', longRunningDisplay.state, 'long_running');
    assert('product sync indicator shows long running duration', longRunningDisplay.detail.includes('同步耗时较长'));

    const queuedDisplay = GoogleSyncStatusUI._test.deriveDisplayState({
        serviceState: { pending: true, pending_trigger_count: 2, pending_reasons: ['interval', 'local_write'] }
    });
    assertEqual('product sync indicator maps pending service queue to queued UI', queuedDisplay.state, 'queued');
    assert('product sync indicator includes queued trigger summary', queuedDisplay.detail.includes('2 次触发'));

    const conflictDisplay = GoogleSyncStatusUI._test.deriveDisplayState({
        syncState: { status: 'conflict' },
        conflicts: [{ key: 'tasks:1' }, { key: 'tasks:2' }]
    });
    assertEqual('product sync indicator maps conflicts to conflict UI', conflictDisplay.state, 'conflict');
    assertEqual('product sync indicator derives conflict count from conflict details', conflictDisplay.conflict_count, 2);

    const retryDisplay = GoogleSyncStatusUI._test.deriveDisplayState({
        syncState: { status: 'failed', retryable: true },
        serviceState: { retry_after: new Date(Date.now() + 60000).toISOString() }
    });
    assertEqual('product sync indicator maps retryable failure to waiting retry UI', retryDisplay.state, 'retry');

    const failedDisplay = GoogleSyncStatusUI._test.deriveDisplayState({
        syncState: {
            status: 'failed',
            last_error: `Token ${['ya', '29.secret'].join('')} failed for student@example.invalid with ${['GOC', 'SPX-secret'].join('')}`
        }
    });
    assertEqual('product sync indicator maps non-retry failure to failed UI', failedDisplay.state, 'failed');
    assert('product sync indicator redacts tokens emails and secrets from failure text',
        failedDisplay.detail.includes('[token]')
        && failedDisplay.detail.includes('[account]')
        && failedDisplay.detail.includes('[secret]')
        && !failedDisplay.detail.includes('student@example.invalid')
        && !failedDisplay.detail.includes(['GOC', 'SPX-secret'].join('')));

    const mismatchDisplay = GoogleSyncStatusUI._test.deriveDisplayState({ syncState: { status: 'failed', reason: 'account_mismatch' } });
    assertEqual('product sync indicator maps account mismatch to blocking UI', mismatchDisplay.state, 'account_mismatch');
    assert('product sync indicator offers sync history action and no longer exposes transient syncing API',
        googleSyncScript.includes('timewhere-google-sync-state')
        && read('extension/shared/js/google-sync-status-ui.js').includes('查看同步记录')
        && read('extension/shared/js/google-sync-status-ui.js').includes('google-sync-account-initial')
        && !read('extension/shared/js/google-sync-status-ui.js').includes('setTransientStatus'));

    console.log('\n' + '='.repeat(42));
    console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
    if (failed > 0) process.exit(1);
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
