/**
 * TimeWhere MDP Agent Interface tests.
 * Run: node tests/mdp-agent-interface.test.js
 */

const MDP = require('../extension/shared/js/mdp-agent-interface.js');

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

function isManageBacSourceTask(task = {}) {
    return task.source === 'managebac' || task.source_type === 'managebac_ics' || (task.readonly === true && !!task.managebac_subject);
}

function makeDb() {
    const settings = {};
    const tasks = [
        {
            id: 'active',
            title: 'Active essay',
            plan_id: 1,
            bucket_id: 10,
            progress: 'in_progress',
            priority: 'important',
            start_date: '2026-08-01',
            due_date: '2026-08-02',
            schedule_time: '18:00',
            duration: 45,
            notes: 'agent-visible notes',
            description: 'agent-visible description',
            source_url: 'https://example.invalid/private',
            refresh_token: 'should-not-leak',
            assignment: { status: 'current', label: 'Study now' }
        },
        {
            id: 'todo',
            title: 'Read chapter',
            plan_id: 1,
            progress: 'not_started',
            priority: 'medium',
            start_date: '2026-08-01',
            due_date: '2026-08-03',
            duration: 30,
            notes: ''
        },
        {
            id: 'done',
            title: 'Completed',
            plan_id: 1,
            progress: 'completed',
            completed_at: '2026-08-01T09:00:00.000Z'
        },
        {
            id: 'mb',
            title: 'ManageBac source title',
            plan_id: 1,
            progress: 'not_started',
            source: 'managebac',
            readonly: true,
            managebac_subject: 'English'
        }
    ];
    const created = [];
    const updates = [];
    const deleted = [];
    return {
        tasks,
        created,
        updates,
        deleted,
        settings,
        async getAllTasks() { return tasks.map(task => ({ ...task })); },
        async getTaskById(id) { return tasks.find(task => task.id === id) || null; },
        async getPlans() { return [{ id: 1, name: 'English Plan' }]; },
        async getContainers() { return [{ id: 'study', name: 'Study', enabled: true, repeat: 'daily', time_start: '18:00', time_end: '20:00' }]; },
        async getEvents() { return [{ id: 'event-1', title: 'Class', date: '2026-08-01', source_url: 'hidden' }]; },
        async getDatabaseInfo() { return { tasks: tasks.length, settings: Object.keys(settings).length }; },
        async getSetting(key) { return settings[key] ?? null; },
        async setSetting(key, value) { settings[key] = value; },
        async addTask(payload) {
            const task = { id: `new-${created.length + 1}`, ...payload };
            created.push(task);
            tasks.push(task);
            return task;
        },
        async updateTask(id, data) {
            const index = tasks.findIndex(task => task.id === id);
            if (index < 0) throw new Error('Task not found');
            if (isManageBacSourceTask(tasks[index]) && Object.prototype.hasOwnProperty.call(data, 'title')) {
                throw new Error('ManageBac source facts are read-only. Local execution fields can be updated.');
            }
            updates.push({ id, data });
            tasks[index] = { ...tasks[index], ...data };
            return tasks[index];
        },
        async deleteTask(id, options = {}) {
            const index = tasks.findIndex(task => task.id === id);
            if (index < 0) return;
            if (isManageBacSourceTask(tasks[index]) && !options.allowManageBacSync) throw new Error('blocked source delete');
            deleted.push(tasks[index]);
            tasks.splice(index, 1);
        }
    };
}

const scheduling = {
    buildDailyTaskPool(tasks) {
        return tasks.filter(task => task.progress !== 'completed');
    },
    dailySettle(tasks) {
        return { displayTasks: tasks };
    }
};

console.log('\nTimeWhere MDP Agent Interface tests\n' + '='.repeat(44));

