'use strict';

const { test, expect } = require('@playwright/test');

const REST = '/__harness/rest/v1';

test.describe('PostgREST-shaped reads', () => {
    test('exact counts come back in Content-Range', async ({ request }) => {
        const response = await request.get(`${REST}/tasks?select=id&limit=5`);
        expect(response.status()).toBe(200);
        expect(response.headers()['content-range']).toMatch(/^0-4\/90$/);
        expect(await response.json()).toHaveLength(5);
    });

    test('offset pages through without repeating rows', async ({ request }) => {
        const first = await (await request.get(`${REST}/tasks?select=key&order=key.asc&limit=5`)).json();
        const second = await (
            await request.get(`${REST}/tasks?select=key&order=key.asc&limit=5&offset=5`)
        ).json();
        const overlap = first.filter((row) => second.some((other) => other.key === row.key));
        expect(overlap).toHaveLength(0);
    });

    test('eq, in, is and not filters narrow the result set', async ({ request }) => {
        const shipped = await (
            await request.get(`${REST}/tasks?select=key,task_lifecycle_status&task_lifecycle_status=eq.production`)
        ).json();
        expect(shipped.length).toBeGreaterThan(0);
        expect(shipped.every((row) => row.task_lifecycle_status === 'production')).toBe(true);

        const twoStates = await (
            await request.get(`${REST}/tasks?select=key&task_lifecycle_status=in.(production,bugged)`)
        ).json();
        expect(twoStates.length).toBeGreaterThan(shipped.length);

        const systemRows = await (
            await request.get(`${REST}/qa_feedback?select=id,created_by&created_by=is.null`)
        ).json();
        expect(systemRows.length).toBeGreaterThan(0);
        expect(systemRows.every((row) => row.created_by === null)).toBe(true);

        const humanRows = await (
            await request.get(`${REST}/qa_feedback?select=id,created_by&created_by=not.is.null`)
        ).json();
        expect(humanRows.every((row) => row.created_by !== null)).toBe(true);
    });

    test('or groups combine conditions', async ({ request }) => {
        const rows = await (
            await request.get(
                `${REST}/qa_feedback?select=id,is_positive_feedback,is_system_feedback` +
                    `&or=(is_positive_feedback.eq.true,is_system_feedback.eq.true)`
            )
        ).json();
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((row) => row.is_positive_feedback || row.is_system_feedback)).toBe(true);
    });

    test('order honours direction and nullslast', async ({ request }) => {
        const rows = await (
            await request.get(`${REST}/tasks?select=key&order=key.desc`)
        ).json();
        const keys = rows.map((row) => row.key);
        expect(keys).toEqual([...keys].sort().reverse());

        const nulls = await (
            await request.get(`${REST}/qa_feedback?select=created_by&order=created_by.asc.nullslast`)
        ).json();
        const firstNull = nulls.findIndex((row) => row.created_by === null);
        const lastValue = nulls.map((row) => row.created_by).lastIndexOf(null);
        expect(firstNull).toBeGreaterThan(-1);
        expect(lastValue).toBe(nulls.length - 1);
    });

    test('select projects only the requested columns', async ({ request }) => {
        const rows = await (await request.get(`${REST}/profiles?select=id,full_name&limit=1`)).json();
        expect(Object.keys(rows[0]).sort()).toEqual(['full_name', 'id']);
    });

    test('a to-one embed resolves through the aliased foreign key', async ({ request }) => {
        const rows = await (
            await request.get(
                `${REST}/qa_feedback?select=id,eval_tasks:tasks(id,key,team_id,env_key)&created_by=not.is.null&limit=1`
            )
        ).json();
        expect(rows[0].eval_tasks).toMatchObject({
            key: expect.stringContaining('task_harness'),
            team_id: expect.any(String)
        });
    });

    test('a to-many embed nests child rows', async ({ request }) => {
        const rows = await (
            await request.get(`${REST}/tasks?select=key,task_versions(version_no,prompt,metadata)&limit=1`)
        ).json();
        expect(Array.isArray(rows[0].task_versions)).toBe(true);
        expect(rows[0].task_versions[0]).toMatchObject({
            version_no: 1,
            metadata: { verifier_version: 1 }
        });
    });

    test('revised tasks embed their whole version history', async ({ request }) => {
        const rows = await (
            await request.get(`${REST}/tasks?select=key,current_version_id,task_versions(id,version_no)`)
        ).json();
        const revised = rows.filter((row) => row.task_versions.length > 1);
        expect(revised.length).toBeGreaterThan(0);

        for (const row of revised) {
            const numbers = row.task_versions.map((v) => v.version_no).sort((a, b) => a - b);
            expect(numbers).toEqual(numbers.map((_n, i) => i + 1));
            const newest = row.task_versions.find((v) => v.version_no === numbers.length);
            expect(row.current_version_id).toBe(newest.id);
        }
    });

    test('version history query uses task_id and version_no', async ({ request }) => {
        const task = (await request.get(`${REST}/tasks?select=id&limit=1`)).json();
        const taskRow = await task;
        const versions = await (
            await request.get(
                `${REST}/task_versions?select=id,task_id,version_no,metadata&task_id=eq.${taskRow[0].id}&order=version_no.asc`
            )
        ).json();
        expect(versions.length).toBeGreaterThan(0);
        expect(versions[0].task_id).toBe(taskRow[0].id);
        expect(versions[0].version_no).toBe(1);
        expect(typeof versions[0].metadata.problem_creation_time).toBe('number');
    });

    test('team_member embeds its team', async ({ request }) => {
        const rows = await (
            await request.get(`${REST}/team_member?select=id,role,status,team:teams(id,name)&limit=3`)
        ).json();
        expect(rows.every((row) => row.team && row.team.name.startsWith('Task Designers -'))).toBe(true);
    });

    test('the single-object accept header returns an object or 406', async ({ request }) => {
        const single = await request.get(`${REST}/profiles?select=full_name&limit=1`, {
            headers: { accept: 'application/vnd.pgrst.object+json' }
        });
        expect(single.status()).toBe(200);
        expect(Array.isArray(await single.json())).toBe(false);

        const many = await request.get(`${REST}/profiles?select=full_name`, {
            headers: { accept: 'application/vnd.pgrst.object+json' }
        });
        expect(many.status()).toBe(406);
        expect((await many.json()).code).toBe('PGRST116');
    });

    test('an unknown table answers with the PostgREST missing-relation code', async ({ request }) => {
        const response = await request.get(`${REST}/not_a_table?select=*`);
        expect(response.status()).toBe(404);
        expect((await response.json()).code).toBe('PGRST205');
    });

    test('every table key in the harness ops bundle resolves', async ({ request }) => {
        // Guards against a bundle key that names a table the seed does not provide.
        const seed = await (await request.get('/__harness/seed')).json();
        const tableKeys = [
            'tasks', 'task_versions', 'task_scenarios', 'task_projects', 'task_project_targets',
            'environments', 'qa_feedback', 'profiles', 'team_member', 'sessions',
            'qa_session_results', 'verifiers', 'verifier_versions', 'verifier_executions',
            'eval_task_leases', 'feedback_helpfulness_ratings'
        ];
        for (const table of tableKeys) {
            expect(Array.isArray(seed[table]), `seed is missing table ${table}`).toBe(true);
            const response = await request.get(`${REST}/${table}?select=*&limit=1`);
            expect(response.status(), `GET ${table} failed`).toBe(200);
        }
    });
});
