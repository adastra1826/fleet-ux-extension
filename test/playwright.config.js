'use strict';

const { defineConfig, devices } = require('@playwright/test');

/**
 * Points at whichever harness is running: the Compose service when HARNESS_BASE_URL is set,
 * otherwise a local server this config starts itself.
 */
const externalBaseUrl = process.env.HARNESS_BASE_URL;
const localPort = Number(process.env.HARNESS_PORT || 8787);
const baseURL = externalBaseUrl || `http://127.0.0.1:${localPort}`;

module.exports = defineConfig({
    testDir: './e2e',
    // Plugins load over HTTP and attach on mutation, so first paint is not the finish line.
    timeout: 45000,
    expect: { timeout: 10000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
    use: {
        baseURL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    webServer: externalBaseUrl
        ? undefined
        : {
            command: 'node harness/server/index.js',
            cwd: __dirname,
            url: `${baseURL}/__harness/health`,
            reuseExistingServer: !process.env.CI,
            timeout: 30000,
            env: { HARNESS_PORT: String(localPort), HARNESS_HOST: '127.0.0.1' }
        },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
    ]
});
