/**
 * Google data sync foundation tests.
 * Run: node tests/google-sync.test.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const GoogleSync = require('../extension/shared/js/google-sync.js');

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
        const id = row.id;
        const index = this.rows.findIndex(item => String(item.id) === String(id));
        if (index >= 0) {
            this.rows[index] = { ...row };
        } else {
            this.rows.push({ ...row });
        }
    }

    async get(id) {
        return this.rows.find(item => String(item.id) === String(id)) || null;
    }

    async delete(id) {
        this.rows = this.rows.filter(item => String(item.id) !== String(id));
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
            habits: new FakeTable([{ id: 'habit-1', title: 'Words', created_at: '2026-05-01T00:00:00.000Z' }])
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
            google_sync_account_email: 'student@example.invalid',
            access_token: 'secret-access-token',
            refresh_token: 'secret-refresh-token',
            google_email: 'student@example.invalid',
            management_review_pending: [{ event_uid: 'private-pending' }],
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
    assert('snapshot includes MatrixView subject mappings', Array.isArray(snapshot.data.settings.matrixview_subject_mappings));
    assert('snapshot includes ManageBac subject mappings', Array.isArray(snapshot.data.settings.managebac_subject_mappings));
    assert('snapshot includes ManageBac ICS config', snapshot.data.settings.managebac_ics_config?.link?.includes('example.invalid'));
    assert('snapshot includes approved appearance settings', snapshot.data.settings.appearance_background === 'calm' && snapshot.data.settings.appearance_avatar === 'default');
    assert('snapshot includes approved task default settings', snapshot.data.settings.default_duration === 45 && snapshot.data.settings.default_priority === 'medium');
    assert('snapshot excludes Google sync runtime state', !('google_sync_state' in snapshot.data.settings));
    assert('snapshot excludes local Google account email display', !('google_sync_account_email' in snapshot.data.settings));
    assert('snapshot excludes OAuth access token', !('access_token' in snapshot.data.settings));
    assert('snapshot excludes OAuth refresh token', !('refresh_token' in snapshot.data.settings));
    assert('snapshot excludes Google email display', !('google_email' in snapshot.data.settings));
    assert('snapshot excludes pending UI state', !('management_review_pending' in snapshot.data.settings));
    assert('snapshot excludes raw import files', !('raw_import_file' in snapshot.data.settings));

    assert('snapshot validates', GoogleSync.validateSnapshot(snapshot) === true);
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

    const settingsHtml = read('extension/pages/settings/settings.html');
    const settingsScript = read('extension/pages/settings/script.js');
    const dbScript = read('extension/shared/js/db.js');
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
    assert('Settings UI includes connect button', settingsHtml.includes('connectGoogleSyncBtn') && settingsHtml.includes('连接 Google 账户同步'));
    assert('Settings UI includes manual sync button', settingsHtml.includes('syncGoogleNowBtn') && settingsHtml.includes('手动同步'));
    assert('Settings UI includes cloud download danger button', settingsHtml.includes('restoreGoogleSyncBtn') && settingsHtml.includes('↓ 下载到本地'));
    assert('Settings UI includes cloud upload danger button', settingsHtml.includes('uploadGoogleSyncBtn') && settingsHtml.includes('↑ 上传到云端'));
    assert('Settings UI includes disconnect button', settingsHtml.includes('disconnectGoogleSyncBtn') && settingsHtml.includes('断开连接'));
    assert('Settings UI includes conflict processing entry', settingsHtml.includes('processGoogleConflictsBtn') && settingsHtml.includes('处理冲突'));
    assert('Settings UI includes formal dangerous sync modal', settingsHtml.includes('googleSyncDangerModal') && settingsHtml.includes('googleSyncDangerConfirmInput'));
    assert('Settings UI dangerous modal requires phrase-gated confirmation', settingsScript.includes('updateGoogleSyncDangerConfirmState') && settingsScript.includes("config.phrase"));
    assert('Google upload/download danger actions open modal instead of window.confirm', settingsScript.includes("openGoogleSyncDangerModal('upload')") && settingsScript.includes("openGoogleSyncDangerModal('restore')"));
    assert('Google danger modal contains upload and download confirmation phrases', settingsScript.includes("phrase: '上传到云端'") && settingsScript.includes("phrase: '下载到本地'"));
    assert('Settings loads google-sync.js before page script', settingsHtml.indexOf('google-sync.js') > -1 && settingsHtml.indexOf('google-sync.js') < settingsHtml.indexOf('script.js"></script>'));
    assert('Settings sync preview has explicit confirmation handler', settingsScript.includes('handleApplyGoogleSyncPreview') && settingsScript.includes('确认同步选中项'));
    assert('Settings confirmation supports v1 conflict choices', settingsScript.includes("mode === 'v1_conflicts'") && settingsScript.includes('resolveSyncConflicts'));
    assert('Settings dangerous upload/restore use v1 force helpers', settingsScript.includes('forceUploadLocalToCloud') && settingsScript.includes('forceRestoreCloudToLocal'));
    assert('main pages load google-sync.js for page-open sync checks',
        [
            'extension/pages/focus/focus.html',
            'extension/pages/calendar/calendar.html',
            'extension/pages/tasks/tasks.html',
            'extension/popup/popup.html'
        ].every(file => read(file).includes('google-sync.js')));
    assert('main page scripts call non-blocking Google page sync check',
        [
            'extension/pages/focus/script.js',
            'extension/pages/calendar/script.js',
            'extension/pages/tasks/script.js',
            'extension/popup/popup.js'
        ].every(file => read(file).includes('runPageAutoSync(TimeWhereDB)')));
    assert('DB write paths mark Google sync dirty metadata', dbScript.includes('markGoogleSyncDirty') && dbScript.includes('markEntityDirty'));
    assert('DB delete paths mark Google sync tombstones', dbScript.includes('markGoogleSyncDeleted') && dbScript.includes('markEntityDeleted'));
    assert('DB settings sync is limited to approved selected keys', dbScript.includes('SELECTED_SETTING_KEYS?.includes(key)'));
    assert('Google sync runtime state is not in selected cloud settings', !GoogleSync.SELECTED_SETTING_KEYS.includes(GoogleSync.GOOGLE_SYNC_STATE_KEY));
    assert('Google account email display key is excluded from cloud settings', GoogleSync.EXCLUDED_SETTING_KEYS.has(GoogleSync.GOOGLE_SYNC_ACCOUNT_EMAIL_KEY));

    const manifestJson = JSON.parse(read('extension/manifest.json'));
    assert('manifest includes Chrome identity permission', manifestJson.permissions.includes('identity'));
    assert('manifest includes Chrome identity.email permission for local account display', manifestJson.permissions.includes('identity.email'));
    assert('manifest OAuth2 client id is configured', /^[0-9a-z-]+\.apps\.googleusercontent\.com$/.test(manifestJson.oauth2?.client_id || ''));
    assert('manifest OAuth2 client id placeholder removed', !/YOUR_GOOGLE_OAUTH_CLIENT_ID/.test(manifestJson.oauth2?.client_id || ''));
    assert('manifest only requests Drive appDataFolder scope', manifestJson.oauth2?.scopes?.length === 1 && manifestJson.oauth2.scopes[0] === 'https://www.googleapis.com/auth/drive.appdata');
    assert('manifest includes fixed development public key', typeof manifestJson.key === 'string' && manifestJson.key.length > 300);
    assertEqual('manifest key derives expected development extension ID', extensionIdFromManifestKey(manifestJson.key), 'ogdjmelmfkfahppahhkkggdejjainbnd');
    assert('manifest includes narrow Drive API host permission', manifestJson.host_permissions.includes('https://www.googleapis.com/drive/v3/*'));
    assert('manifest includes narrow Drive upload host permission', manifestJson.host_permissions.includes('https://www.googleapis.com/upload/drive/v3/*'));

    const repoText = [
        read('extension/shared/js/google-sync.js'),
        read('tests/google-sync.test.js'),
        read('extension/pages/settings/settings.html'),
        read('extension/pages/settings/script.js')
    ].join('\n');
    assert('repo Google sync code/tests do not contain real OAuth token values or client secrets', !/ya29\.|client_secret[_-]?[a-z0-9]/i.test(repoText));

    console.log('\n' + '='.repeat(42));
    console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
    if (failed > 0) process.exit(1);
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
