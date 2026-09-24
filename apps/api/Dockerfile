FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable \
    && corepack prepare pnpm@11.1.3 --activate

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/evm/package.json packages/evm/
COPY packages/logger/package.json packages/logger/

RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY apps/api ./apps/api
COPY packages/db ./packages/db
COPY packages/evm ./packages/evm
COPY packages/logger ./packages/logger

RUN pnpm --filter api build

FROM node:24-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/apps/api/dist ./dist

RUN addgroup -S api \
    && adduser -S api -G api \
    && chown -R api:api /app

USER api

HEALTHCHECK --interval=30s \
    --timeout=3s \
    --start-period=5s \
    --retries=3 \
    CMD node --check dist/index.js

CMD ["node", "dist/index.js"]
