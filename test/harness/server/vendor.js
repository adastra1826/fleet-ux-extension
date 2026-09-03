'use strict';

/**
 * Packaged third-party files the extension lazy-loads from jsDelivr.
 *
 * Plugins keep their production URLs. The GM polyfill rewrites those hosts onto
 * `/__harness/vendor/…`, and this module serves the matching file from disk.
 */

const fs = require('fs');
const path = require('path');

const VENDOR_ROOT = path.join(__dirname, '..', 'vendor');

const CONTENT_TYPES = {
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

/**
 * Every jsDelivr URL a plugin actually fetches.
 * `urlPath` is the pathname after the jsDelivr host (what the polyfill asks for).
 * `file` is a flat name under `test/harness/vendor/` so `dist/` / `build/` ignore rules do not hide it.
 */
const ASSETS = [
    {
        id: 'chart.js',
        version: '4.4.9',
        url: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js',
        urlPath: 'npm/chart.js@4.4.9/dist/chart.umd.min.js',
        file: 'chart.js-4.4.9.umd.min.js'
    },
    {
        id: 'deep-chat',
        version: '2.4.2',
        url: 'https://cdn.jsdelivr.net/npm/deep-chat@2.4.2/dist/deepChat.bundle.js',
        urlPath: 'npm/deep-chat@2.4.2/dist/deepChat.bundle.js',
        file: 'deep-chat-2.4.2.bundle.js'
    },
    {
        id: 'highlight.js',
        version: '11.11.1',
        url: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js',
        urlPath: 'gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js',
        file: 'highlight.js-11.11.1.min.js'
    },
    {
        id: 'highlight.js-python',
        version: '11.11.1',
        url: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/languages/python.min.js',
        urlPath: 'gh/highlightjs/cdn-release@11.11.1/build/languages/python.min.js',
        file: 'highlight.js-11.11.1.python.min.js'
    },
    {
        id: 'highlight.js-github',
        version: '11.11.1',
        url: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/github.min.css',
        urlPath: 'gh/highlightjs/cdn-release@11.11.1/build/styles/github.min.css',
        file: 'highlight.js-11.11.1.github.min.css'
    },
    {
        id: 'highlight.js-github-dark',
        version: '11.11.1',
        url: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/github-dark.min.css',
        urlPath: 'gh/highlightjs/cdn-release@11.11.1/build/styles/github-dark.min.css',
        file: 'highlight.js-11.11.1.github-dark.min.css'
    }
];

function findAsset(relative) {
    const clean = String(relative || '').split('?')[0].replace(/^\/+/, '');
    return ASSETS.find((asset) => asset.urlPath === clean || asset.file === clean) || null;
}

function serve(relative) {
    const asset = findAsset(relative);
    if (!asset) {
        return {
            status: 404,
            contentType: 'text/plain; charset=utf-8',
            body: `vendor asset not packaged: ${String(relative || '').replace(/^\/+/, '')}`
        };
    }
    const absolute = path.join(VENDOR_ROOT, asset.file);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
        return {
            status: 404,
            contentType: 'text/plain; charset=utf-8',
            body: `vendor asset missing on disk: ${asset.file}`
        };
    }
    return {
        status: 200,
        contentType: CONTENT_TYPES[path.extname(absolute)] || 'text/plain; charset=utf-8',
        body: fs.readFileSync(absolute, 'utf8')
    };
}

function manifest() {
    return {
        assets: ASSETS.map((asset) => ({
            id: asset.id,
            version: asset.version,
            url: asset.url,
            path: `/__harness/vendor/${asset.urlPath}`,
            packaged: fs.existsSync(path.join(VENDOR_ROOT, asset.file))
        }))
    };
}

module.exports = { ASSETS, VENDOR_ROOT, serve, manifest };
