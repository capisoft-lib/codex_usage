FROM node:22-alpine

LABEL org.opencontainers.image.source="https://github.com/capisoft-lib/codex_usage" \
      org.opencontainers.image.title="Codex Usage Dashboard" \
      org.opencontainers.image.description="Private local dashboard for Codex usage, token activity, and cost estimates" \
      org.opencontainers.image.version="1.0.1"

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

COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src

RUN mkdir -p /app-cache /codex-data/sessions /codex-data/archived_sessions \
    && touch /codex-data/session_index.jsonl \
    && chown -R node:node /app-cache /codex-data

USER node
EXPOSE 4317

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4317/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
