# Local Fleet harness: fake client, fake APIs and the plugin CDN in one container.
#
# The repo is bind-mounted at /repo by docker-compose, so editing a plugin or fleet.user.js
# only needs a page reload — no rebuild.
FROM node:22-slim

ENV NODE_ENV=development \
    HARNESS_PORT=8787 \
    HARNESS_HOST=0.0.0.0

WORKDIR /repo/test

EXPOSE 8787

HEALTHCHECK --interval=5s --timeout=3s --start-period=3s --retries=6 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.HARNESS_PORT||8787)+'/__harness/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# The server itself has no runtime dependencies; Playwright runs in its own service.
CMD ["node", "harness/server/index.js"]
