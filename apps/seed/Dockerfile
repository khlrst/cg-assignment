FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.node.json ./

COPY apps/seed/package.json apps/seed/
COPY packages/db/package.json packages/db/
COPY packages/evm/package.json packages/evm/

RUN pnpm install --frozen-lockfile

COPY apps/seed apps/seed
COPY packages/db packages/db
COPY packages/evm packages/evm

RUN pnpm --filter seed... build
RUN pnpm deploy --filter seed --prod /prod

FROM node:24-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

RUN addgroup -S seed && adduser -S seed -G seed

COPY --from=build --chown=seed:seed /prod/node_modules ./node_modules

COPY --from=build --chown=seed:seed /app/apps/seed/dist/index.js ./index.js

USER seed

CMD ["node", "index.js"]
