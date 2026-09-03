'use strict';

const { test, expect } = require('@playwright/test');
const { openArchetype, waitForExtension } = require('./helpers');

/**
 * The harness bar can skip loading fleet.user.js so the reconstructed page can be
 * compared with and without the extension.
 */

test.describe('extension toggle', () => {
    test('Extension is on by default and the userscript loads', async ({ page }) => {
        await openArchetype(page, 'dashboard');
        const toggle = page.locator('[data-harness-extension]');
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        const gear = page.locator('[id*="wf-settings"], [class*="wf-settings"], [data-fleet-settings]');
        await expect(gear.first()).toBeAttached();
        const loaded = await page.evaluate(() =>
            Array.from(document.scripts).some((s) => /fleet\.user\.js/.test(s.src))
        );
        expect(loaded).toBe(true);
    });

    test('turning Extension off skips the userscript', async ({ page }) => {
        await openArchetype(page, 'dashboard');
        await page.locator('[data-harness-extension]').click();
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('[data-harness-extension]')).toHaveAttribute('aria-pressed', 'false');
        const state = await page.evaluate(() => window.__FLEET_UX_HARNESS_STATE__);
        expect(state).toBeFalsy();

        const gear = page.locator('[id*="wf-settings"], [class*="wf-settings"], [data-fleet-settings]');
        await expect(gear).toHaveCount(0);

        const loaded = await page.evaluate(() =>
            Array.from(document.scripts).some((s) => /fleet\.user\.js/.test(s.src))
        );
        expect(loaded).toBe(false);
    });

    test('turning Extension back on loads the userscript again', async ({ page }) => {
        await openArchetype(page, 'dashboard');
        await page.locator('[data-harness-extension]').click();
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('[data-harness-extension]')).toHaveAttribute('aria-pressed', 'false');

        await page.locator('[data-harness-extension]').click();
        const state = await waitForExtension(page);
        expect(state.ready).toBe(true);
        const gear = page.locator('[id*="wf-settings"], [class*="wf-settings"], [data-fleet-settings]');
        await expect(gear.first()).toBeAttached();
    });
});
