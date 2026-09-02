# syntax=docker/dockerfile:1.7

FROM node:24.18.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @bookseasoning/contracts build \
  && pnpm --filter @bookseasoning/domain build \
  && pnpm --filter @bookseasoning/server build
RUN pnpm --filter @bookseasoning/server deploy --prod --legacy /output/server

FROM node:24.18.0-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /output/server ./

USER node
EXPOSE 3000

# Lightsail runs this command for the public container and overrides it with
# `node dist/worker/main.js` for the non-public worker container.
CMD ["node", "dist/api/main.js"]
