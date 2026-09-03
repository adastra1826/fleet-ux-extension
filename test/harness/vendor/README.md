# Packaged extension dependencies

The userscript lazy-loads a few files from jsDelivr (`chart.js`, `deep-chat`,
`highlight.js`). The harness serves those same bytes from this folder so nothing
leaves the container.

Files are stored with flat names so local `dist/` / `build/` ignore rules do not
hide them. `test/harness/server/vendor.js` maps each production URL onto a file
here. After adding an entry:

```bash
node test/harness/vendor/fetch.js
```
