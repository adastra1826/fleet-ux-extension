(function () {
    'use strict';

    /**
     * Harness-only page chrome: the archetype tab strip, the persona picker, the site
     * theme toggle, and the extension on/off switch. Everything here is marked
     * `data-fleet-harness="1"` so it reads as harness furniture rather than Fleet page content.
     */

    const config = window.__HARNESS_CONFIG__ || {};
    const bar = document.querySelector('[data-fleet-harness="1"]');
    if (!bar) return;

    function setCookie(name, value) {
        document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=86400`;
    }

    // ------------------------------------------------------------------ persona picker

    const personaSelect = bar.querySelector('[data-harness-persona]');
    if (personaSelect) {
        personaSelect.addEventListener('change', () => {
            const persona = config.personas.find((p) => p.id === personaSelect.value);
            if (!persona) return;
            setCookie('current-user-id', persona.id);
            setCookie('current-team-id', persona.teamId);
            setCookie('current-team-role', persona.teamRole);
            window.location.reload();
        });
    }

    // ------------------------------------------------------------------- theme toggle

    const themeButton = bar.querySelector('[data-harness-theme]');

    function applyTheme(mode) {
        const dark = mode === 'dark';
        document.documentElement.classList.toggle('dark', dark);
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
        try {
            window.localStorage.setItem('theme', mode);
        } catch (_e) { /* ignore */ }
        if (themeButton) {
            themeButton.textContent = dark ? 'Dark' : 'Light';
            themeButton.setAttribute('aria-pressed', dark ? 'true' : 'false');
        }
    }

    let storedTheme = 'light';
    try {
        storedTheme = window.localStorage.getItem('theme') || 'light';
    } catch (_e) { /* ignore */ }
    applyTheme(storedTheme === 'dark' ? 'dark' : 'light');

    if (themeButton) {
        themeButton.addEventListener('click', () => {
            applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
        });
    }

    // -------------------------------------------------------------- extension toggle

    const extensionButton = bar.querySelector('[data-harness-extension]');
    if (extensionButton) {
        extensionButton.addEventListener('click', () => {
            const on = extensionButton.getAttribute('aria-pressed') === 'true';
            setCookie('fleet-ux-extension', on ? '0' : '1');
            window.location.reload();
        });
    }

    // -------------------------------------------------------------- seeded session data

    /**
     * Seed the Supabase-shaped session the extension expects. On the real site this comes
     * from page storage written by the Fleet app; here the harness provides it directly so
     * PostgREST-backed panes work without a live login.
     *
     * Runtime access values live in script storage, which the GM polyfill keeps under
     * `harness-gm:` + the host's own `wf-enhancer-data:` prefix.
     */
    const SCRIPT_DATA_PREFIX = 'harness-gm:wf-enhancer-data:';

    function setScriptData(logicalKey, value) {
        try {
            window.localStorage.setItem(SCRIPT_DATA_PREFIX + logicalKey, JSON.stringify(value));
        } catch (_e) { /* ignore */ }
    }

    try {
        const session = config.session || {};
        if (session.storageKey && session.accessToken) {
            window.localStorage.setItem(
                session.storageKey,
                JSON.stringify({
                    access_token: session.accessToken,
                    token_type: 'bearer',
                    user: { id: config.persona && config.persona.id }
                })
            );
        }
        if (session.restBaseUrl) {
            setScriptData('fleet-ux:supabase-rest-base-url', session.restBaseUrl);
            setScriptData('fleet-ux:supabase-anon-key', session.anonKey);
            setScriptData('fleet-ux:supabase-project-ref', session.projectRef);
            setScriptData('fleet-ux:supabase-access-token', session.accessToken);
        }
        if (config.persona && config.persona.id) {
            setScriptData('fleet-ux:ops-current-user-id', config.persona.id);
        }
    } catch (_e) { /* ignore */ }

    // ------------------------------------------------------------------ hydration pass

    /**
     * Emulate the client-side rendering churn of the real Fleet app.
     *
     * This is not cosmetic. Archetype disambiguation and several plugins are driven by
     * MutationObserver and only settle after a fixed number of DOM changes — on the live
     * site a React app supplies those continuously. A fully static shell supplies none, so
     * those code paths would stall here in a way they never do in production.
     *
     * The pass stops as soon as the extension reports it finished initializing, and has a
     * hard cap so it can never run indefinitely if the extension fails to load.
     */
    const HYDRATION_INTERVAL_MS = 40;
    const HYDRATION_MAX_STEPS = 120;

    function hydrate() {
        const root = document.querySelector('main') || document.body;
        const host = document.createElement('div');
        host.setAttribute('data-harness-hydration', '0');
        host.style.display = 'none';
        root.appendChild(host);

        let step = 0;
        const timer = window.setInterval(() => {
            step++;
            host.setAttribute('data-harness-hydration', String(step));
            // Watchers in the extension subscribe to childList, so the churn has to add and
            // remove nodes — attribute changes alone would go unnoticed.
            host.textContent = '';
            host.appendChild(document.createTextNode(String(step)));

            const state = window.__FLEET_UX_HARNESS_STATE__;
            const settled = !!(state && state.ready) || step >= HYDRATION_MAX_STEPS;
            if (settled) {
                window.clearInterval(timer);
                root.setAttribute('data-harness-hydrated', '1');
            }
        }, HYDRATION_INTERVAL_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hydrate, { once: true });
    } else {
        hydrate();
    }

    window.__HARNESS_READY__ = true;
})();
