/**
 * ManageBac subject mapping tests.
 * Run: node tests/managebac.test.js
 */

const fs = require('fs');
const path = require('path');
const ManageBac = require('../extension/shared/js/managebac.js');

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

function countSanitizedLeftNavClasses(html) {
    const links = html.match(/f-menu__submenu-link[\s\S]*?href=3D"https:\/\/example\.invalid\/student\/classes\/[^"]+"/g) || [];
    return links.filter(link => !/\/classes\/my"/.test(link)).length;
}

function countSanitizedRightTiles(html) {
    return (html.match(/f-class-tile/g) || []).length;
}

class FakeDB {
    constructor({ matrixReady = true } = {}) {
        this.settings = {};
        this.tasks = [];
        this.nextTask = 1;
        this.plans = [
            { id: 1, name: 'English Language Acquisition Phase 5', subject: 'English Language Acquisition Phase 5' },
            { id: 2, name: 'Mathematics Analysis HL', subject: 'Mathematics Analysis HL' },
            { id: 3, name: 'Other School Plan', subject: null }
        ];
        if (matrixReady) {
            this.settings[ManageBac.MATRIXVIEW_MAPPING_KEY] = [
                { subject: 'English Language Acquisition Phase 5', subject_in_matrixview: 'English Language Acquisition Phase 5' },
                { subject: 'Mathematics Analysis HL', subject_in_matrixview: 'Mathematics Analysis HL' }
            ];
        }
    }

    async getSetting(key) {
        return this.settings[key] ?? null;
    }

    async setSetting(key, value) {
        this.settings[key] = value;
    }

    async getPlans() {
        return this.plans.slice();
    }

    isAllowedManageBacLocalStatusUpdate(data = {}) {
        const allowedFields = new Set(['progress', 'completed_at', 'status', 'start_date', 'priority']);
        const fields = Object.keys(data || {});
        return fields.length > 0 && fields.every(field => allowedFields.has(field));
    }

    assertWritable(task, options = {}, data = null) {
        if (ManageBac.isManageBacTask(task) && !options.allowManageBacSync) {
            if (data && this.isAllowedManageBacLocalStatusUpdate(data)) return;
            throw new Error('ManageBac source tasks are read-only');
        }
    }

    async getAllTasks() {
        return this.tasks.map(task => ({ ...task }));
    }

    async addTask(task, options = {}) {
        this.assertWritable(task, options);
        const saved = {
            id: `task-${this.nextTask++}`,
            created_at: '2026-05-13T00:00:00.000Z',
            updated_at: '2026-05-13T00:00:00.000Z',
            ...task
        };
        this.tasks.push(saved);
        return saved;
    }

    async updateTask(id, data, options = {}) {
        const index = this.tasks.findIndex(task => task.id === id);
        if (index < 0) throw new Error('Task not found');
        this.assertWritable(this.tasks[index], options, data);
        this.tasks[index] = { ...this.tasks[index], ...data, id };
        return this.tasks[index];
    }

    async deleteTask(id, options = {}) {
        const index = this.tasks.findIndex(task => task.id === id);
        if (index < 0) return;
        this.assertWritable(this.tasks[index], options);
        this.tasks.splice(index, 1);
    }
}

async function run() {
    console.log('\nTimeWhere ManageBac mapping tests\n' + '='.repeat(44));

    const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'managebac-subjects-sanitized.html'), 'utf8');
    const parsed = ManageBac.parseManageBacHtml(fixture);
    assertEqual('sanitized ManageBac HTML parse status is ok', parsed.parse_status, 'ok');
    assertEqual('sanitized ManageBac HTML returns four subjects', parsed.subjects.length, 4);
    assert('parser extracts subject teacher and room', parsed.subjects.some(subject => {
        return subject.subject_in_managebac === 'English Language Acquisition Phase 5'
            && subject.teacher === 'Teacher, English One'
            && subject.room === '1359';
    }));

    const realStructureFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'managebac-my-classes-sanitized.mhtml'), 'utf8');
    const parsedRealStructure = ManageBac.parseManageBacHtml(realStructureFixture);
    assertEqual('sanitized My Classes MHTML parse status is ok', parsedRealStructure.parse_status, 'ok');
    assert('sanitized My Classes MHTML returns subjects', parsedRealStructure.subjects.length > 0);
    assert('sanitized My Classes MHTML subject text is readable', parsedRealStructure.subjects.every(subject => {
        return typeof subject.subject_in_managebac === 'string'
            && /[A-Za-z]/.test(subject.subject_in_managebac)
            && !/[\u0000-\u001F\u007F-\u009F]/.test(subject.subject_in_managebac);
    }));
    assert('sanitized My Classes MHTML extracts teacher and room when present', parsedRealStructure.subjects.some(subject => {
        return subject.subject_in_managebac === 'Mathematics Analysis HL'
            && subject.teacher === 'Teacher, Math One'
            && subject.room === '1535';
    }));

    const leftNavFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'managebac-my-classes-left-nav-sanitized.mhtml'), 'utf8');
    const leftNavParsed = ManageBac.parseManageBacHtml(leftNavFixture);
    const leftNavStats = ManageBac.inspectManageBacHtmlStructure(leftNavFixture);
    const expectedLeftNavCount = countSanitizedLeftNavClasses(leftNavFixture);
    const expectedRightTileCount = countSanitizedRightTiles(leftNavFixture);
    assertEqual('sanitized left-nav My Classes parse status is ok', leftNavParsed.parse_status, 'ok');
    assert('sanitized left-nav fixture has more left-nav classes than right-side tiles', expectedLeftNavCount > expectedRightTileCount);
    assertEqual('sanitized left-nav My Classes returns fixture left-nav record count', leftNavParsed.subjects.length, expectedLeftNavCount);
    assertEqual('parser sees fixture left-nav classes', leftNavStats.left_nav_class_count, expectedLeftNavCount);
    assertEqual('parser sees fixture right-side paginated tiles', leftNavStats.right_tile_count, expectedRightTileCount);
    assertEqual('parser prefers fixture left nav count over right-side tile count', leftNavStats.final_subject_count, expectedLeftNavCount);
    assert('right-side tiles enrich teacher and room where available', leftNavParsed.subjects.some(subject => {
        return subject.subject_in_managebac === 'English Language Acquisition Phase 5'
            && subject.teacher === 'Teacher, English One'
            && subject.room === '1359';
    }));
    assert('left-nav parser preserves ManageBac class href and id', leftNavParsed.subjects.some(subject => {
        return subject.subject_in_managebac === 'English Language Acquisition Phase 5'
            && subject.managebac_class_href === '/classes/2001'
            && subject.managebac_class_id === '2001';
    }));
    assert('left-nav dedup excludes the My Classes navigation entry', !leftNavParsed.subjects.some(subject => subject.subject_in_managebac === 'My Classes'));

    const badParsed = ManageBac.parseManageBacHtml('<html><body><p>No classes here</p></body></html>');
    assertEqual('bad HTML parse fails quality', badParsed.parse_status, 'failed_quality');
    assertEqual('bad HTML has explicit reason', badParsed.unsupported_reason, 'no_managebac_subject_rows');

    const blockedDb = new FakeDB({ matrixReady: false });
    const blocked = await ManageBac.getMappingPrecondition(blockedDb);
    assertEqual('precondition blocks before MatrixView mappings exist', blocked.ok, false);
    assertEqual('precondition reason is explicit', blocked.reason, 'matrixview_plans_required');

    const db = new FakeDB({ matrixReady: true });
    const precondition = await ManageBac.getMappingPrecondition(db);
    assertEqual('precondition passes with MatrixView mappings and Plans', precondition.ok, true);
    assertEqual('precondition exposes existing Plans only', precondition.planCount, 3);

    const preview = ManageBac.buildMappingPreview(parsed.subjects, precondition.plans);
    const english = preview.find(row => row.subject_in_managebac === 'English Language Acquisition Phase 5');
    const math = preview.find(row => row.subject_in_managebac === 'Mathematics Analysis HL');
    const counseling = preview.find(row => row.subject_in_managebac === 'College Counseling');
    assertEqual('auto-match maps English to existing Plan', english.plan_id, 1);
    assertEqual('auto-match maps Math to existing Plan', math.plan_id, 2);
    assertEqual('unmatched ManageBac subject remains empty', counseling.plan_id, '');

    const realStructurePreview = ManageBac.buildMappingPreview(parsedRealStructure.subjects, precondition.plans);
    assert('saved mapping behavior still works with My Classes MHTML rows', realStructurePreview.some(row => {
        return row.subject_in_managebac === 'English Language Acquisition Phase 5' && row.plan_id === 1;
    }));

    const rowsToSave = preview.map(row => {
        if (row.subject_in_managebac === 'College Counseling') return { ...row, plan_id: 3 };
        if (row.subject_in_managebac === 'Community Time') return { ...row, plan_id: '' };
        return row;
    });
    const saved = await ManageBac.saveMappings(db, rowsToSave, precondition.plans);
    assertEqual('save persists all ManageBac subject rows for traceability', saved.length, 4);
    assert('manual mapping to Other School Plan is preserved', saved.some(mapping => {
        return mapping.subject_in_managebac === 'College Counseling'
            && mapping.plan_id === 3
            && mapping.subject === 'Other School Plan'
            && mapping.sync_enabled === true;
    }));
    const savedLeftNavMappings = await ManageBac.saveMappings(new FakeDB({ matrixReady: true }), ManageBac.buildMappingPreview(leftNavParsed.subjects, precondition.plans), precondition.plans);
    assert('saved mappings preserve ManageBac class id', savedLeftNavMappings.some(mapping => {
        return mapping.subject_in_managebac === 'English Language Acquisition Phase 5'
            && mapping.managebac_class_href === '/classes/2001'
            && mapping.managebac_class_id === '2001';
    }));
    assert('empty mapping is saved as skipped future sync', saved.some(mapping => {
        return mapping.subject_in_managebac === 'Community Time'
            && mapping.plan_id === ''
            && mapping.subject === ''
            && mapping.sync_enabled === false;
    }));
    assertEqual('settings key stores ManageBac mappings', db.settings[ManageBac.SETTINGS_MAPPING_KEY].length, 4);

    const persisted = JSON.stringify(db.settings);
    assert('privacy fixture does not persist token URL', !persisted.includes('webcal://') && !persisted.includes('token'));
    assert('Phase 1 does not create tasks', !persisted.includes('managebac_task'));

    const icsFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'managebac-events-sanitized.ics'), 'utf8');
    const classIdIcsFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'managebac-events-class-id-sanitized.ics'), 'utf8');
    const fullEventTextIcsFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'managebac-events-full-event-text-sanitized.ics'), 'utf8');
    const paramColonIcsFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'managebac-events-param-colon-sanitized.ics'), 'utf8');
    const aliasPendingIcsFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'managebac-events-alias-pending-sanitized.ics'), 'utf8');
    const settingsHtml = fs.readFileSync(path.join(__dirname, '..', 'extension', 'pages', 'settings', 'settings.html'), 'utf8');
    const settingsCss = fs.readFileSync(path.join(__dirname, '..', 'extension', 'pages', 'settings', 'styles.css'), 'utf8');
    const settingsScript = fs.readFileSync(path.join(__dirname, '..', 'extension', 'pages', 'settings', 'script.js'), 'utf8');
    const managebacSyncHtml = fs.readFileSync(path.join(__dirname, '..', 'extension', 'pages', 'settings', 'managebac-sync.html'), 'utf8');
    const managebacSyncScript = fs.readFileSync(path.join(__dirname, '..', 'extension', 'pages', 'settings', 'managebac-sync.js'), 'utf8');
    const taskArrangeHtml = fs.readFileSync(path.join(__dirname, '..', 'extension', 'pages', 'settings', 'task-arrange.html'), 'utf8');
    const taskArrangeScript = fs.readFileSync(path.join(__dirname, '..', 'extension', 'pages', 'settings', 'task-arrange.js'), 'utf8');
    const tasksHtml = fs.readFileSync(path.join(__dirname, '..', 'extension', 'pages', 'tasks', 'tasks.html'), 'utf8');
    const tasksScript = fs.readFileSync(path.join(__dirname, '..', 'extension', 'pages', 'tasks', 'script.js'), 'utf8');
    const taskDetailScript = fs.readFileSync(path.join(__dirname, '..', 'extension', 'pages', 'tasks', 'detail-panel.js'), 'utf8');
    const parsedIcs = ManageBac.parseManageBacIcs(icsFixture);
    assertEqual('sanitized ICS parse status is ok', parsedIcs.parse_status, 'ok');
    assertEqual('sanitized ICS returns three events', parsedIcs.events.length, 3);
    assert('ICS parser extracts due date and title', parsedIcs.events.some(event => {
        return event.uid === 'mb-english-essay-1@example.invalid'
            && event.summary.includes('Essay Draft')
            && event.due_date === '2026-05-20';
    }));
    const sourceStartTask = ManageBac.eventToTask({
        uid: 'source-start',
        summary: 'English Essay',
        due_date: '2026-05-30',
        start_date: '2026-05-22'
    }, {
        plan_id: 1,
        subject: 'English Language Acquisition Phase 5',
        subject_in_managebac: 'English'
    }, '2026-05-13T00:00:00.000Z');
    assertEqual('ManageBac eventToTask preserves source DTSTART as start_date', sourceStartTask.start_date, '2026-05-22');
    const initializedSourceTask = ManageBac.eventToTask({
        uid: 'no-source-start',
        summary: 'English Essay',
        due_date: '2026-05-30',
        start_date: null
    }, {
        plan_id: 1,
        subject: 'English Language Acquisition Phase 5',
        subject_in_managebac: 'English'
    }, '2026-05-13T00:00:00.000Z');
    assertEqual('ManageBac eventToTask initializes missing DTSTART by 14 day rule', initializedSourceTask.start_date, '2026-05-16');

    const syncDb = new FakeDB({ matrixReady: true });
    const syncRows = preview.map(row => {
        if (row.subject_in_managebac === 'College Counseling') return { ...row, plan_id: '' };
        if (row.subject_in_managebac === 'Community Time') return { ...row, plan_id: '' };
        return row;
    });
    await ManageBac.saveMappings(syncDb, syncRows, syncDb.plans);
    const savedLink = await ManageBac.saveManageBacIcsLink(syncDb, 'webcal://example.invalid/calendar.ics');
    assertEqual('saved subscription link stores configured state', savedLink.status, 'ok');
    assertEqual('webcal link normalizes to https internally', ManageBac.normalizeIcsLink(savedLink.config.link), 'https://example.invalid/calendar.ics');
    const savedLinkChangeBlocked = await ManageBac.saveManageBacIcsLink(syncDb, 'https://example.invalid/other.ics');
    assertEqual('saved subscription link change requires confirmation', savedLinkChangeBlocked.status, 'blocked');
    const savedLinkChangeConfirmed = await ManageBac.saveManageBacIcsLink(syncDb, 'https://example.invalid/calendar.ics', { confirmLinkChange: true });
    assertEqual('confirmed saved subscription link change is accepted', savedLinkChangeConfirmed.status, 'ok');
    assert('Settings Plan UI exposes inline ManageBac link input', settingsHtml.includes('id="settingsManageBacIcsLinkInput"'));
    assert('Settings Plan UI exposes inline ManageBac save button', settingsHtml.includes('id="settingsSaveManageBacIcsLinkBtn"'));
    assert('Settings Plan UI exposes inline ManageBac sync button', settingsHtml.includes('id="settingsSyncManageBacBtn"'));
    assert('Settings no longer exposes ManageBac subject mapping entry', !settingsHtml.includes('配置 ManageBac 学科映射')
        && !settingsScript.includes('configureManageBacBtn')
        && !settingsScript.includes('请先配置 ManageBac 学科映射'));
    assert('Settings ManageBac link row uses non-compressed dedicated layout', settingsHtml.includes('link-setting-row') && settingsCss.includes('.link-setting-row'));
    assert('Settings page loads ManageBac shared module before script', settingsHtml.indexOf('shared/js/managebac.js') > -1 && settingsHtml.indexOf('shared/js/managebac.js') < settingsHtml.indexOf('script.js'));
    assert('Settings page has no separate sync ManageBac event row label', !settingsHtml.includes('同步 ManageBac 事件'));
    assert('Settings sync opens ManageBac-only confirmation page', settingsScript.includes('managebac-sync.html') && !settingsScript.includes('management_review_pending'));
    assert('Settings sync no longer routes to mapping page hash', !settingsScript.includes('managebac.html#pending-events'));
    assert('ManageBac subject mapping page is removed from main package',
        !fs.existsSync(path.join(__dirname, '..', 'extension', 'pages', 'settings', 'managebac.html'))
        && !fs.existsSync(path.join(__dirname, '..', 'extension', 'pages', 'settings', 'managebac.js')));
    assert('ManageBac confirmation page is separate from Arrange review', !managebacSyncHtml.includes('id="pendingArrangeChanges"')
        && managebacSyncHtml.includes('id="pendingEventMappings"')
        && managebacSyncHtml.includes('ManageBac 新任务确认')
        && !managebacSyncScript.includes('applyArrangeChanges'));
    assert('Task Arrange confirmation page is separate from ManageBac import', taskArrangeHtml.includes('id="pendingArrangeChanges"')
        && !taskArrangeHtml.includes('id="pendingEventMappings"')
        && taskArrangeScript.includes('task_arrange_pending')
        && !taskArrangeScript.includes('TimeWhereManageBac'));
    assert('ManageBac sync page has no subject mapping file input', !/managebacFileInput|saveManageBacMappingsBtn|mappingPreview/.test(managebacSyncHtml + managebacSyncScript));
    assert('ManageBac sync UI has no local ICS file input', !/accept=["'][^"']*\.ics/i.test(managebacSyncHtml));
    assert('Planner sidebar uses visible My ManageBac label', tasksHtml.includes('My ManageBac') && !tasksHtml.includes('>MyManageBac<'));
    assert('Planner top toolbar ManageBac sync button is removed', !tasksHtml.includes('id="btnSyncManageBac"'));
    assert('Planner sidebar ManageBac sync button includes local icon and 同步 text', /id="sidebarSyncManageBacBtn"[\s\S]*material-symbols-outlined[\s\S]*sync[\s\S]*同步/.test(tasksHtml));
    assert('Planner sidebar pending count button is present for persisted pending rows', tasksHtml.includes('id="managebacPendingCountBtn"'));
    assert('Planner sidebar My ManageBac has no raw sync text label', !/sync\s*My ManageBac/i.test(tasksHtml));
    assert('Planner sync opens independent confirmation page', tasksScript.includes('../settings/managebac-sync.html'));
    assert('Planner sync does not auto-create new tasks and uses ManageBac pending persistence', tasksScript.includes('savePendingEventMappings')
        && !tasksScript.includes('management_review_pending')
        && !tasksScript.includes('applyPendingEventOverrides: true'));
    assert('Planner sync no-link message points to Settings Plan link', tasksScript.includes('Settings → Plan → ManageBac 链接'));
    assert('Planner opening my ManageBac no longer runs automatic stale sync', !tasksScript.includes('checkManageBacSyncWhenOpening()')
        && !tasksScript.includes('force: false'));
    assert('Planner manual sidebar sync forces fetch and can open confirmation page', tasksScript.includes("closest('#sidebarSyncManageBacBtn')")
        && tasksScript.includes('force: true')
        && tasksScript.includes('openPending: true'));
    assert('Planner manual sidebar sync stays put when ManageBac has no new tasks',
        tasksScript.includes('pendingRows.length === 0')
        && tasksScript.includes('ManageBac 没有新增任务')
        && /pendingRows\.length === 0[\s\S]*return;[\s\S]*openManageBacPendingConfirmation\(\)/.test(tasksScript));
    assert('Planner pending count click opens confirmation without fetching again', tasksScript.includes("closest('#managebacPendingCountBtn')")
        && tasksScript.includes('openManageBacPendingConfirmation()'));
    assert('ManageBac confirmation page reads persisted ManageBac pending rows', managebacSyncScript.includes('getPendingEventMappings')
        && managebacSyncScript.includes('restoreManageBacPendingRows'));
    assert('ManageBac confirmation page can apply or skip ManageBac only', managebacSyncScript.includes('handleConfirmManageBacReview')
        && managebacSyncScript.includes('handleSkipManageBacReview')
        && managebacSyncScript.includes('clearManageBacPendingRows'));
    assert('Task detail no longer has a separate ManageBac detail renderer', !/renderManageBacReadOnlyDetail|ManageBac Task/.test(taskDetailScript));
    assert('Task detail uses one layout with ManageBac source badge', taskDetailScript.includes('source-badge') && taskDetailScript.includes('ManageBac'));
    assert('Task detail marks ManageBac source fields readonly', taskDetailScript.includes('data-readonly-source="true"') && taskDetailScript.includes('readonly'));
    assert('Task detail allows ManageBac start date but keeps due date readonly',
        /data-field="start_date"[\s\S]*\$\{sourceStartDateDisabledAttr\}/.test(taskDetailScript)
        && /data-field="due_date"[\s\S]*\$\{sourceDisabledAttr\}/.test(taskDetailScript)
        && taskDetailScript.includes("if (input.disabled || (isManageBacTask && field !== 'start_date')) return;"));
    assert('Task detail disables ManageBac delete action', taskDetailScript.includes('ManageBac 来源任务不能删除') && /btn-delete-task[\s\S]*disabled/.test(taskDetailScript));
    assert('Task detail keeps ManageBac progress editable', taskDetailScript.includes('TimeWhereDB.updateTask(taskId, updates)') && taskDetailScript.includes('completed_at'));
    assert('Task detail displays TimeWhere Plan and Subject fields', taskDetailScript.includes('TimeWhere Plan') && taskDetailScript.includes('data-field="subject"'));
    assert('Task detail resolves Plan display from task.plan_id', taskDetailScript.includes('getTaskPlanInfo(task)') && taskDetailScript.includes('task?.plan_id'));
    assert('Task detail supports cross-plan fallback through TaskApp.plans or DB query', taskDetailScript.includes('TaskApp.plans') && taskDetailScript.includes('TimeWhereDB.getPlans'));
    assert('ManageBac detail displays Subject in ManageBac', taskDetailScript.includes('Subject in ManageBac') && taskDetailScript.includes('data-field="managebac_subject"'));

    const syncResult = await ManageBac.syncManageBacIcs(syncDb, icsFixture, 'https://example.invalid/calendar.ics');
    assertEqual('ICS sync with only new events requires user confirmation', syncResult.status, 'no_matches');
    assertEqual('ICS sync does not auto-create new tasks', syncResult.created, 0);
    assertEqual('ICS sync keeps every new event pending for user confirmation', syncResult.skipped, 3);
    assertEqual('ICS sync persists safe pending confirmation rows', (await ManageBac.getPendingEventMappings(syncDb)).length, 3);
    const safePending = await ManageBac.getPendingEventMappings(syncDb);
    assert('persisted pending rows contain only confirmation-safe fields', safePending.every(row => {
        const keys = Object.keys(row).sort();
        return JSON.stringify(keys) === JSON.stringify(['description', 'due_date', 'event_uid', 'saved_at', 'suggested_plan_id', 'suggested_subject', 'suggested_subject_in_managebac', 'summary'].sort());
    }));
    assert('fresh ManageBac sync timestamp is recognized within 6 hours', ManageBac.isManageBacSyncFresh(await ManageBac.getManageBacIcsConfig(syncDb), new Date(Date.now()), 6) === true);
    const syncedTasks = await syncDb.getAllTasks();
    assertEqual('new event sync creates no tasks before confirmation', syncedTasks.length, 0);
    assertEqual('pending confirmation rows include all new events', syncResult.pending_event_mappings.length, 3);

    const englishPending = syncResult.pending_event_mappings.find(row => row.summary === 'English Language Acquisition Phase 5: Essay Draft');
    const mathPending = syncResult.pending_event_mappings.find(row => row.summary === 'Mathematics Analysis HL: Problem Set');
    await ManageBac.saveEventSubjectOverrides(syncDb, [
        { event_uid: englishPending.event_uid, plan_id: 1, subject_in_managebac: englishPending.suggested_subject_in_managebac },
        { event_uid: mathPending.event_uid, plan_id: 2, subject_in_managebac: mathPending.suggested_subject_in_managebac }
    ], syncDb.plans);
    const confirmedSync = await ManageBac.syncManageBacIcs(syncDb, icsFixture, 'https://example.invalid/calendar.ics', { applyPendingEventOverrides: true });
    assertEqual('confirmed new events create tasks', confirmedSync.created, 2);
    assertEqual('unconfirmed new event remains pending', confirmedSync.pending_event_mappings.length, 1);
    assertEqual('confirmed sync updates persisted pending rows to remaining unconfirmed events', (await ManageBac.getPendingEventMappings(syncDb)).length, 1);
    assert('confirmed English event maps to English plan_id', (await syncDb.getAllTasks()).some(task => {
        return task.source_uid === 'mb-english-essay-1@example.invalid'
            && task.plan_id === 1
            && task.source === 'managebac'
            && task.readonly === true
            && task.subject === 'English Language Acquisition Phase 5'
            && task.managebac_subject === 'English Language Acquisition Phase 5';
    }));
    assert('confirmed Math event maps to Math plan_id', (await syncDb.getAllTasks()).some(task => {
        return task.source_uid === 'mb-math-problem-1@example.invalid'
            && task.plan_id === 2;
    }));

    const noLegacyMappingDb = new FakeDB({ matrixReady: true });
    await ManageBac.saveManageBacIcsLink(noLegacyMappingDb, 'https://example.invalid/no-legacy.ics');
    const noLegacyResult = await ManageBac.syncManageBacIcs(noLegacyMappingDb, icsFixture, 'https://example.invalid/no-legacy.ics');
    assertEqual('ICS sync without ManageBac subject mappings still creates pending rows', noLegacyResult.pending_event_mappings.length, 3);
    assert('Plan subject/name candidates suggest English without legacy mappings', noLegacyResult.pending_event_mappings.some(row => {
        return row.summary === 'English Language Acquisition Phase 5: Essay Draft'
            && row.suggested_plan_id === 1
            && row.suggested_subject === 'English Language Acquisition Phase 5';
    }));

    const shorthandDb = new FakeDB({ matrixReady: true });
    shorthandDb.plans = [
        { id: 10, name: 'EngLA', subject: 'English Language Acquisition Phase 5' },
        { id: 11, name: 'Math AA HL', subject: 'Mathematics Analysis HL' }
    ];
    shorthandDb.settings[ManageBac.MATRIXVIEW_MAPPING_KEY] = [
        { plan_name: 'EngLA', subject: 'English Language Acquisition Phase 5', subject_in_matrixview: 'English Language Acquisition Phase 5' },
        { plan_name: 'Math AA HL', subject: 'Mathematics Analysis HL', subject_in_matrixview: 'Mathematics Analysis HL' }
    ];
    const shorthandResult = await ManageBac.syncManageBacIcs(shorthandDb, aliasPendingIcsFixture, 'https://example.invalid/shorthand.ics');
    assert('Plan name shorthand suggests matching Plan', shorthandResult.pending_event_mappings.some(row => {
        return row.summary === 'EngLA-U4-FORM-Crit.A'
            && row.suggested_plan_id === 10
            && row.suggested_subject === 'English Language Acquisition Phase 5';
    }));

    const matrixOnlyDb = new FakeDB({ matrixReady: true });
    matrixOnlyDb.plans = [{ id: 20, name: 'EAL', subject: 'English Language Acquisition Phase 5' }];
    matrixOnlyDb.settings[ManageBac.MATRIXVIEW_MAPPING_KEY] = [
        { plan_name: 'EAL', subject: 'English Language Acquisition Phase 5', subject_in_matrixview: 'English Language Acquisition Phase 5' }
    ];
    const matrixOnlyResult = await ManageBac.syncManageBacIcs(matrixOnlyDb, fullEventTextIcsFixture, 'https://example.invalid/matrix-only.ics');
    assert('MatrixView subject_in_matrixview candidates suggest matching Plan', matrixOnlyResult.pending_event_mappings.some(row => {
        return row.event_uid === 'mb-full-event-english-1@example.invalid'
            && row.suggested_plan_id === 20;
    }));

    const noSuggestionDb = new FakeDB({ matrixReady: true });
    noSuggestionDb.plans = [{ id: 30, name: 'Physics', subject: 'Physics' }];
    noSuggestionDb.settings[ManageBac.MATRIXVIEW_MAPPING_KEY] = [
        { plan_name: 'Physics', subject: 'Physics', subject_in_matrixview: 'Physics' }
    ];
    const noSuggestionResult = await ManageBac.syncManageBacIcs(noSuggestionDb, aliasPendingIcsFixture, 'https://example.invalid/no-suggestion.ics');
    assert('unmatched events remain pending with blank suggested Plan', noSuggestionResult.pending_event_mappings.some(row => {
        return row.suggested_plan_id === '' && row.suggested_subject === '';
    }));

    const localCompletedAt = '2026-05-13T12:30:00.000Z';
    const englishSourceTask = (await syncDb.getAllTasks()).find(task => task.source_uid === 'mb-english-essay-1@example.invalid');
    await syncDb.updateTask(englishSourceTask.id, { progress: 'completed', completed_at: localCompletedAt });
    const locallyCompletedTask = (await syncDb.getAllTasks()).find(task => task.source_uid === 'mb-english-essay-1@example.invalid');
    assertEqual('ManageBac source task local progress update is allowed', locallyCompletedTask.progress, 'completed');
    assertEqual('ManageBac source task local completed_at update is allowed', locallyCompletedTask.completed_at, localCompletedAt);
    await syncDb.updateTask(englishSourceTask.id, { start_date: '2026-05-18', priority: 'urgent' });
    const locallyScheduledTask = (await syncDb.getAllTasks()).find(task => task.source_uid === 'mb-english-essay-1@example.invalid');
    assertEqual('ManageBac source task local start_date update is allowed', locallyScheduledTask.start_date, '2026-05-18');
    assertEqual('ManageBac source task local priority update is allowed', locallyScheduledTask.priority, 'urgent');

    const repeatResult = await ManageBac.syncManageBacIcs(syncDb, icsFixture, 'https://example.invalid/calendar.ics');
    assertEqual('re-sync same link creates no duplicates', repeatResult.created, 0);
    assertEqual('re-sync same link updates existing tasks', repeatResult.updated, 2);
    assertEqual('task count remains two after repeat sync', (await syncDb.getAllTasks()).length, 2);
    const repeatedEnglishTask = (await syncDb.getAllTasks()).find(task => task.source_uid === 'mb-english-essay-1@example.invalid');
    assertEqual('re-sync preserves user completion progress', repeatedEnglishTask.progress, 'completed');
    assertEqual('re-sync preserves user completed_at', repeatedEnglishTask.completed_at, localCompletedAt);
    assertEqual('re-sync preserves local start_date', repeatedEnglishTask.start_date, '2026-05-18');
    assertEqual('re-sync preserves local priority', repeatedEnglishTask.priority, 'urgent');

    const changedIcs = icsFixture.replace('Essay Draft', 'Essay Final Draft');
    await ManageBac.syncManageBacIcs(syncDb, changedIcs, 'https://example.invalid/calendar.ics');
    assert('changed event updates existing task', (await syncDb.getAllTasks()).some(task => {
        return task.source_uid === 'mb-english-essay-1@example.invalid'
            && task.title === 'Essay Final Draft';
    }));
    const changedEnglishTask = (await syncDb.getAllTasks()).find(task => task.source_uid === 'mb-english-essay-1@example.invalid');
    assertEqual('source-field update still preserves user completion progress', changedEnglishTask.progress, 'completed');
    assertEqual('source-field update still preserves user completed_at', changedEnglishTask.completed_at, localCompletedAt);

    const oneEventIcs = icsFixture.replace(/BEGIN:VEVENT\nUID:mb-math-problem-1@example\.invalid[\s\S]*?END:VEVENT\n/, '');
    const missingResult = await ManageBac.syncManageBacIcs(syncDb, oneEventIcs, 'https://example.invalid/calendar.ics');
    assertEqual('missing ManageBac event deletes local source task', missingResult.deleted, 1);
    assert('deleted missing event is gone', !(await syncDb.getAllTasks()).some(task => task.source_uid === 'mb-math-problem-1@example.invalid'));

    const readonlyTask = (await syncDb.getAllTasks()).find(ManageBac.isManageBacTask);
    let updateBlocked = false;
    try {
        await syncDb.updateTask(readonlyTask.id, { title: 'User edit' });
    } catch (_) {
        updateBlocked = true;
    }
    assertEqual('ManageBac source task user edit is blocked', updateBlocked, true);

    let mixedUpdateBlocked = false;
    try {
        await syncDb.updateTask(readonlyTask.id, { progress: 'in_progress', title: 'Mixed user edit' });
    } catch (_) {
        mixedUpdateBlocked = true;
    }
    assertEqual('ManageBac source task mixed progress and content edit is blocked', mixedUpdateBlocked, true);

    await syncDb.updateTask(readonlyTask.id, { progress: 'in_progress', completed_at: null });
    const resetReadonlyTask = (await syncDb.getAllTasks()).find(task => task.id === readonlyTask.id);
    assertEqual('ManageBac source task can be reset to in progress locally', resetReadonlyTask.progress, 'in_progress');
    assertEqual('ManageBac source task local reset clears completed_at', resetReadonlyTask.completed_at, null);

    let deleteBlocked = false;
    try {
        await syncDb.deleteTask(readonlyTask.id);
    } catch (_) {
        deleteBlocked = true;
    }
    assertEqual('ManageBac source task user delete is blocked', deleteBlocked, true);

    assertEqual('MyManageBac filter returns source tasks only', ManageBac.filterManageBacTasks([
        ...(await syncDb.getAllTasks()),
        { id: 'manual', title: 'Manual task' }
    ]).every(ManageBac.isManageBacTask), true);

    const linkChangeBlocked = await ManageBac.syncManageBacIcs(syncDb, icsFixture, 'https://example.invalid/changed.ics');
    assertEqual('link change requires confirmation', linkChangeBlocked.status, 'blocked');
    const linkChangeConfirmed = await ManageBac.syncManageBacIcs(syncDb, icsFixture, 'https://example.invalid/changed.ics', { confirmLinkChange: true });
    assertEqual('confirmed link change syncs with partial status when events are skipped', linkChangeConfirmed.status, 'partial');

    const unsupportedIcs = ManageBac.parseManageBacIcs('BEGIN:VCALENDAR\nEND:VCALENDAR');
    assertEqual('unsupported ICS without events is explicit', unsupportedIcs.parse_status, 'unsupported');

    const classIdDb = new FakeDB({ matrixReady: true });
    const leftNavRowsForSync = ManageBac.buildMappingPreview(leftNavParsed.subjects, classIdDb.plans).map(row => {
        if (row.subject_in_managebac === 'Community Time') return { ...row, plan_id: '' };
        return row;
    });
    await ManageBac.saveMappings(classIdDb, leftNavRowsForSync, classIdDb.plans);
    const parsedClassIdIcs = ManageBac.parseManageBacIcs(classIdIcsFixture);
    assertEqual('class-id ICS parse status is ok', parsedClassIdIcs.parse_status, 'ok');
    assert('class-id ICS extracts class ids from URL or description', parsedClassIdIcs.events.some(event => {
        return event.uid === 'mb-class-id-english-1@example.invalid'
            && event.managebac_class_id === '2001';
    }));
    const classIdPending = await ManageBac.syncManageBacIcs(classIdDb, classIdIcsFixture, 'https://example.invalid/class-id.ics');
    assertEqual('class-id matching waits for user confirmation', classIdPending.status, 'no_matches');
    assertEqual('class-id sync creates no tasks before confirmation', classIdPending.created, 0);
    assertEqual('class-id pending rows include every new event', classIdPending.pending_event_mappings.length, 3);
    const classIdRowsToConfirm = classIdPending.pending_event_mappings.filter(row => row.suggested_plan_id);
    await ManageBac.saveEventSubjectOverrides(classIdDb, classIdRowsToConfirm.map(row => ({
        event_uid: row.event_uid,
        plan_id: row.suggested_plan_id,
        subject_in_managebac: row.suggested_subject_in_managebac
    })), classIdDb.plans);
    const classIdSync = await ManageBac.syncManageBacIcs(classIdDb, classIdIcsFixture, 'https://example.invalid/class-id.ics', { applyPendingEventOverrides: true });
    assertEqual('class-id confirmed sync is partial while one event remains unconfirmed', classIdSync.status, 'partial');
    assertEqual('class-id confirmed sync creates mapped tasks', classIdSync.created, 2);
    assertEqual('class-id disabled empty mapping remains pending', classIdSync.skipped, 1);
    assertEqual('class-id diagnostics include parsed event count', classIdSync.diagnostics.parsed_event_count, 3);
    assert('class-id diagnostics include Plan/MatrixView candidate count', classIdSync.diagnostics.active_mapping_count >= 2);
    assertEqual('class-id diagnostics include matched count', classIdSync.diagnostics.matched_count, 2);
    assertEqual('class-id diagnostics include skipped count', classIdSync.diagnostics.skipped_count, 1);
    assertEqual('class-id diagnostics include pending confirmation reason', classIdSync.skipped_reasons.class_id_not_mapped, 1);
    assert('class-id diagnostics are safe and do not expose raw event titles', classIdSync.unmatched_event_diagnostics.every(item => {
        return item.event_ref && !JSON.stringify(item).includes('Community Reflection') && item.reason === 'class_id_not_mapped';
    }));
    assert('class-id confirmed English event maps to English plan', (await classIdDb.getAllTasks()).some(task => {
        return task.source_uid === 'mb-class-id-english-1@example.invalid'
            && task.plan_id === 1
            && task.title === 'Essay Draft';
    }));

    const allSkippedDb = new FakeDB({ matrixReady: true });
    await ManageBac.saveMappings(allSkippedDb, leftNavRowsForSync.map(row => ({ ...row, plan_id: '' })), allSkippedDb.plans);
    const allSkipped = await ManageBac.syncManageBacIcs(allSkippedDb, classIdIcsFixture, 'https://example.invalid/all-skipped.ics');
    assertEqual('all-skipped sync is not reported as success', allSkipped.status, 'no_matches');
    assertEqual('all-skipped diagnostics matched count is zero', allSkipped.diagnostics.matched_count, 0);
    assertEqual('all-skipped diagnostics skipped count includes all events', allSkipped.diagnostics.skipped_count, 3);
    assertEqual('all-skipped diagnostics reason is no candidate match', allSkipped.skipped_reasons.class_id_not_mapped, 3);

    const fullEventDb = new FakeDB({ matrixReady: true });
    await ManageBac.saveMappings(fullEventDb, rowsToSave, fullEventDb.plans);
    const parsedFullEventTextIcs = ManageBac.parseManageBacIcs(fullEventTextIcsFixture);
    assertEqual('full-event-text ICS parse status is ok', parsedFullEventTextIcs.parse_status, 'ok');
    assert('full-event-text ICS keeps transient normalized VEVENT text', parsedFullEventTextIcs.events.some(event => {
        return event.uid === 'mb-full-event-english-1@example.invalid'
            && event.full_event_text.includes('English Language Acquisition Phase 5');
    }));
    const fullEventPending = await ManageBac.syncManageBacIcs(fullEventDb, fullEventTextIcsFixture, 'https://example.invalid/full-event.ics');
    assertEqual('full-event-text matching waits for user confirmation', fullEventPending.status, 'no_matches');
    assertEqual('full-event-text pending rows include both events', fullEventPending.pending_event_mappings.length, 2);
    assert('full-event-text suggestion uses full VEVENT text', fullEventPending.pending_event_mappings.some(row => {
        return row.event_uid === 'mb-full-event-english-1@example.invalid'
            && row.suggested_plan_id === 1;
    }));
    const fullEventEnglish = fullEventPending.pending_event_mappings.find(row => row.event_uid === 'mb-full-event-english-1@example.invalid');
    await ManageBac.saveEventSubjectOverrides(fullEventDb, [{ event_uid: fullEventEnglish.event_uid, plan_id: 1 }], fullEventDb.plans);
    const fullEventSync = await ManageBac.syncManageBacIcs(fullEventDb, fullEventTextIcsFixture, 'https://example.invalid/full-event.ics', { applyPendingEventOverrides: true });
    assertEqual('full-event-text confirmed sync is partial while one event remains unconfirmed', fullEventSync.status, 'partial');
    assertEqual('full-event-text confirmed sync creates one mapped task', fullEventSync.created, 1);
    assertEqual('full-event-text unconfirmed mapping still skips', fullEventSync.skipped, 1);
    assertEqual('full-event-text diagnostics matched by manual confirmation', fullEventSync.diagnostics.matched_by.manual_event_override, 1);
    assert('full-event-text raw event text is not persisted to tasks', !(await fullEventDb.getAllTasks()).some(task => {
        return Object.prototype.hasOwnProperty.call(task, 'full_event_text');
    }));

    const paramColonDb = new FakeDB({ matrixReady: true });
    await ManageBac.saveMappings(paramColonDb, rowsToSave, paramColonDb.plans);
    const parsedParamColonIcs = ManageBac.parseManageBacIcs(paramColonIcsFixture);
    assertEqual('ICS parser handles colon inside quoted property parameters', parsedParamColonIcs.events[0].description, 'English Language Acquisition Phase 5 assignment notes');
    const paramColonPending = await ManageBac.syncManageBacIcs(paramColonDb, paramColonIcsFixture, 'https://example.invalid/param-colon.ics');
    assertEqual('param-colon DESCRIPTION exact subject waits for user confirmation', paramColonPending.status, 'no_matches');
    await ManageBac.saveEventSubjectOverrides(paramColonDb, [{ event_uid: paramColonPending.pending_event_mappings[0].event_uid, plan_id: 1 }], paramColonDb.plans);
    const paramColonSync = await ManageBac.syncManageBacIcs(paramColonDb, paramColonIcsFixture, 'https://example.invalid/param-colon.ics', { applyPendingEventOverrides: true });
    assertEqual('param-colon confirmed sync succeeds', paramColonSync.status, 'ok');
    assertEqual('param-colon confirmed sync creates one task', paramColonSync.created, 1);

    const aliasDb = new FakeDB({ matrixReady: true });
    aliasDb.plans.push({ id: 4, name: 'Sciences Biology 9', subject: 'Sciences Biology 9' });
    await ManageBac.saveMappings(aliasDb, [
        { subject_in_managebac: 'English Language Acquisition Phase 5', plan_id: 1 },
        { subject_in_managebac: 'Sciences Biology 9', plan_id: 4 }
    ], aliasDb.plans);
    const aliasPending = await ManageBac.syncManageBacIcs(aliasDb, aliasPendingIcsFixture, 'https://example.invalid/alias-pending.ics');
    assertEqual('alias-only new events are not auto-created before user confirmation', aliasPending.status, 'no_matches');
    assertEqual('alias-only pending suggestions include both new events', aliasPending.pending_event_mappings.length, 2);
    assert('EngLA pending event suggests English subject', aliasPending.pending_event_mappings.some(row => {
        return row.summary === 'EngLA-U4-FORM-Crit.A'
            && row.suggested_subject === 'English Language Acquisition Phase 5'
            && row.suggestion_score >= 0.9;
    }));
    assert('G9-SCI pending event suggests science subject', aliasPending.pending_event_mappings.some(row => {
        return row.summary === 'G9-SCI-U3-Summative C2'
            && row.suggested_subject === 'Sciences Biology 9'
            && row.suggestion_score >= 0.9;
    }));

    const engPending = aliasPending.pending_event_mappings.find(row => row.summary === 'EngLA-U4-FORM-Crit.A');
    await ManageBac.saveEventSubjectOverrides(aliasDb, [{ event_uid: engPending.event_uid, plan_id: 1 }], aliasDb.plans);
    const aliasConfirmed = await ManageBac.syncManageBacIcs(aliasDb, aliasPendingIcsFixture, 'https://example.invalid/alias-pending.ics', { applyPendingEventOverrides: true });
    assertEqual('confirmed pending event creates one task', aliasConfirmed.created, 1);
    assertEqual('unconfirmed new event remains pending', aliasConfirmed.pending_event_mappings.length, 1);
    assert('confirmed event maps to selected plan', (await aliasDb.getAllTasks()).some(task => {
        return task.source_uid === 'mb-alias-engla-1@example.invalid' && task.plan_id === 1;
    }));

    await aliasDb.setSetting(ManageBac.SETTINGS_EVENT_OVERRIDES_KEY, []);
    const aliasExistingOnly = await ManageBac.syncManageBacIcs(aliasDb, aliasPendingIcsFixture, 'https://example.invalid/alias-pending.ics');
    assertEqual('existing ManageBac task updates by UID without asking for confirmation again', aliasExistingOnly.updated, 1);

    const fixturePrivacy = icsFixture + classIdIcsFixture + fullEventTextIcsFixture + paramColonIcsFixture + aliasPendingIcsFixture + realStructureFixture + leftNavFixture + JSON.stringify(syncDb.settings);
    assert('privacy: fixtures and settings contain no real token URL', !/token=|access_token|mymanagebac\.com|managebac\.cn|ManageBac _ My Classes/i.test(fixturePrivacy));

    console.log('\n' + '='.repeat(44));
    console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
    if (failed > 0) process.exit(1);
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
