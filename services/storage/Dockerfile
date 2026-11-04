FROM node:24-bookworm-slim

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tar \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

COPY . .
RUN pnpm install --frozen-lockfile
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/storage_db
RUN pnpm --filter @event-sharing/storage... build

RUN mkdir -p /data/files /data/backups && chown -R node:node /data
USER node
WORKDIR /app/services/storage
EXPOSE 8009
CMD ["node", "dist/index.js"]
