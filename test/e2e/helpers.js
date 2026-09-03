'use strict';

/** Shared helpers for the harness suite. Add a new spec file rather than growing this one. */

const { expect } = require('@playwright/test');
const { ARCHETYPES, archetypeHref } = require('../harness/client/archetype-map');
const {
    ATTACH_CONTRACTS,
    rawCheckPasses,
    describeCheck,
    scopesFor
} = require('../harness/client/attach-contracts');

const RAW_CHECK_SRC = `${scopesFor.toString()}\n${rawCheckPasses.toString()}\nreturn rawCheckPasses(document, check);`;

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
async function openArchetype(page, archetypeId, options) {
    const archetype = ARCHETYPES.find((a) => a.id === archetypeId);
    if (!archetype) throw new Error(`unknown archetype: ${archetypeId}`);
    await page.goto(archetypeHref(archetype));
    if (options && options.wait === false) {
        await page.waitForLoadState('domcontentloaded');
        return null;
    }
    return waitForExtension(page);
}

function harnessCookieUrl(baseURL) {
    return new URL(baseURL).origin + '/';
}

/** Set harness bar cookies before the first navigation. */
async function setHarnessCookies(page, baseURL, flags) {
    const url = harnessCookieUrl(baseURL);
    const cookies = [];
    if (flags && flags.extension === false) {
        cookies.push({ name: 'fleet-ux-extension', value: '0', url });
    }
    if (flags && flags.extension === true) {
        cookies.push({ name: 'fleet-ux-extension', value: '1', url });
    }
    if (flags && flags.dev === true) {
        cookies.push({ name: 'fleet-ux-dev', value: '1', url });
    }
    if (flags && flags.dev === false) {
        cookies.push({ name: 'fleet-ux-dev', value: '0', url });
    }
    if (cookies.length) await page.context().addCookies(cookies);
}

async function assertRawContract(page, archetypeId) {
    const contract = ATTACH_CONTRACTS[archetypeId];
    if (!contract) throw new Error(`no attach contract for ${archetypeId}`);
    const failures = [];
    for (const check of contract.raw) {
        const ok = await page.evaluate(({ check: c, src }) => new Function('check', src)(c), {
            check,
            src: RAW_CHECK_SRC
        });
        if (!ok) failures.push(describeCheck(check));
    }
    expect(failures, `${archetypeId}: ${failures.join('; ')}`).toEqual([]);
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
    ATTACH_CONTRACTS,
    personas,
    actAs,
    waitForExtension,
    openArchetype,
    setHarnessCookies,
    assertRawContract,
    collectConsoleErrors
};
