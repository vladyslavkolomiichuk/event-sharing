FROM node:22-bookworm-slim

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tar \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

COPY . .
RUN pnpm install --frozen-lockfile

# Prisma reads service settings while generating clients.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
  AUTH_JWT_ISSUER=http://localhost \
  AUTH_JWT_AUDIENCE=build \
  KAFKA_BROKERS=localhost:9092 \
  BETTER_AUTH_SECRET=build-secret-build-secret-build-secret \
  BETTER_AUTH_URL=http://localhost \
  BETTER_AUTH_PUBLIC_URL=http://localhost \
  FRONTEND_ORIGIN=http://localhost \
  STORAGE_PATH=/data/files \
  STORAGE_BACKUP_PATH=/data/backups \
  CLAMAV_HOST=localhost \
  CLAMAV_PORT=3310 \
  PRIVACY_SERVICE_KEYS='{}' \
  SERVICE_BUS_KEYS=$(node -p "JSON.stringify(Object.fromEntries(['auth','events','participation','messages','notifications','users','storage','geo-search','event-log','gateway'].map((name) => [name, '0'.repeat(64)])))") \
  pnpm -r build

RUN mkdir -p /data/files /data/backups && chown -R node:node /data
RUN chmod 755 infra/docker
USER node
