const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(root, 'extension', 'pages', 'settings', 'task-arrange.js'), 'utf8');

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
        'applyArrangeChangesBtn',
        'skipArrangeReviewBtn',
        'taskArrangeStatus',
        'pendingArrangeChanges'
    ].forEach(id => elements.set(`#${id}`, createElement(id)));

    const selectors = new Map();
    const calls = { updateTask: [] };
    const db = {
        settings: {
            task_arrange_pending: {
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
                arrange_summary: { date_changes: 2, priority_changes: 2 }
            }
        },
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
            location: { href: '' },
            TimeWhereScheduling: {
                escapeHTML(value) {
                    return String(value ?? '');
                }
            }
        },
        TimeWhereDB: db
    };
    vm.createContext(context);
    vm.runInContext(scriptSource, context);

    return { context, elements, selectors, db, calls };
}

async function run() {
    console.log('\nTimeWhere Task Arrange Review tests');
    console.log('============================================');

    const applyHarness = createHarness();
    await applyHarness.context.restoreTaskArrangePending();

    assert('restore renders Arrange table', applyHarness.elements.get('#pendingArrangeChanges').innerHTML.includes('Applied Arrange'));
    assert('pending Arrange review blocks back navigation', applyHarness.elements.get('#backBtn').disabled === true);
    assert('pending Arrange review enables apply and skip actions', applyHarness.elements.get('#applyArrangeChangesBtn').disabled === false
        && applyHarness.elements.get('#skipArrangeReviewBtn').disabled === false);

    applyHarness.selectors.set('.arrange-change-checkbox[data-index="0"]', { checked: false });
    applyHarness.selectors.set('.arrange-change-checkbox[data-index="1"]', { checked: true });
    await applyHarness.context.handleApplyArrangeChanges();

    assertEqual('confirm applies only selected Arrange rows', applyHarness.calls.updateTask, [
        { taskId: 'apply-arrange', updates: { start_date: '2026-05-17', priority: 'urgent' } }
    ]);
    assert('confirm clears Arrange pending and writes last checked', applyHarness.db.settings.task_arrange_pending === null
        && !!applyHarness.db.settings.task_arrange_last_checked_at);

    const skipHarness = createHarness();
    await skipHarness.context.restoreTaskArrangePending();
    await skipHarness.context.handleSkipArrangeReview();
    assertEqual('skip writes no task updates', skipHarness.calls.updateTask, []);
    assert('skip clears Arrange pending and writes last checked', skipHarness.db.settings.task_arrange_pending === null
        && !!skipHarness.db.settings.task_arrange_last_checked_at);

    console.log('\n============================================');
    console.log(`Total: ${passed + failed} checks   PASS ${passed}   FAIL ${failed}`);
    if (failed > 0) process.exit(1);
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
