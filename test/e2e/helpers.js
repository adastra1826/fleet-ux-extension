'use strict';

/** Shared helpers for the harness suite. Add a new spec file rather than growing this one. */

const { ARCHETYPES, archetypeHref } = require('../harness/client/archetype-map');

/** Fetch the persona roster, grouped by the role each spec needs. */
async function personas(request) {
    const response = await request.get('/__harness/personas');
    const body = await response.json();
    const all = body.personas;
    return {
        all,
        writer: all.find((p) => !p.isQa),
        qaOnly: all.find((p) => p.isQa && !p.isResolver),
        resolver: all.find((p) => p.isResolver)
    };
}

/** Act as a given persona for the rest of the browser context. */
async function actAs(context, persona, baseURL) {
    const url = new URL(baseURL);
    const cookie = (name, value) => ({
        name,
        value,
        domain: url.hostname,
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax'
    });
    await context.addCookies([
        cookie('current-user-id', persona.id),
        cookie('current-team-id', persona.teamId),
        cookie('current-team-role', persona.teamRole)
    ]);
}

/**
 * Wait until the extension has finished its per-page initialization. The host publishes
 * this only in harness mode.
 */
async function waitForExtension(page) {
    await page.waitForFunction(
        () => window.__FLEET_UX_HARNESS_STATE__ && window.__FLEET_UX_HARNESS_STATE__.ready === true,
        null,
        { timeout: 30000 }
    );
    return page.evaluate(() => window.__FLEET_UX_HARNESS_STATE__);
}

/** Open an archetype page and wait for the extension to settle. */
async function openArchetype(page, archetypeId) {
    const archetype = ARCHETYPES.find((a) => a.id === archetypeId);
    if (!archetype) throw new Error(`unknown archetype: ${archetypeId}`);
    await page.goto(archetypeHref(archetype));
    return waitForExtension(page);
}

/** Capture console errors so attach smokes can assert the page stayed clean. */
function collectConsoleErrors(page) {
    const errors = [];
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error && error.message || error)));
    return errors;
}

module.exports = {
    ARCHETYPES,
    archetypeHref,
    personas,
    actAs,
    waitForExtension,
    openArchetype,
    collectConsoleErrors
};
