'use strict';

const { test, expect } = require('@playwright/test');
const { personas } = require('./helpers');

test.describe('harness API contracts', () => {
    test('health reports the expected seed shape', async ({ request }) => {
        const body = await (await request.get('/__harness/health')).json();
        expect(body.ok).toBe(true);
        expect(body.archetypes).toBe(20);
        expect(body.seed).toMatchObject({ people: 10, qaPeople: 6, resolvers: 2, tasks: 98 });
    });

    test('persona roster splits writers, QA and resolvers', async ({ request }) => {
        const roster = await personas(request);
        expect(roster.all).toHaveLength(10);
        expect(roster.all.every((p) => p.name && p.email.endsWith('@harness.example'))).toBe(true);
        expect(roster.all.filter((p) => p.isQa)).toHaveLength(6);
        expect(roster.all.filter((p) => p.isResolver)).toHaveLength(2);
        // Every resolver is also QA; QA is a superset of resolvers.
        expect(roster.all.filter((p) => p.isResolver).every((p) => p.isQa)).toBe(true);
    });

    test('dispute list paginates and carries the embedded task and creator', async ({ request }) => {
        const body = await (await request.get('/api/disputes?status=open&limit=2')).json();
        expect(body.success).toBe(true);
        expect(body.disputes.length).toBeLessThanOrEqual(2);
        expect(body.totalCount).toBeGreaterThan(0);

        const dispute = body.disputes[0];
        expect(dispute.dispute_status).toBe('pending');
        expect(dispute.eval_task).toMatchObject({ key: expect.stringContaining('task_harness') });
        expect(dispute.creator.full_name).toBeTruthy();
        expect(dispute.original_feedback_content).toBeTruthy();
    });

    test('resolved disputes are filtered out of the open list', async ({ request }) => {
        const resolved = await (await request.get('/api/disputes?status=resolved')).json();
        expect(resolved.disputes.length).toBeGreaterThan(0);
        expect(resolved.disputes.every((d) => d.dispute_status !== 'pending')).toBe(true);
        expect(resolved.disputes.every((d) => d.resolved_by && d.resolved_at)).toBe(true);
    });

    test('task-disputes only returns resolved rows for a task', async ({ request }) => {
        const resolved = await (await request.get('/api/disputes?status=resolved')).json();
        const taskId = resolved.disputes[0].eval_task_id;
        const body = await (await request.get(`/api/disputes/task-disputes?taskId=${taskId}`)).json();
        expect(body.disputes.every((d) => d.dispute_status !== 'pending')).toBe(true);
    });

    test('claim then release moves the lease on and off a dispute', async ({ request }) => {
        const roster = await personas(request);
        const open = await (await request.get('/api/disputes?status=open')).json();
        const id = open.disputes[0].id;
        const headers = { cookie: `current-user-id=${roster.resolver.id}` };

        const claimed = await (await request.post(`/api/disputes/${id}/claim`, { headers, data: {} })).json();
        expect(claimed.dispute.leased_by).toBe(roster.resolver.id);
        expect(claimed.dispute.lease_expires_at).toBeTruthy();

        const released = await (await request.post(`/api/disputes/${id}/release`, { headers, data: {} })).json();
        expect(released.dispute.leased_by).toBeNull();
    });

    test('internal dispute review history answers in the documented shape', async ({ request }) => {
        const roster = await personas(request);
        const response = await request.get(
            `/__harness/internal/v1/dispute-reviews/history?user_id=${roster.resolver.id}&limit=5`
        );
        const body = await response.json();
        expect(body).toHaveProperty('total_count');
        expect(Array.isArray(body.disputes)).toBe(true);
    });

    test('orchestrator returns a verifier version and an empty instance list', async ({ request }) => {
        const versions = await (await request.get('/__harness/rest/v1/verifier_versions?select=id&limit=1')).json();
        const detail = await (
            await request.get(`/__harness/orchestrator/v1/verifiers/versions/${versions[0].id}`)
        ).json();
        expect(detail.display_src).toContain('def verify');
        expect(detail.code).toContain('def verify');
        expect(detail.version).toBe(1);

        const instances = await (await request.get('/__harness/orchestrator/v1/env/instances')).json();
        expect(instances.instances).toEqual([]);
    });

    test('screenshot view-urls returns index-aligned URL array', async ({ request }) => {
        const keys = ['harness/screens/a.png', 'harness/screens/b.png'];
        const body = await (
            await request.post('/api/orchestrator-private/v1/qa-feedback/screenshots/view-urls', {
                data: { s3_keys: keys }
            })
        ).json();
        expect(body.urls).toHaveLength(2);
        expect(body.urls[0]).toContain(encodeURIComponent(keys[0]));

        const image = await request.get(body.urls[0]);
        expect(image.status()).toBe(200);
        expect(image.headers()['content-type']).toBe('image/png');
    });

    test('work stats returns feedback rows in the production envelope', async ({ request }) => {
        const roster = await personas(request);
        const body = await (
            await request.get(`/api/orchestrator-private/v1/work/stats/qa-feedback?userId=${roster.qaOnly.id}`)
        ).json();
        expect(Array.isArray(body.feedbacks)).toBe(true);
        expect(typeof body.total_count).toBe('number');
        expect(typeof body.has_more).toBe('boolean');
        if (body.feedbacks.length) {
            expect(body.feedbacks[0]).toHaveProperty('eval_task');
            expect(body.feedbacks[0]).toHaveProperty('eval_task_version');
        }
    });

    test('computer-use create-context returns annotator instructions from the seed', async ({ request }) => {
        const targets = await (
            await request.get('/__harness/rest/v1/task_project_targets?select=id&limit=1')
        ).json();
        expect(targets[0].id).toBeTruthy();
        const body = await (
            await request.get(
                `/api/orchestrator-private/v1/work/authoring/computer-use/targets/${targets[0].id}/create-context`
            )
        ).json();
        expect(body.scenario.human_annotator_instructions).toBeTruthy();
        expect(body.target.id).toBe(targets[0].id);
    });

    test('unstubbed API routes fail loudly instead of returning empty success', async ({ request }) => {
        const response = await request.get('/api/definitely-not-a-real-route');
        expect(response.status()).toBe(404);
        expect((await response.json()).success).toBe(false);
    });

    test('OpenRouter is answered with the provider error shape, not a fake completion', async ({ request }) => {
        const response = await request.post('/__harness/openrouter/api/v1/chat/completions', { data: {} });
        expect(response.status()).toBe(501);
        expect((await response.json()).error.message).toContain('not available');
    });
});

test.describe('synthetic data hygiene', () => {
    test('no seeded value looks like production data', async ({ request }) => {
        const seed = await (await request.get('/__harness/seed')).json();
        const raw = JSON.stringify(seed);

        // Emails and identifiers stay inside the reserved harness domain.
        const emails = raw.match(/[\w.+-]+@[\w.-]+/g) || [];
        expect(emails.length).toBeGreaterThan(0);
        expect(emails.every((email) => email.endsWith('@harness.example'))).toBe(true);

        expect(raw).not.toMatch(/fleetai\.com/);
        expect(raw).not.toMatch(/supabase\.co/);
        expect(raw.toLowerCase()).not.toContain('surge');
    });

    test('ids are stable across requests', async ({ request }) => {
        const first = await (await request.get('/__harness/rest/v1/tasks?select=id,key&order=key.asc')).json();
        const second = await (await request.get('/__harness/rest/v1/tasks?select=id,key&order=key.asc')).json();
        expect(second).toEqual(first);
        expect(first[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
});