(async () => {
    const db = makeDb();
    const snapshot = await MDP.buildSnapshot(db, {
        now: new Date('2026-08-01T18:30:00'),
        scheduling,
        platform: {
            name: 'desktop-electron',
            sync: {
                getStatus: () => ({
                    status: 'connected',
                    platform_scope: 'desktop_runtime',
                    google_sync_account_email: 'student@example.invalid',
                    refresh_token: 'hidden-token'
                })
            }
        }
    });

    assertEqual('snapshot schema is MDP v1', snapshot.schema, 'timewhere-mdp-agent-v1');
    assertEqual('snapshot counts completed today', snapshot.today.completed_count, 1);
    assertEqual('snapshot keeps in-progress current task first', snapshot.current_tasks[0]?.id, 'active');
    assert('snapshot task fields include agent-visible notes', Object.prototype.hasOwnProperty.call(snapshot.current_tasks[0], 'notes'));
    assert('snapshot excludes source urls and credential-like data', !/example\.invalid\/private|hidden-token|student@example/i.test(JSON.stringify(snapshot)));
    assertEqual('snapshot sync status is sanitized', snapshot.status.sync.status, 'connected');
    assert('capabilities document full CRUD allowlist', MDP.getCapabilities().write.includes('task.delete') && MDP.getCapabilities().write.includes('task.update'));

    const listed = await MDP.handleMcpToolCall(db, 'timewhere_tasks_list', { progress: 'not_started', limit: 2 });
    assertEqual('list tool filters progress', listed.count, 2);
    assertEqual('get tool returns notes', (await MDP.handleMcpToolCall(db, 'timewhere_task_get', { task_id: 'active' })).task.notes, 'agent-visible notes');

    try {
        await MDP.handleMcpToolCall(db, 'timewhere_task_complete', { task_id: 'todo' });
        assert('write requires idempotency key', false);
    } catch (error) {
        assert('write requires idempotency key', /idempotency_key/.test(error.message));
    }

    const created = await MDP.handleMcpToolCall(db, 'timewhere_task_create', {
        title: 'Agent suggested task',
        due_date: '2026-08-04',
        notes: 'agent note',
        duration: 60,
        idempotency_key: 'create-1'
    });
    assertEqual('manual task action creates task', created.status, 'created');
    assertEqual('manual task creation preserves notes', db.created[0].notes, 'agent note');
    assertEqual('manual task creation requires due date and sets start date', db.created[0].start_date, '2026-08-04');

    const createdReplay = await MDP.handleMcpToolCall(db, 'timewhere_task_create', {
        title: 'Duplicate should not create',
        due_date: '2026-08-05',
        idempotency_key: 'create-1'
    });
    assertEqual('idempotent create returns replay', createdReplay.idempotent_replay, true);
    assertEqual('idempotent create does not create another row', db.created.length, 1);

    const updated = await MDP.handleMcpToolCall(db, 'timewhere_task_update', {
        task_id: 'todo',
        patch: { notes: 'new notes', description: 'new description', priority: 'urgent' },
        idempotency_key: 'update-1'
    });
    assertEqual('task update succeeds', updated.status, 'updated');
    assertEqual('task update writes notes', db.updates.at(-1).data.notes, 'new notes');

    try {
        await MDP.handleMcpToolCall(db, 'timewhere_task_update', {
            task_id: 'mb',
            patch: { title: 'User edit' },
            idempotency_key: 'mb-edit-1'
        });
        assert('ManageBac source facts remain protected', false);
    } catch (error) {
        assert('ManageBac source facts remain protected', /read-only/.test(error.message));
    }

    const completed = await MDP.handleMcpToolCall(db, 'timewhere_task_complete', {
        task_id: 'todo',
        idempotency_key: 'complete-1'
    }, { now: new Date('2026-08-01T19:00:00.000Z') });
    assertEqual('complete tool succeeds', completed.status, 'updated');
    assertEqual('complete tool writes completed_at', db.updates.at(-1).data.completed_at, '2026-08-01T19:00:00.000Z');

    try {
        await MDP.handleMcpToolCall(db, 'timewhere_task_delete', { task_id: 'todo', idempotency_key: 'delete-missing-confirm' });
        assert('delete requires explicit confirmation', false);
    } catch (error) {
        assert('delete requires explicit confirmation', /user_confirmed=true/.test(error.message));
    }

    const deleted = await MDP.handleMcpToolCall(db, 'timewhere_task_delete', {
        task_id: 'mb',
        user_confirmed: true,
        idempotency_key: 'delete-1'
    });
    assertEqual('delete tool deletes confirmed task', deleted.status, 'deleted');
    assertEqual('delete audit log is recorded', db.settings[MDP.AUDIT_SETTING_KEY][0].task_id, 'mb');

    try {
        await MDP.handleMcpToolCall(db, 'timewhere_tasks_list', {}, { expected_profile_id: 'profile-a', current_profile_id: 'profile-b' });
        assert('profile mismatch blocks access', false);
    } catch (error) {
        assertEqual('profile mismatch blocks access', error.code, 'profile_changed');
    }

    console.log('\n' + '='.repeat(44));
    console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
    if (failed > 0) process.exit(1);
})().catch(error => {
    console.error(error);
    process.exit(1);
});