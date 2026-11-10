# Calm — production image. SQLite lives on the /data volume; secrets come from the runtime env.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 CALM_DB_PATH=/data/calm.db NEXT_TELEMETRY_DISABLED=1
# tsx is kept (dev dependency) because the push:sweep and maintenance scripts run with it.
COPY --from=build /app ./
RUN useradd --system --uid 10001 calm && mkdir -p /data && chown calm:calm /data
USER calm
VOLUME ["/data"]
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
