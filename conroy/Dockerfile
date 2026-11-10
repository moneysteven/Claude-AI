# Conroy production image: one image runs the web app, the worker and migrations.
# Build:  docker compose build      (see DEPLOY_HOSTINGER.md)

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
# openssl: needed by Prisma's query engine. (Signals/zombies: compose runs every service with `init: true`.)
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- dependencies (cached unless package files or the schema change)
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- build, then drop dev-only packages
FROM deps AS build
COPY . .
RUN npx prisma generate \
  && npx next build \
  && npm prune --omit=dev --no-audit --no-fund \
  && npm cache clean --force

# ---- runtime: no compilers, no dev tools, non-root user
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts ./scripts
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
