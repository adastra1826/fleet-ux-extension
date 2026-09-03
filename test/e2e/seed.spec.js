'use strict';

const { test, expect } = require('@playwright/test');

/**
 * Production-parity checks on the synthetic seed: column names, enums, and nested shapes.
 */

const LIFECYCLE_VALUES = [
    'production', 'staging', 'development', 'discarded', 'dismissed', 'bugged',
    'disputed', 'escalated-fleet-review', 'recovery-verifier', 'recovery-diff',
    'platform_processing'
];

const REJECTION_KEYS = [
    'verifier_broken', 'unclear_prompt', 'unrealistic_prompt', 'impossible_task',
    'factual_errors', 'not_following_scenario', 'too_simple', 'other'
];

const DISPUTE_CATEGORIES = ['factual_error', 'misunderstanding', 'valid_approach', 'other', 'tool_issue'];

const DISPUTE_STATUSES = ['pending', 'approved', 'rejected', 'approved_with_revisions', 'approved_and_accepted'];

const { TABLES, assertTable } = require('../harness/seed/schema');

let seed;

test.beforeAll(async ({ request }) => {
    seed = await (await request.get('/__harness/seed')).json();
});

test.describe('schema column coverage', () => {
    for (const tableName of Object.keys(TABLES)) {
        test(`${tableName} rows expose every documented column`, () => {
            const rows = seed[tableName];
            if (!Array.isArray(rows) || rows.length === 0) return;
            const problems = assertTable(tableName, rows);
            expect(problems, JSON.stringify(problems.slice(0, 3))).toEqual([]);
        });
    }
});

test.describe('task population', () => {
    test('every task carries a real lifecycle status, weighted toward production', () => {
        expect(seed.tasks.length).toBe(90);
        const unknown = seed.tasks.filter((t) => !LIFECYCLE_VALUES.includes(t.task_lifecycle_status));
        expect(unknown.map((t) => t.task_lifecycle_status)).toEqual([]);

        const production = seed.tasks.filter((t) => t.task_lifecycle_status === 'production').length;
        expect(production / seed.tasks.length).toBeGreaterThan(0.6);
        expect(production / seed.tasks.length).toBeLessThan(0.85);

        for (const status of ['disputed', 'bugged', 'escalated-fleet-review']) {
            expect(seed.tasks.some((t) => t.task_lifecycle_status === status), status).toBe(true);
        }
    });

    test('version rows use production column names and v1 carries problem_creation_time', () => {
        const perTask = new Map();
        for (const version of seed.task_versions) {
            expect(version).toHaveProperty('task_id');
            expect(version).toHaveProperty('version_no');
            expect(version.version).toBeNull();
            perTask.set(version.task_id, (perTask.get(version.task_id) || 0) + 1);
        }
        expect(perTask.size).toBe(seed.tasks.length);

        const v1Rows = seed.task_versions.filter((v) => v.version_no === 1);
        expect(v1Rows.length).toBe(seed.tasks.length);
        const withCreationTime = v1Rows.filter(
            (v) => v.metadata && typeof v.metadata.problem_creation_time === 'number'
        );
        expect(withCreationTime.length).toBe(seed.tasks.length);

        const versionIds = new Set(seed.task_versions.map((v) => v.id));
        expect(seed.tasks.every((t) => versionIds.has(t.current_version_id))).toBe(true);
    });
});

test.describe('QA feedback shapes', () => {
    test('feedback ids are numeric and sessions use eval_task', () => {
        for (const row of seed.qa_feedback) {
            expect(typeof row.id).toBe('number');
            expect(row.id).toBeGreaterThan(1100000);
        }
        for (const session of seed.sessions) {
            expect(session).toHaveProperty('eval_task');
            expect(session).not.toHaveProperty('eval_task_id');
        }
    });

    test('only about half the tasks are reviewed', () => {
        const reviewed = new Set(seed.qa_feedback.map((f) => f.eval_task_id));
        const share = reviewed.size / seed.tasks.length;
        expect(share).toBeGreaterThan(0.4);
        expect(share).toBeLessThan(0.7);
    });

    test('approvals carry a checklist and discards carry rejection keys', () => {
        const approvals = seed.qa_feedback.filter((f) => f.is_positive_feedback);
        expect(approvals.length).toBeGreaterThan(0);
        for (const row of approvals) {
            expect(Object.keys(row.feedback_data.qa_checklist).sort())
                .toEqual(['achievable', 'clearSolution', 'wellSpecified']);
            expect(typeof row.feedback_data.qa_review_duration_seconds).toBe('number');
        }

        const discards = seed.qa_feedback.filter((f) => f.feedback_data.rejection_reason);
        expect(discards.length).toBeGreaterThan(5);
        for (const row of discards) {
            expect(REJECTION_KEYS).toContain(row.feedback_data.rejection_reason);
        }
    });

    test('bug rows use real reason labels and no rejection keys', () => {
        const bugs = seed.qa_feedback.filter((f) => f.feedback_data.bug_reason);
        expect(bugs.length).toBeGreaterThan(0);
        for (const row of bugs) {
            expect(typeof row.feedback_data.bug_description).toBe('string');
            expect(row.feedback_data.rejection_reason).toBeUndefined();
        }
    });
});

test.describe('disputes and flags', () => {
    test('dispute statuses use production enum values', () => {
        expect(seed.disputes.length).toBeGreaterThan(5);
        for (const dispute of seed.disputes) {
            expect(DISPUTE_CATEGORIES).toContain(dispute.dispute_data.category);
            expect(DISPUTE_STATUSES).toContain(dispute.dispute_status);
        }
        expect(seed.disputes.some((d) => d.dispute_status === 'pending')).toBe(true);
        expect(seed.disputes.some((d) => d.dispute_status === 'approved')).toBe(true);
    });

    test('flags use task_id and resolution, not harness-native names', () => {
        expect(seed.task_flags.length).toBeGreaterThan(0);
        for (const flag of seed.task_flags) {
            expect(flag).toHaveProperty('task_id');
            expect(flag).toHaveProperty('resolution');
            expect(flag).not.toHaveProperty('status');
            expect(flag.flagger).toMatchObject({ full_name: expect.any(String), email: expect.any(String) });
        }
    });

    test('environments expose env_key', () => {
        expect(seed.environments.every((e) => e.env_key.startsWith('harness-'))).toBe(true);
        expect(seed.environments.every((e) => !('key' in e))).toBe(true);
    });
});

test('identifiers stay in the harness namespace', () => {
    expect(seed.tasks.every((t) => t.key.startsWith('task_harness'))).toBe(true);
});
