FROM node:22-alpine AS base
WORKDIR /app

RUN corepack enable

COPY . .

RUN pnpm install --no-frozen-lockfile

RUN pnpm --filter @workspace/api-server build

ENV NODE_ENV=production

CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
