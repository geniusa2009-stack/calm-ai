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
COPY --from=build /app ./
RUN useradd --system --uid 10001 calm && mkdir -p /data && chown calm:calm /data
USER calm
VOLUME ["/data"]
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
