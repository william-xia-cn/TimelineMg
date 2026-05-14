const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(root, 'extension', 'pages', 'settings', 'managebac-sync.js'), 'utf8');

let passed = 0;
let failed = 0;

function assert(name, condition) {
    if (condition) {
        console.log(`  PASS ${name}`);
        passed += 1;
    } else {
        console.error(`  FAIL ${name}`);
        failed += 1;
    }
}

function assertEqual(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    assert(`${name} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`, ok);
}

function createElement(id) {
    let inner = '';
    return {
        id,
        textContent: '',
        className: '',
        dataset: {},
        disabled: false,
        value: '',
        checked: false,
        addEventListener() {},
        toggleAttribute(name, force) {
            if (name === 'disabled') this.disabled = !!force;
            this[`attr_${name}`] = !!force;
        },
        set innerHTML(value) {
            inner = value;
        },
        get innerHTML() {
            return inner;
        }
    };
}

function createHarness() {
    const elements = new Map();
    [
        'backBtn',
        'savePendingEventMappingsBtn',
        'skipManagementReviewBtn',
        'managebacSyncStatus',
        'pendingArrangeChanges',
        'pendingEventMappings'
    ].forEach(id => elements.set(`#${id}`, createElement(id)));

    const selectors = new Map();
    const session = new Map();
    const calls = {
        updateTask: [],
        saveOverrides: [],
        sync: 0,
        clearPending: 0
    };

    const db = {
        settings: {
            management_review_pending: {
                source: 'dashboard_auto',
                created_at: '2026-05-15T00:00:00.000Z',
                arrange_changes: [
                    {
                        task_id: 'skip-arrange',
                        task: { id: 'skip-arrange', title: 'Skipped Arrange', start_date: '2026-05-15', priority: 'medium' },
                        updates: { start_date: '2026-05-16', priority: 'important' }
                    },
                    {
                        task_id: 'apply-arrange',
                        task: { id: 'apply-arrange', title: 'Applied Arrange', start_date: '2026-05-15', priority: 'medium' },
                        updates: { start_date: '2026-05-17', priority: 'urgent' }
                    }
                ],
                arrange_summary: { date_changes: 2, priority_changes: 2 },
                managebac_pending_event_mappings: [
                    {
                        event_uid: 'mb-1',
                        due_date: '2026-05-20',
                        summary: 'ManageBac One',
                        description: 'One description',
                        suggested_plan_id: 1,
                        suggested_subject: 'English'
                    },
                    {
                        event_uid: 'mb-2',
                        due_date: '2026-05-21',
                        summary: 'ManageBac Two',
                        description: 'Two description',
                        suggested_plan_id: 2,
                        suggested_subject: 'Math'
                    }
                ],
                managebac_summary: { events: 2 },
                managebac_error: null
            },
            managebac_subject_mappings: [{ plan_id: 1 }]
        },
        plans: [
            { id: 1, name: 'English Plan', subject: 'English' },
            { id: 2, name: 'Math Plan', subject: 'Math' }
        ],
        async initDefaultSettings() {},
        async getSetting(key) {
            return this.settings[key];
        },
        async setSetting(key, value) {
            this.settings[key] = value;
        },
        async updateTask(taskId, updates) {
            calls.updateTask.push({ taskId, updates });
        }
    };

    const managebac = {
        SETTINGS_MAPPING_KEY: 'managebac_subject_mappings',
        escapeHTML(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },
        escapeAttribute(value) {
            return this.escapeHTML(value);
        },
        async getMappingPrecondition() {
            return { ok: true, plans: db.plans };
        },
        async getPendingEventMappings() {
            return [];
        },
        async savePendingEventMappings(_db, rows) {
            return rows;
        },
        async clearPendingEventMappings() {
            calls.clearPending += 1;
        },
        async saveEventSubjectOverrides(_db, rows) {
            calls.saveOverrides.push(rows);
        },
        async getManageBacIcsConfig() {
            return { link: 'https://example.invalid/calendar.ics' };
        },
        async fetchIcsText() {
            return 'BEGIN:VCALENDAR\nEND:VCALENDAR';
        },
        async syncManageBacIcs(_db, _ics, _link, options) {
            calls.sync += 1;
            calls.syncOptions = options;
            return { created: calls.saveOverrides[0]?.length || 0, updated: 0 };
        }
    };

    const document = {
        addEventListener() {},
        getElementById(id) {
            return elements.get(`#${id}`) || null;
        },
        querySelector(selector) {
            return selectors.get(selector) || elements.get(selector) || null;
        }
    };

    const context = {
        console,
        document,
        window: {
            addEventListener() {},
            location: { href: '' }
        },
        sessionStorage: {
            getItem(key) { return session.get(key) || null; },
            setItem(key, value) { session.set(key, value); },
            removeItem(key) { session.delete(key); }
        },
        TimeWhereDB: db,
        TimeWhereManageBac: managebac
    };
    vm.createContext(context);
    vm.runInContext(scriptSource, context);

    return { context, elements, selectors, db, calls };
}

