/**
 * MatrixView import and plan initialization tests.
 * Run: node tests/matrixview.test.js
 */

const fs = require('fs');
const path = require('path');
const MatrixView = require('../extension/shared/js/matrixview.js');

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

function decodeQuotedPrintable(text) {
    return String(text || '')
        .replace(/=\r?\n/g, '')
        .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

class FakeDB {
    constructor() {
        this.nextPlanId = 1;
        this.nextBucketId = 1;
        this.plans = [];
        this.buckets = [];
        this.tasks = [];
        this.settings = {};
    }

    async getPlans() {
        return this.plans.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
    }

    async addPlan(plan) {
        const id = this.nextPlanId++;
        const row = {
            id,
            name: plan.name,
            subject: plan.subject || null,
            color: plan.color || '#2b56e3',
            icon_char: plan.icon_char || 'P',
            created_at: `2026-05-12T00:00:${String(id).padStart(2, '0')}.000Z`,
            updated_at: `2026-05-12T00:00:${String(id).padStart(2, '0')}.000Z`
        };
        this.plans.push(row);
        return row;
    }

    async deletePlan(id) {
        this.plans = this.plans.filter(plan => plan.id !== id);
        this.buckets = this.buckets.filter(bucket => bucket.plan_id !== id);
    }

    async getBucketsByPlan(planId) {
        return this.buckets.filter(bucket => bucket.plan_id === planId).sort((a, b) => a.sort_order - b.sort_order);
    }

    async addBucket(bucket) {
        const row = { id: this.nextBucketId++, ...bucket };
        this.buckets.push(row);
        return row;
    }

    async deleteEmptyLegacyBucketsForPlan(planId) {
        const legacyNames = ['Homework', 'Test', 'IA / EE', 'Notes', 'Review', 'Project', 'Other'];
        const removed = [];
        this.buckets = this.buckets.filter(bucket => {
            const hasTasks = this.tasks.some(task => task.bucket_id === bucket.id);
            const shouldRemove = bucket.plan_id === planId && legacyNames.includes(bucket.name) && !hasTasks;
            if (shouldRemove) removed.push(bucket);
            return !shouldRemove;
        });
        return removed;
    }

    async setSetting(key, value) {
        this.settings[key] = value;
    }
}

async function run() {
    console.log('\nTimeWhere MatrixView tests\n' + '='.repeat(40));

    const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'matrixview-sanitized.mime'), 'utf8');
    const parsed = MatrixView.parseMatrixViewMime(fixture);

    assertEqual('supported fixture parse status is ok', parsed.parse_status, 'ok');
    assertEqual('supported fixture export type is matrixview_schedule', parsed.export_type, 'matrixview_schedule');
    assertEqual('parser returns four timetable records', parsed.records.length, 4);
    assertEqual('parser builds four course rows', parsed.courses.length, 4);
    assert('parser captures A-H day and period', parsed.by_day.some(day => day.day === 'A' && day.periods.some(period => period.period === '1')));
    assert('parser keeps MatrixView subject text for traceability', parsed.courses.some(course => course.subject_in_matrixview === 'Math: Analysis and Approaches HL'));

    const persisted = JSON.stringify(parsed);
    assert('privacy filter does not persist address', !persisted.includes('123 Private Road'));
    assert('privacy filter does not persist phone', !persisted.includes('555 0100'));
    assert('privacy filter does not persist account identifiers', !persisted.includes('private-account-123'));
    assert('privacy filter does not persist demographics', !persisted.includes('private demographic value'));

    assertEqual('subject extraction detects Math', MatrixView.extractSubjectName('Math: Analysis and Approaches HL'), 'Math');
    assertEqual('subject extraction detects English', MatrixView.extractSubjectName('English HL Language and Literature'), 'English');
    assertEqual('subject extraction detects TOK', MatrixView.extractSubjectName('Theory of Knowledge'), 'TOK');
    assertEqual('subject extraction detects Computer Science', MatrixView.extractSubjectName('Computer Science HL'), 'Computer Science');

    const mhtmlFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'matrixview-sanitized.mhtml'), 'utf8');
    const mhtmlParsed = MatrixView.parseMatrixViewMime(mhtmlFixture);
    assertEqual('sanitized MHTML parse status is ok', mhtmlParsed.parse_status, 'ok');
    assertEqual('sanitized MHTML export type is matrixview_schedule', mhtmlParsed.export_type, 'matrixview_schedule');
    assertEqual('sanitized MHTML has full 6x8 grid records', mhtmlParsed.records.length, 48);
    assertEqual('sanitized MHTML has eight A-H days', mhtmlParsed.by_day.length, 8);
    assertEqual('sanitized MHTML has six course groups', mhtmlParsed.courses.length, 6);
    assert('sanitized MHTML includes A-H days only', Array.from(new Set(mhtmlParsed.records.map(record => record.day))).every(day => /^[A-H]$/.test(day)));
    assertEqual('sanitized MHTML includes expected period set', Array.from(new Set(mhtmlParsed.records.map(record => record.period))).sort(), ['1', '2', '3', '4', 'CT', 'DRM']);
    assert('sanitized MHTML requires subject teacher and room for every record', mhtmlParsed.records.every(record => record.subject_in_matrixview && record.teacher && record.room));
    assert('sanitized MHTML extracts subject teacher and room from MatrixView cells', mhtmlParsed.courses.some(course => {
        return course.subject_in_matrixview === 'English Language Acquisition Phase 5'
            && course.teacher === 'Sears, Timothy (Timm) William'
            && course.room === '1359';
    }));
    assert('academic Subject defaults to full Subject in MatrixView', mhtmlParsed.courses.some(course => {
        return course.subject_in_matrixview === 'English Language Acquisition Phase 5'
            && course.subject === 'English Language Acquisition Phase 5';
    }));
    assert('clear school non-subject rows default to Other School Plan', ['Community Time', 'Dorm Check'].every(name => {
        return mhtmlParsed.courses.some(course => course.subject_in_matrixview === name && course.subject === MatrixView.OTHER_SCHOOL_PLAN_NAME);
    }));

    const sanitizedHtml = decodeQuotedPrintable(mhtmlFixture)
        .match(/<!DOCTYPE html>[\s\S]*?<\/html>/i)[0]
        .replace(' id="schedMatrixTable"', '');
    const htmlParsed = MatrixView.parseMatrixViewMime(sanitizedHtml);
    assertEqual('sanitized HTML table parses without relying on table id', htmlParsed.parse_status, 'ok');
    assertEqual('sanitized HTML table has full 6x8 grid records', htmlParsed.records.length, 48);

    const incompleteMhtml = mhtmlFixture.replace('Room: 1359', '');
    const incompleteParsed = MatrixView.parseMatrixViewMime(incompleteMhtml);
    assertEqual('MHTML with missing course room is rejected', incompleteParsed.parse_status, 'failed_quality');
    assertEqual('MHTML missing field rejection reason is explicit', incompleteParsed.unsupported_reason, 'matrix_grid_incomplete_course_fields');
    assertEqual('rejected MHTML returns no records', incompleteParsed.records.length, 0);

    const unsupportedFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'powerschool-studentrecordexchange-sanitized.mime'), 'utf8');
    const unsupportedParsed = MatrixView.parseMatrixViewMime(unsupportedFixture);
    assertEqual('student record exchange fixture parse status is unsupported', unsupportedParsed.parse_status, 'unsupported');
    assertEqual('student record exchange fixture export type is explicit', unsupportedParsed.export_type, 'powerschool_student_record_exchange');
    assertEqual('student record exchange fixture unsupported reason is explicit', unsupportedParsed.unsupported_reason, MatrixView.UNSUPPORTED_EXPORT_TYPE);
    assertEqual('unsupported fixture has zero records', unsupportedParsed.records.length, 0);
    assertEqual('unsupported fixture has zero courses', unsupportedParsed.courses.length, 0);
    assertEqual('unsupported fixture has zero days', unsupportedParsed.by_day.length, 0);

    const pdfBuffer = Buffer.from('%PDF-1.7 fake MatrixView bytes', 'utf8');
    const pdfParsed = await MatrixView.parseMatrixViewPdfArrayBuffer(
        pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength)
    );
    assertEqual('PDF input is explicit unsupported', pdfParsed.parse_status, 'unsupported');
    assertEqual('PDF unsupported export type is explicit', pdfParsed.export_type, 'pdf_matrixview_unreliable');
    assertEqual('PDF unsupported reason is explicit', pdfParsed.unsupported_reason, MatrixView.PDF_UNRELIABLE_EXPORT_TYPE);
    assertEqual('PDF unsupported records are empty', pdfParsed.records.length, 0);
    assertEqual('PDF unsupported courses are empty', pdfParsed.courses.length, 0);
    assertEqual('PDF unsupported days are empty', pdfParsed.by_day.length, 0);

    const db = new FakeDB();
    await db.addPlan({ name: 'Personal' });
    await db.addPlan({ name: 'Projects' });
    await db.addPlan({ name: '大学申请' });
    await db.addPlan({ name: 'Mystery Club' });
    await db.addPlan({ name: 'English HL', subject: null });
    await db.addPlan({ name: 'Old Physics', subject: 'Physics' });
    const existingOtherSchoolPlan = await db.addPlan({ name: MatrixView.OTHER_SCHOOL_PLAN_NAME });
    await db.addBucket({ plan_id: existingOtherSchoolPlan.id, name: 'Homework', sort_order: 0 });

    const mappings = [
        { subject: 'English Language Acquisition Phase 5', subject_in_matrixview: 'English Language Acquisition Phase 5' },
        { subject: 'Mathematics Analysis HL', subject_in_matrixview: 'Mathematics Analysis HL' },
        { subject: 'Biology HL', subject_in_matrixview: 'Biology HL' },
        { subject: MatrixView.OTHER_SCHOOL_PLAN_NAME, subject_in_matrixview: 'Community Time' },
        { subject: MatrixView.OTHER_SCHOOL_PLAN_NAME, subject_in_matrixview: 'Dorm Check' },
        { subject: '', subject_in_matrixview: 'Optional Club Block' }
    ];
    const preview = await MatrixView.previewSubjectPlanInitialization(db, mappings);
    assert('preview includes delete/rebuild list before execution', preview.deleteRebuildPlanNames.includes('English HL') && preview.deleteRebuildPlanNames.includes('Old Physics'));
    assert('preview includes preserved non-subject plans', preview.preservedPlanNames.includes('Personal') && preview.preservedPlanNames.includes('Projects'));
    assert('preview includes uncertain plan names', preview.uncertainPlanNames.includes('Mystery Club'));

    const first = await MatrixView.initializeSubjectPlans(db, mappings);
    const plansAfterFirst = await db.getPlans();
    const planNamesAfterFirst = plansAfterFirst.map(plan => plan.name);

    assert('plan init creates full-name subject Plans', ['Biology HL', 'English Language Acquisition Phase 5', 'Mathematics Analysis HL'].every(name => planNamesAfterFirst.includes(name)));
    assert('plan init creates Other School Plan', planNamesAfterFirst.includes(MatrixView.OTHER_SCHOOL_PLAN_NAME));
    assert('plan init reuses existing Other School Plan', first.createdOtherSchoolPlan === false);
    assert('plan init skips empty edited Subject rows', !planNamesAfterFirst.includes('Optional Club Block'));
    assert('plan init removes old subject-related Plans', !planNamesAfterFirst.includes('English HL') && !planNamesAfterFirst.includes('Old Physics'));
    assert('plan init preserves non-subject Plans', ['Personal', 'Projects', '大学申请'].every(name => planNamesAfterFirst.includes(name)));
    assert('plan init keeps uncertain Plans and reports them', planNamesAfterFirst.includes('Mystery Club') && first.uncertainPlans.some(plan => plan.name === 'Mystery Club'));

    for (const plan of plansAfterFirst.filter(plan => ['Biology HL', 'English Language Acquisition Phase 5', 'Mathematics Analysis HL'].includes(plan.name))) {
        const bucketNames = (await db.getBucketsByPlan(plan.id)).map(bucket => bucket.name);
        assert(`subject default buckets exist for ${plan.name}`, MatrixView.DEFAULT_BUCKETS.every(name => bucketNames.includes(name)));
    }
    const otherPlanAfterFirst = plansAfterFirst.find(plan => plan.name === MatrixView.OTHER_SCHOOL_PLAN_NAME);
    const otherBucketNamesAfterFirst = (await db.getBucketsByPlan(otherPlanAfterFirst.id)).map(bucket => bucket.name);
    assert('Other School Plan default buckets use school template', MatrixView.OTHER_SCHOOL_DEFAULT_BUCKETS.every(name => otherBucketNamesAfterFirst.includes(name)));
    assert('Other School Plan safe bucket supplement removes empty legacy bucket', !otherBucketNamesAfterFirst.includes('Homework'));

    await MatrixView.initializeSubjectPlans(db, mappings);
    const plansAfterSecond = await db.getPlans();
    const counts = plansAfterSecond.reduce((acc, plan) => {
        acc[plan.name] = (acc[plan.name] || 0) + 1;
        return acc;
    }, {});
    assert('plan init is idempotent for subject and Other School Plan names', ['Biology HL', 'English Language Acquisition Phase 5', 'Mathematics Analysis HL', MatrixView.OTHER_SCHOOL_PLAN_NAME].every(name => counts[name] === 1));
    const otherSchoolPlan = plansAfterSecond.find(plan => plan.name === MatrixView.OTHER_SCHOOL_PLAN_NAME);
    const otherBuckets = await db.getBucketsByPlan(otherSchoolPlan.id);
    assertEqual('idempotent run does not duplicate Other School Plan buckets', otherBuckets.length, MatrixView.OTHER_SCHOOL_DEFAULT_BUCKETS.length);
    assert('Other School Plan mappings do not create duplicate subject Plans', counts[MatrixView.OTHER_SCHOOL_PLAN_NAME] === 1);
    assert('plan init stores non-empty subject mappings in settings', Array.isArray(db.settings[MatrixView.SETTINGS_MAPPING_KEY]) && db.settings[MatrixView.SETTINGS_MAPPING_KEY].length === 5);

    const dbJs = fs.readFileSync(path.join(__dirname, '..', 'extension', 'shared', 'js', 'db.js'), 'utf8');
    assert('DB default My Tasks bucket template uses D-015 subject buckets', dbJs.includes("const SUBJECT_DEFAULT_BUCKETS = ['上课', '作业', '单元测试', '阶段考试']")
        && /ensureDefaultPlan[\s\S]*ensureBucketTemplateForPlan\(plan\.id, SUBJECT_DEFAULT_BUCKETS\)/.test(dbJs));
    const supplementFunction = dbJs.match(/async ensureBucketTemplatesForExistingPlans\(\) \{[\s\S]*?\n    \},/)?.[0] || '';
    assert('DB has safe existing bucket supplement without task moves', supplementFunction
        && dbJs.includes('LEGACY_DEFAULT_BUCKETS')
        && !/updateTask/.test(supplementFunction));
    assert('DB removes only empty legacy default buckets directly', dbJs.includes('async deleteEmptyLegacyBucketsForPlan(planId)')
        && /LEGACY_DEFAULT_BUCKETS\.includes\(bucket\.name\)[\s\S]*taskCount > 0[\s\S]*db\.buckets\.delete\(bucket\.id\)/.test(dbJs));

    console.log('\n' + '='.repeat(40));
    console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
    if (failed > 0) process.exit(1);
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
