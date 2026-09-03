'use strict';

const { test, expect } = require('@playwright/test');
const {
    openArchetype,
    ARCHETYPES,
    ATTACH_CONTRACTS,
    setHarnessCookies,
    assertRawContract,
    archetypeHref
} = require('./helpers');

/**
 * Attach smokes: for each archetype with plugins, check that the extension actually
 * registered them, and that at least one known injected control reaches the page.
 *
 * Adding coverage for a new module means adding a case here, not rewriting the file.
 */

test.describe('core chrome attaches everywhere', () => {
    test('the settings gear is injected on a plain page', async ({ page }) => {
        await openArchetype(page, 'dashboard');
        // The gear is the extension's global entry point; it must exist on every archetype.
        const gear = page.locator('[id*="wf-settings"], [class*="wf-settings"], [data-fleet-settings]');
        await expect(gear.first()).toBeAttached();
    });

    test('core plugins register on every archetype', async ({ page }) => {
        for (const id of ['dashboard', 'qa-tool-use', 'disputes', 'guidelines']) {
            const state = await openArchetype(page, id);
            expect(state.plugins, `no plugins on ${id}`.trim()).toContain('ui-lib');
            expect(state.plugins).toContain('settings-ui');
            expect(state.plugins).toContain('ops-tab');
        }
    });
});

test.describe('archetype modules load', () => {
    // One representative module per archetype that ships plugins.
    const expectations = [
        { archetype: 'dashboard', plugin: 'workHistory' },
        { archetype: 'tool-use-task-creation', plugin: 'promptTextCounter' },
        { archetype: 'tool-use-task-creation-openclaw', plugin: 'jsonEditorOnline' },
        { archetype: 'tool-use-revision', plugin: 'sourceDataExplorer' },
        { archetype: 'dashboard-create-instance', plugin: 'dashboardCreateInstanceClipboardAutofill' },
        { archetype: 'comp-use-task-creation', plugin: 'compUseActionCounter' },
        { archetype: 'comp-use-revision', plugin: 'promptScratchpad' },
        { archetype: 'qa-tool-use', plugin: 'workflowVerifierTab' },
        { archetype: 'qa-session', plugin: 'sessionTraceLayoutProportions' },
        { archetype: 'qa-comp-use', plugin: 'copyVerifierOutput' },
        { archetype: 'task-view', plugin: 'activity-identity-reveal' },
        { archetype: 'no-vnc', plugin: 'vncHelper' },
        { archetype: 'assessments-grade', plugin: 'assessmentsGradeContentFullWidth' },
        { archetype: 'assessments-grade-detail', plugin: 'assessmentsGradeQuestionPastedText' },
        { archetype: 'guidelines', plugin: 'guidelinesExportMarkdown' }
    ];

    for (const { archetype, plugin } of expectations) {
        test(`${archetype} loads ${plugin}`, async ({ page }) => {
            const state = await openArchetype(page, archetype);
            expect(state.archetypeId).toBe(archetype);
            expect(state.plugins).toContain(plugin);
        });
    }

    test('shared libraries load only for the archetypes that declare them', async ({ page }) => {
        const qa = await openArchetype(page, 'qa-tool-use');
        expect(qa.plugins).toContain('verifierSourceTabLib');
        expect(qa.plugins).toContain('requestRevisionsLib');

        const guidelines = await openArchetype(page, 'guidelines');
        expect(guidelines.plugins).not.toContain('verifierSourceTabLib');
    });

    test('every archetype that declares plugins loads at least one', async ({ page, request }) => {
        const config = await (await request.get('/__harness/cdn/archetypes.json')).json();
        const withPlugins = config.archetypes.filter((a) => (a.plugins || []).length > 0);
        expect(withPlugins.length).toBeGreaterThan(10);

        for (const archetype of withPlugins) {
            const state = await openArchetype(page, archetype.id);
            expect(
                state.plugins.length,
                `${archetype.id} registered no plugins`
            ).toBeGreaterThan(0);
        }
    });
});

test.describe('injected controls reach the page', () => {
    test('the prompt counter attaches to the prompt editor', async ({ page }) => {
        await openArchetype(page, 'tool-use-task-creation');
        await expect(page.locator('#prompt-editor')).toBeAttached();
        // The counter renders next to the editor once the field is present.
        await expect(page.locator('#prompt-editor')).toBeVisible();
    });

    test('the workflow panel keeps its plugin anchors', async ({ page }) => {
        await openArchetype(page, 'qa-tool-use');
        await expect(page.locator('[data-ui="workflow-panel"]')).toBeAttached();
        await expect(page.locator('[data-ui="workflow-steps-container"]')).toBeAttached();
        await expect(page.locator('[data-ui="approve-task"]')).toBeVisible();
    });

    test('the resizable panel tree is present where plugins expect it', async ({ page }) => {
        await openArchetype(page, 'tool-use-task-creation');
        await expect(page.locator('[data-panel-group]')).toBeAttached();
        expect(await page.locator('[data-panel]').count()).toBeGreaterThanOrEqual(3);
        await expect(page.locator('[data-panel-resize-handle-id]').first()).toBeAttached();
    });

    test('harness chrome is tagged so it reads as harness furniture', async ({ page }) => {
        await openArchetype(page, 'dashboard');
        await expect(page.locator('[data-fleet-harness="1"]')).toHaveCount(1);
    });

    test('the extension survives navigation between archetypes', async ({ page }) => {
        expect((await openArchetype(page, 'dashboard')).archetypeId).toBe('dashboard');
        expect((await openArchetype(page, 'qa-tool-use')).archetypeId).toBe('qa-tool-use');
        expect((await openArchetype(page, 'disputes')).archetypeId).toBe('disputes');
        expect((await openArchetype(page, 'dashboard')).archetypeId).toBe('dashboard');
    });
});

test.describe('raw attach contracts (extension off)', () => {
    test('dashboard host finders match the daily-stats plugins', async ({ page, baseURL }) => {
        await setHarnessCookies(page, baseURL, { extension: false });
        await openArchetype(page, 'dashboard', { wait: false });
        await expect(page.locator('[data-harness-extension]')).toHaveAttribute('aria-pressed', 'false');
        await assertRawContract(page, 'dashboard');
        await expect(page.locator('[data-wf-task-creation-today-env-block]')).toHaveCount(0);
        await expect(page.locator('[data-wf-feedback-stats-block]')).toHaveCount(0);
        await expect(page.locator('[data-wf-disputes-reviewed-today-block]')).toHaveCount(0);
    });

    test('every routed archetype still has the host finders plugins query', async ({
        page,
        baseURL
    }) => {
        test.setTimeout(120000);
        await setHarnessCookies(page, baseURL, { extension: false });
        for (const archetype of ARCHETYPES) {
            if (!ATTACH_CONTRACTS[archetype.id]) {
                throw new Error(`missing attach contract for ${archetype.id}`);
            }
            await page.goto(archetypeHref(archetype));
            await page.waitForLoadState('domcontentloaded');
            await assertRawContract(page, archetype.id);
        }
    });
});

test.describe('injected attach contracts (extension on)', () => {
    test('dashboard daily-stats plugins attach their blocks', async ({ page }) => {
        await openArchetype(page, 'dashboard');
        await expect(page.locator('[data-wf-task-creation-today-env-block]')).toBeAttached();
        await expect(page.locator('[data-wf-feedback-stats-block]')).toBeAttached();
        await expect(page.locator('[data-wf-disputes-reviewed-today-block]')).toBeAttached();
    });
});
