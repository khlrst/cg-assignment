FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.node.json ./

COPY apps/indexer/package.json apps/indexer/
COPY packages/db/package.json packages/db/
COPY packages/evm/package.json packages/evm/
COPY packages/logger/package.json packages/logger/

RUN pnpm install --frozen-lockfile

COPY apps/indexer apps/indexer
COPY packages/db packages/db
COPY packages/evm packages/evm
COPY packages/logger packages/logger

RUN pnpm --filter indexer... build
RUN pnpm deploy --filter indexer --prod /prod


FROM node:24-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

RUN addgroup -S indexer \
    && adduser -S indexer -G indexer \
    && mkdir -p /app/logs /app/state \
    && chown -R indexer:indexer /app

COPY --from=build --chown=indexer:indexer /prod/node_modules ./node_modules
COPY --from=build --chown=indexer:indexer /app/apps/indexer/dist/index.js ./index.js

USER indexer

HEALTHCHECK --interval=30s \
    --timeout=3s \
    --start-period=5s \
    --retries=3 \
    CMD node --check index.js

CMD ["node", "index.js"]
