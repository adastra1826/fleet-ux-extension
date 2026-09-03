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

test.describe('Normal / Dev toggle', () => {
    test('defaults to Normal and does not load core dev plugins', async ({ page }) => {
        const state = await openArchetype(page, 'dashboard');
        const toggle = page.locator('[data-harness-branch]');
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await expect(toggle).toHaveText('Normal');
        expect(state.isDevBranch).not.toBe(true);
        expect(state.plugins).not.toContain('dev-logger-panel');
    });

    test('Dev persists across reload and loads a core dev plugin', async ({ page }) => {
        await openArchetype(page, 'dashboard');
        await page.locator('[data-harness-branch]').click();
        const state = await waitForExtension(page);
        await expect(page.locator('[data-harness-branch]')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('[data-harness-branch]')).toHaveText('Dev');
        expect(state.isDevBranch).toBe(true);
        expect(state.plugins).toContain('dev-logger-panel');

        await page.reload();
        const again = await waitForExtension(page);
        await expect(page.locator('[data-harness-branch]')).toHaveText('Dev');
        expect(again.plugins).toContain('dev-logger-panel');

        await page.locator('#wf-settings-btn').click({ force: true });
        await expect(page.locator('#wf-settings-modal')).toBeVisible();
        const devTab = page.locator('#wf-settings-modal button[data-tab="dev"]');
        await expect(devTab).toBeAttached();
        await devTab.click();
        await expect(page.locator('#wf-settings-modal')).toContainText('Dev Plugins');
    });
});
