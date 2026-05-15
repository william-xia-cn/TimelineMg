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
            google_sync_state: { status: 'connected' },
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
    assert('snapshot includes Google sync metadata state', snapshot.data.settings.google_sync_state?.status === 'connected');
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

    const settingsHtml = read('extension/pages/settings/settings.html');
    const settingsScript = read('extension/pages/settings/script.js');
    assert('Settings UI contains Google 数据同步 section', settingsHtml.includes('Google 数据同步'));
    assert('Settings UI includes connect button', settingsHtml.includes('connectGoogleSyncBtn') && settingsHtml.includes('连接 Google 同步'));
    assert('Settings UI includes immediate sync button', settingsHtml.includes('syncGoogleNowBtn') && settingsHtml.includes('立即同步'));
    assert('Settings UI includes restore button', settingsHtml.includes('restoreGoogleSyncBtn') && settingsHtml.includes('从 Google 恢复'));
    assert('Settings UI includes upload button', settingsHtml.includes('uploadGoogleSyncBtn') && settingsHtml.includes('上传本设备数据'));
    assert('Settings UI includes disconnect button', settingsHtml.includes('disconnectGoogleSyncBtn') && settingsHtml.includes('断开同步'));
    assert('Settings loads google-sync.js before page script', settingsHtml.indexOf('google-sync.js') > -1 && settingsHtml.indexOf('google-sync.js') < settingsHtml.indexOf('script.js"></script>'));
    assert('Settings sync preview has explicit confirmation handler', settingsScript.includes('handleApplyGoogleSyncPreview') && settingsScript.includes('确认同步选中项'));
    assert('Settings confirmation uploads merged snapshot after choices', settingsScript.includes('buildUploadSnapshotFromChoices') && settingsScript.includes('uploadJsonFile(api.SNAPSHOT_FILE_NAME'));

    const manifestJson = JSON.parse(read('extension/manifest.json'));
    assert('manifest includes Chrome identity permission', manifestJson.permissions.includes('identity'));
    assert('manifest includes OAuth2 placeholder client id', /YOUR_GOOGLE_OAUTH_CLIENT_ID/.test(manifestJson.oauth2?.client_id || ''));
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