async function run() {
    console.log('\nTimeWhere Management Review tests');
    console.log('============================================');

    const applyHarness = createHarness();
    await applyHarness.context.loadManageBacSyncPrecondition();
    await applyHarness.context.restoreManagementReviewPending();

    assert('restore renders Arrange table', applyHarness.elements.get('#pendingArrangeChanges').innerHTML.includes('Applied Arrange'));
    assert('restore renders ManageBac table', applyHarness.elements.get('#pendingEventMappings').innerHTML.includes('ManageBac One'));
    assert('pending review blocks back navigation', applyHarness.elements.get('#backBtn').disabled === true);
    assert('pending review enables confirm and skip actions', applyHarness.elements.get('#savePendingEventMappingsBtn').disabled === false
        && applyHarness.elements.get('#skipManagementReviewBtn').disabled === false);

    applyHarness.selectors.set('.arrange-change-checkbox[data-index="0"]', { checked: false });
    applyHarness.selectors.set('.arrange-change-checkbox[data-index="1"]', { checked: true });
    applyHarness.selectors.set('.managebac-event-checkbox[data-index="0"]', { checked: true });
    applyHarness.selectors.set('.managebac-event-checkbox[data-index="1"]', { checked: true });
    applyHarness.selectors.set('.managebac-event-plan-select[data-index="0"]', { value: '1' });
    applyHarness.selectors.set('.managebac-event-plan-select[data-index="1"]', { value: '' });
    await applyHarness.context.handleConfirmManagementReview();

    assertEqual('confirm applies only selected Arrange rows', applyHarness.calls.updateTask, [
        { taskId: 'apply-arrange', updates: { start_date: '2026-05-17', priority: 'urgent' } }
    ]);
    assertEqual('confirm saves only selected ManageBac rows with a Plan', applyHarness.calls.saveOverrides[0], [
        {
            event_uid: 'mb-1',
            plan_id: '1',
            subject: 'English',
            subject_in_managebac: 'English'
        }
    ]);
    assert('confirm calls ManageBac sync with applyPendingEventOverrides', applyHarness.calls.sync === 1
        && applyHarness.calls.syncOptions.applyPendingEventOverrides === true);
    assert('confirm clears pending review and writes last checked', applyHarness.db.settings.management_review_pending === null
        && !!applyHarness.db.settings.management_review_last_checked_at);

    const skipHarness = createHarness();
    await skipHarness.context.loadManageBacSyncPrecondition();
    await skipHarness.context.restoreManagementReviewPending();
    await skipHarness.context.handleSkipManagementReview();
    assertEqual('skip writes no task updates', skipHarness.calls.updateTask, []);
    assertEqual('skip writes no ManageBac overrides', skipHarness.calls.saveOverrides, []);
    assert('skip clears pending review and writes last checked', skipHarness.db.settings.management_review_pending === null
        && !!skipHarness.db.settings.management_review_last_checked_at);
    assert('skip clears persisted ManageBac pending rows', skipHarness.calls.clearPending === 1);

    console.log('\n============================================');
    console.log(`Total: ${passed + failed} checks   PASS ${passed}   FAIL ${failed}`);
    if (failed > 0) process.exit(1);
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
