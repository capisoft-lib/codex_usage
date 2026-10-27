FROM node:22.23.4-alpine3.24@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS ui-build

WORKDIR /build
COPY public ./public
COPY scripts ./scripts
COPY src/cli-locale.mjs ./src/cli-locale.mjs
RUN node scripts/build-dashboard-ui.mjs

FROM node:22.23.4-alpine3.24@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS runtime

# The runtime uses Node.js directly and has no npm dependencies. Remove the
# bundled package managers so their unused dependency trees are not shipped.
RUN apk upgrade --no-cache \
    && apk add --no-cache 'musl>=1.2.6-r3' 'musl-utils>=1.2.6-r3' \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg

LABEL org.opencontainers.image.source="https://github.com/capisoft-lib/codex_usage" \
      org.opencontainers.image.documentation="https://github.com/capisoft-lib/codex_usage#readme" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.title="Local Usage Dashboard for Codex" \
      org.opencontainers.image.description="Independent local dashboard for Codex usage, token activity, and cost estimates" \
      org.opencontainers.image.version="1.7.1"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4317 \
    CODEX_SOURCE_MODE=scoped \
    CODEX_SESSIONS_PATH=/codex-data/sessions \
    CODEX_ARCHIVED_SESSIONS_PATH=/codex-data/archived_sessions \
    CODEX_SESSION_INDEX_PATH=/codex-data/session_index.jsonl \
    SNAPSHOT_PATH=/app-cache/usage-snapshot.json \
    REFRESH_INTERVAL_MS=60000

WORKDIR /app

COPY --chown=node:node package.json agent.mjs LICENSE ./
COPY --chown=node:node src ./src
COPY --chown=node:node sites-hub/drizzle ./sites-hub/drizzle
# Both entrypoints import shared modules from the source layout. Keep the full
# module set so headless agents do not lose transitive imports as features grow.
COPY --from=ui-build --chown=node:node /build/dist/dashboard/*.js ./public/

RUN mkdir -p /app-cache /codex-data/sessions /codex-data/archived_sessions \
    && touch /codex-data/session_index.jsonl \
    && chown -R node:node /app-cache /codex-data

USER node

FROM runtime AS agent

HEALTHCHECK NONE
CMD ["node", "agent.mjs"]

FROM runtime AS dashboard

COPY --chown=node:node server.mjs ./
COPY --from=ui-build --chown=node:node /build/dist/dashboard ./dist/dashboard

EXPOSE 4317

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4317/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
