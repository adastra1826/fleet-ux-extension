(function () {
    'use strict';

    /**
     * Stands in for Tampermonkey so fleet.user.js can be loaded with a plain script tag.
     *
     * Two jobs:
     *   1. GM_* storage and request APIs, backed by localStorage and fetch.
     *   2. A request rewriter that maps the production hosts the extension talks to onto
     *      harness routes on this origin. Plugins keep their real URLs; nothing leaves the
     *      container, and no DNS or TLS setup is needed.
     *
     * Loaded before fleet.user.js, so the extension's own fetch hook wraps this one and
     * still observes the original (pre-rewrite) URLs.
     */

    const ORIGIN = window.location.origin;
    const GM_PREFIX = 'harness-gm:';

    window.__FLEET_UX_HARNESS__ = true;

    // ---------------------------------------------------------------- request rewriting

    const SUPABASE_HOST_RE = /^[a-z0-9-]+\.supabase\.co$/i;

    /** @returns {string|null} harness URL, or null when the request should pass through. */
    function rewriteUrl(rawUrl) {
        let url;
        try {
            url = new URL(rawUrl, window.location.href);
        } catch (_e) {
            return null;
        }
        if (url.origin === ORIGIN) return null;

        const host = url.hostname;

        if (host === 'cdn.jsdelivr.net') {
            // npm packages and third-party /gh/ releases are packaged under /__harness/vendor.
            // This repo's /gh/<owner>/<repo>@<ref>/<path> still maps onto the local CDN.
            if (url.pathname.startsWith('/npm/') || url.pathname.startsWith('/gh/highlightjs/')) {
                return `${ORIGIN}/__harness/vendor${url.pathname}${url.search}`;
            }
            const parts = url.pathname.replace(/^\/+/, '').split('/');
            return `${ORIGIN}/__harness/cdn/${parts.slice(3).join('/')}${url.search}`;
        }

        if (host === 'raw.githubusercontent.com') {
            const parts = url.pathname.replace(/^\/+/, '').split('/');
            return `${ORIGIN}/__harness/cdn/${parts.slice(3).join('/')}${url.search}`;
        }

        if (SUPABASE_HOST_RE.test(host)) {
            return `${ORIGIN}/__harness${url.pathname}${url.search}`;
        }

        if (host === 'orchestrator.fleetai.com') {
            return `${ORIGIN}/__harness/orchestrator${url.pathname}${url.search}`;
        }

        if (host === 'api.internal.fleet-platform.fleetai.com') {
            return `${ORIGIN}/__harness/internal${url.pathname}${url.search}`;
        }

        if (host === 'www.fleetai.com' || host === 'fleetai.com') {
            return `${ORIGIN}${url.pathname}${url.search}`;
        }

        if (host === 'openrouter.ai') {
            return `${ORIGIN}/__harness/openrouter${url.pathname}${url.search}`;
        }

        return null;
    }

    const nativeFetch = window.fetch.bind(window);

    window.fetch = function harnessFetch(resource, config) {
        try {
            if (typeof resource === 'string') {
                const next = rewriteUrl(resource);
                if (next) return nativeFetch(next, config);
            } else if (resource && typeof resource.url === 'string') {
                const next = rewriteUrl(resource.url);
                if (next) {
                    const clone = new Request(next, resource);
                    return nativeFetch(clone, config);
                }
            }
        } catch (_e) { /* fall through to the original request */ }
        return nativeFetch(resource, config);
    };

    const nativeXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function harnessXhrOpen(method, url, ...rest) {
        const next = typeof url === 'string' ? rewriteUrl(url) : null;
        return nativeXhrOpen.call(this, method, next || url, ...rest);
    };

    // ------------------------------------------------------------------- GM_* storage

    function storageKey(key) {
        return GM_PREFIX + key;
    }

    window.GM_getValue = function GM_getValue(key, fallback) {
        try {
            const raw = window.localStorage.getItem(storageKey(key));
            if (raw === null) return fallback;
            return JSON.parse(raw);
        } catch (_e) {
            return fallback;
        }
    };

    window.GM_setValue = function GM_setValue(key, value) {
        try {
            window.localStorage.setItem(storageKey(key), JSON.stringify(value));
        } catch (_e) { /* quota or serialization failure: treat as a no-op */ }
    };

    window.GM_deleteValue = function GM_deleteValue(key) {
        try {
            window.localStorage.removeItem(storageKey(key));
        } catch (_e) { /* ignore */ }
    };

    window.GM_listValues = function GM_listValues() {
        const out = [];
        try {
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i);
                if (key && key.startsWith(GM_PREFIX)) out.push(key.slice(GM_PREFIX.length));
            }
        } catch (_e) { /* ignore */ }
        return out;
    };

    window.GM_openInTab = function GM_openInTab(url, options) {
        const active = !(options && options.active === false);
        return window.open(url, '_blank', active ? '' : 'noopener');
    };

    /** Minimal GM_xmlhttpRequest over fetch (only the fields the extension reads). */
    window.GM_xmlhttpRequest = function GM_xmlhttpRequest(details) {
        const method = (details.method || 'GET').toUpperCase();
        const controller = new AbortController();
        const target = rewriteUrl(details.url) || details.url;

        window.fetch(target, {
            method,
            headers: details.headers || undefined,
            body: details.data || undefined,
            signal: controller.signal,
            credentials: 'include'
        })
            .then((response) => response.text().then((text) => ({ response, text })))
            .then(({ response, text }) => {
                if (typeof details.onload === 'function') {
                    details.onload({
                        status: response.status,
                        statusText: response.statusText,
                        responseText: text,
                        finalUrl: response.url,
                        responseHeaders: Array.from(response.headers.entries())
                            .map(([k, v]) => `${k}: ${v}`)
                            .join('\r\n')
                    });
                }
            })
            .catch((error) => {
                if (error && error.name === 'AbortError') {
                    if (typeof details.ontimeout === 'function') details.ontimeout();
                    return;
                }
                if (typeof details.onerror === 'function') {
                    details.onerror({ error: String(error && error.message || error), status: 0 });
                }
            });

        if (Number.isFinite(details.timeout)) {
            setTimeout(() => controller.abort(), details.timeout);
        }

        return { abort: () => controller.abort() };
    };

    window.unsafeWindow = window;
})();
