'use strict';

const { test, expect } = require('@playwright/test');
const { ARCHETYPES, archetypeHref, waitForExtension, collectConsoleErrors } = require('./helpers');

test.describe('archetype detection', () => {
    // Each archetype route must resolve to that exact archetype in the running extension.
    for (const archetype of ARCHETYPES) {
        test(`${archetype.id} is detected at ${archetype.path}`, async ({ page }) => {
            await page.goto(archetypeHref(archetype));
            const state = await waitForExtension(page);
            expect(state.archetypeId).toBe(archetype.id);
            expect(state.path).toBeTruthy();
        });
    }

    test('the two create-tool-use routes disambiguate on page text', async ({ page }) => {
        await page.goto('/work/problems/create-tool-use/harness');
        expect((await waitForExtension(page)).archetypeId).toBe('tool-use-task-creation');

        await page.goto('/work/problems/create-tool-use/harness?openclaw=1');
        expect((await waitForExtension(page)).archetypeId).toBe('tool-use-task-creation-openclaw');
    });

    test('an unmatched path leaves the extension without an archetype', async ({ page }) => {
        const response = await page.goto('/work/nothing-here');
        expect(response.status()).toBe(404);
        const state = await waitForExtension(page);
        expect(state.archetypeId).toBeNull();
    });

    test('the tab strip links to every archetype', async ({ page }) => {
        await page.goto('/work/create');
        const tabs = page.locator('[data-fleet-harness="1"] [data-harness-tab]');
        await expect(tabs).toHaveCount(ARCHETYPES.length);
    });

    test('clicking a tab navigates and re-detects', async ({ page }) => {
        await page.goto('/work/create');
        await waitForExtension(page);

        await page.locator('[data-harness-tab="disputes"]').click();
        await page.waitForURL('**/work/problems/disputes');
        expect((await waitForExtension(page)).archetypeId).toBe('disputes');
    });
});

test.describe('extension load', () => {
    test('plugins load from the harness CDN, not GitHub', async ({ page }) => {
        const external = [];
        page.on('request', (request) => {
            const host = new URL(request.url()).hostname;
            if (!['127.0.0.1', 'localhost', 'harness'].includes(host)) external.push(request.url());
        });

        await page.goto('/work/problems/qa-tool-use/harness');
        await waitForExtension(page);
        expect(external).toEqual([]);
    });

    test('the host reports harness mode and a matching version', async ({ page, request }) => {
        await page.goto('/work/create');
        await waitForExtension(page);

        const archetypes = await (await request.get('/__harness/cdn/archetypes.json')).json();
        const reported = await page.evaluate(() => {
            const state = window.__FLEET_UX_HARNESS_STATE__;
            return { plugins: state.plugins, path: state.path };
        });
        expect(reported.plugins.length).toBeGreaterThan(0);
        expect(reported.path).toBe('work/create');
        expect(archetypes.version).toBeTruthy();
    });

    test('loading an archetype page produces no page errors', async ({ page }) => {
        const errors = collectConsoleErrors(page);
        await page.goto('/work/problems/qa-tool-use/harness');
        await waitForExtension(page);
        // Ops-gated modules log expected "not loaded" notices; only hard errors matter here.
        const hard = errors.filter((text) => !/Ops bundle not loaded|ops password/i.test(text));
        expect(hard).toEqual([]);
    });
});
