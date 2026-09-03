'use strict';

const { test, expect } = require('@playwright/test');
const { personas } = require('./helpers');

/**
 * The harness enforces the same rule the platform does: raising a flag is a QA action, and
 * resolving a dispute or a flag is a resolver action.
 */

async function firstTaskId(request) {
    const rows = await (await request.get('/__harness/rest/v1/tasks?select=id&limit=1')).json();
    return rows[0].id;
}

function as(persona) {
    return { cookie: `current-user-id=${persona.id}` };
}

test.describe('flagging is QA-only', () => {
    test('a task writer without QA is refused', async ({ request }) => {
        const roster = await personas(request);
        const response = await request.post('/api/task-flags', {
            headers: as(roster.writer),
            data: { evalTaskId: await firstTaskId(request), reason: 'other', note: 'from a writer' }
        });
        expect(response.status()).toBe(403);
        expect((await response.json()).error).toContain('QA');
    });

    test('a QA reviewer creates a pending flag', async ({ request }) => {
        const roster = await personas(request);
        const taskId = await firstTaskId(request);
        const response = await request.post('/api/task-flags', {
            headers: as(roster.qaOnly),
            data: { task_id: taskId, reason: 'ai_generated', note: 'from QA' }
        });
        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.flag_id).toBeTruthy();

        const flags = await (await request.get('/api/task-flags?status=pending')).json();
        const created = flags.flags.find((f) => f.id === body.flag_id);
        expect(created.resolution).toBeNull();
        expect(created.flagger_id).toBe(roster.qaOnly.id);
        expect(created.task.key).toContain('task_harness');
    });

    test('flag-bugged is refused for a writer and accepted for QA', async ({ request }) => {
        const roster = await personas(request);
        const taskId = await firstTaskId(request);

        const refused = await request.post(`/api/flag-bugged/${taskId}`, {
            headers: as(roster.writer),
            data: { reason: 'writer attempt' }
        });
        expect(refused.status()).toBe(403);

        const allowed = await request.post(`/api/flag-bugged/${taskId}`, {
            headers: as(roster.qaOnly),
            data: { reason: 'Environment is broken or misconfigured' }
        });
        expect(allowed.status()).toBe(200);
        expect((await allowed.json()).success).toBe(true);

        const seed = await (await request.get('/__harness/seed')).json();
        const task = seed.tasks.find((t) => t.id === taskId);
        expect(task.task_lifecycle_status).toBe('bugged');
        const row = seed.qa_feedback.filter((f) => f.eval_task_id === taskId).pop();
        expect(row.feedback_data.bug_reason).toBe('Environment is broken or misconfigured');
        expect(row.is_positive_feedback).toBe(false);
    });
});

test.describe('resolutions are resolver-only', () => {
    test('a QA reviewer who is not a resolver cannot resolve a dispute', async ({ request }) => {
        const roster = await personas(request);
        const open = await (await request.get('/api/disputes?status=open')).json();
        const response = await request.post(`/api/disputes/${open.disputes[0].id}/resolve`, {
            headers: as(roster.qaOnly),
            data: { reason: 'attempt from QA' }
        });
        expect(response.status()).toBe(403);
        expect((await response.json()).error).toContain('resolver');
    });

    test('a resolver resolves a dispute and clears the lease', async ({ request }) => {
        const roster = await personas(request);
        const open = await (await request.get('/api/disputes?status=open')).json();
        const target = open.disputes[open.disputes.length - 1];

        const response = await request.post(`/api/disputes/${target.id}/resolve`, {
            headers: as(roster.resolver),
            data: { status: 'approved', resolutionReason: 'Confirmation frame is present.' }
        });
        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.dispute.dispute_status).toBe('approved');
        expect(body.dispute.new_lifecycle_status).toBeTruthy();
    });

    test('a QA reviewer cannot resolve a flag; a resolver can', async ({ request }) => {
        const roster = await personas(request);
        const created = await (
            await request.post('/api/task-flags', {
                headers: as(roster.qaOnly),
                data: { task_id: await firstTaskId(request), reason: 'other', note: 'resolve me' }
            })
        ).json();

        const refused = await request.post(`/api/task-flags/${created.flag_id}/resolve`, {
            headers: as(roster.qaOnly),
            data: { resolution: 'dismissed' }
        });
        expect(refused.status()).toBe(403);

        const allowed = await request.post(`/api/task-flags/${created.flag_id}/resolve`, {
            headers: as(roster.resolver),
            data: { resolution: 'dismissed', note: 'Not actionable' }
        });
        expect(allowed.status()).toBe(200);
        expect((await allowed.json()).success).toBe(true);

        const flags = await (await request.get('/api/task-flags')).json();
        const resolved = flags.flags.find((f) => f.id === created.flag_id);
        expect(resolved.resolution).toBe('dismissed');
    });

    test('team member removal needs resolver-level permissions', async ({ request }) => {
        const roster = await personas(request);
        const refused = await request.post('/api/orchestrator-private/v1/team/members/bulk-remove', {
            headers: as(roster.writer),
            data: { userIds: [roster.writer.id] }
        });
        expect(refused.status()).toBe(403);
    });
});

test.describe('persona switching', () => {
    test('with no cookie the first resolver acts by default', async ({ request }) => {
        const roster = await personas(request);
        const body = await (await request.get('/__harness/personas')).json();
        expect(body.active).toBe(roster.all[0].id);
        expect(roster.all[0].isResolver).toBe(true);
    });

    test('the persona cookie changes who the API sees', async ({ request }) => {
        const roster = await personas(request);
        const body = await (
            await request.get('/__harness/personas', { headers: as(roster.writer) })
        ).json();
        expect(body.active).toBe(roster.writer.id);
    });
});
