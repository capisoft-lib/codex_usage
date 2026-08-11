FROM node:22-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4317 \
    CODEX_HOME=/codex-data \
    SNAPSHOT_PATH=/app-cache/usage-snapshot.json \
    REFRESH_INTERVAL_MS=15000

WORKDIR /app

COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src

RUN mkdir -p /app-cache && chown node:node /app-cache

USER node
EXPOSE 4317

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4317/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
