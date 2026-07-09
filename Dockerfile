# Recon: watcher (long-running poller) + dashboard (Next.js), sharing one
# SQLite file over a Railway volume mounted at /data. Both processes run in
# this single container so they can see the same file — see start.sh.

FROM node:22-bookworm-slim AS watcher-deps
WORKDIR /app/watcher
COPY watcher/package.json watcher/package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS dashboard-build
WORKDIR /app/dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/ .
# SESSION_SECRET is only read at request time by API routes (all declared
# force-dynamic), but Next's build-time page data collection still imports
# the module graph, so the check in lib/auth-session.ts must pass at build.
ARG SESSION_SECRET=build-time-placeholder-secret-32-chars-min
ENV SESSION_SECRET=$SESSION_SECRET
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not
# read at runtime — they must be passed as build args here, not just set as
# regular Railway service variables, or the client ships with empty values.
ARG NEXT_PUBLIC_CHAIN_ID
ARG NEXT_PUBLIC_RPC_URL
ARG NEXT_PUBLIC_EXPLORER_URL
ARG NEXT_PUBLIC_INVOICE_REGISTRY
ARG NEXT_PUBLIC_TOKENS
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL
ENV NEXT_PUBLIC_EXPLORER_URL=$NEXT_PUBLIC_EXPLORER_URL
ENV NEXT_PUBLIC_INVOICE_REGISTRY=$NEXT_PUBLIC_INVOICE_REGISTRY
ENV NEXT_PUBLIC_TOKENS=$NEXT_PUBLIC_TOKENS
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_OPTIONS="--experimental-sqlite --no-warnings=ExperimentalWarning"

COPY --from=watcher-deps /app/watcher/node_modules /app/watcher/node_modules
COPY watcher /app/watcher

COPY --from=dashboard-build /app/dashboard/node_modules /app/dashboard/node_modules
COPY --from=dashboard-build /app/dashboard/.next /app/dashboard/.next
COPY dashboard/package.json dashboard/next.config.mjs /app/dashboard/

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 3000
CMD ["/app/start.sh"]
