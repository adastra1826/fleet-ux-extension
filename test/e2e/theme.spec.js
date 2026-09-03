'use strict';

const { test, expect } = require('@playwright/test');
const { openArchetype, waitForExtension } = require('./helpers');

/**
 * Theme coverage. The harness exposes the host design tokens, so injected chrome can be
 * checked against real values instead of hard-coded hex strings.
 */

function tokenValue(page, name) {
    return page.evaluate(
        (token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(),
        name
    );
}

test.describe('host theme tokens', () => {
    test('light tokens resolve on the page', async ({ page, request }) => {
        const tokens = await (await request.get('/__harness/theme.json')).json();
        await openArchetype(page, 'dashboard');

        for (const name of ['--background', '--foreground', '--card', '--border', '--brand', '--muted-foreground']) {
            expect(await tokenValue(page, name), `${name} missing`).toBe(tokens.light[name]);
        }
    });

    test('adding the dark class flips the tokens', async ({ page, request }) => {
        const tokens = await (await request.get('/__harness/theme.json')).json();
        await openArchetype(page, 'dashboard');

        await page.evaluate(() => document.documentElement.classList.add('dark'));
        expect(await tokenValue(page, '--background')).toBe(tokens.dark['--background']);
        expect(await tokenValue(page, '--foreground')).toBe(tokens.dark['--foreground']);
        // Brand stays constant across modes on the real site.
        expect(await tokenValue(page, '--brand')).toBe(tokens.light['--brand']);
    });

    test('the theme toggle writes the class and persists the choice', async ({ page }) => {
        await openArchetype(page, 'dashboard');
        const toggle = page.locator('[data-harness-theme]');

        await expect(toggle).toHaveText('Light');
        await toggle.click();
        await expect(toggle).toHaveText('Dark');
        await expect(page.locator('html')).toHaveClass(/dark/);
        expect(await page.evaluate(() => window.localStorage.getItem('theme'))).toBe('dark');

        // The class must already be set on the next page load, before first paint.
        await page.reload();
        await waitForExtension(page);
        await expect(page.locator('html')).toHaveClass(/dark/);

        await page.locator('[data-harness-theme]').click();
        await expect(page.locator('html')).not.toHaveClass(/dark/);
    });
});

test.describe('injected chrome follows the site theme', () => {
    test('extension surfaces resolve against the host tokens in both modes', async ({ page }) => {
        await openArchetype(page, 'qa-tool-use');

        // ui-lib registers the shared chrome; its stylesheet must be on the page.
        const hasExtensionStyles = await page.evaluate(() =>
            Array.from(document.styleSheets).some((sheet) => {
                try {
                    return Array.from(sheet.cssRules || []).some((rule) =>
                        String(rule.cssText || '').includes('wf-dash-btn') ||
                        String(rule.cssText || '').includes('fleet-ui-')
                    );
                } catch (_e) {
                    return false;
                }
            })
        );
        expect(hasExtensionStyles).toBe(true);

        const readBackground = () =>
            page.evaluate(() => getComputedStyle(document.body).backgroundColor);

        const light = await readBackground();
        await page.evaluate(() => document.documentElement.classList.add('dark'));
        const dark = await readBackground();
        expect(dark).not.toBe(light);
    });

    test('the preferred-mode attribute the extension owns does not fight the site class', async ({ page }) => {
        await openArchetype(page, 'dashboard');
        const attribute = await page.evaluate(() =>
            document.documentElement.getAttribute('data-fleet-ux-theme')
        );
        // Either unset (match site) or one of the two explicit modes.
        expect([null, 'light', 'dark', 'match']).toContain(attribute);
    });
});
