'use strict';

const { test, expect } = require('@playwright/test');
const { openArchetype } = require('./helpers');

function gmFetchText(page, url) {
    return page.evaluate(
        (target) => new Promise((resolve, reject) => {
            window.GM_xmlhttpRequest({
                method: 'GET',
                url: target,
                onload(response) {
                    if (response.status === 200) resolve(response.responseText);
                    else reject(new Error('HTTP ' + response.status + ' for ' + target));
                },
                onerror(error) {
                    reject(error || new Error('network error for ' + target));
                }
            });
        }),
        url
    );
}

test.describe('packaged jsDelivr dependencies', () => {
    test('the vendor catalog lists every packaged asset', async ({ request }) => {
        const body = await (await request.get('/__harness/vendor')).json();
        expect(body.assets.length).toBeGreaterThanOrEqual(6);
        expect(body.assets.every((asset) => asset.packaged === true)).toBe(true);
        expect(body.assets.map((asset) => asset.id)).toEqual(expect.arrayContaining([
            'chart.js',
            'deep-chat',
            'highlight.js'
        ]));
    });

    test('each catalog path serves the file', async ({ request }) => {
        const body = await (await request.get('/__harness/vendor')).json();
        for (const asset of body.assets) {
            const response = await request.get(asset.path);
            expect(response.status(), asset.id).toBe(200);
            const text = await response.text();
            expect(text.length, asset.id).toBeGreaterThan(32);
        }
    });

    test('Chart.js loads through the same GM path the plugin uses', async ({ page }) => {
        await openArchetype(page, 'dashboard');
        const source = await gmFetchText(
            page,
            'https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js'
        );
        const hasChart = await page.evaluate((chartJs) => {
            const Chart = new Function(chartJs + '\nreturn typeof Chart !== "undefined" ? Chart : null;')();
            return typeof Chart === 'function';
        }, source);
        expect(hasChart).toBe(true);
    });

    test('highlight.js loads through the same GM path the plugin uses', async ({ page }) => {
        await openArchetype(page, 'dashboard');
        const core = await gmFetchText(
            page,
            'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js'
        );
        const python = await gmFetchText(
            page,
            'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/languages/python.min.js'
        );
        const hasHljs = await page.evaluate(
            ({ coreJs, pythonJs }) => {
                const hljs = new Function(
                    coreJs + '\n' + pythonJs + '\nreturn typeof hljs !== "undefined" ? hljs : null;'
                )();
                return Boolean(hljs && typeof hljs.highlight === 'function');
            },
            { coreJs: core, pythonJs: python }
        );
        expect(hasHljs).toBe(true);
    });

    test('Deep Chat loads through the same GM path the plugin uses', async ({ page }) => {
        await openArchetype(page, 'dashboard');
        const source = await gmFetchText(
            page,
            'https://cdn.jsdelivr.net/npm/deep-chat@2.4.2/dist/deepChat.bundle.js'
        );
        expect(source).toContain('customElements.define("deep-chat"');
    });
});
