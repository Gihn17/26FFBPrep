FROM node:22-alpine AS builder
WORKDIR /app

# better-sqlite3 has no prebuilt musl (Alpine) binary — it compiles from
# source via node-gyp, which needs a real C++ toolchain.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build
RUN npm prune --production

FROM node:22-alpine
WORKDIR /app

# `ant` CLI — resolves the mounted isolated auth profile
# (fantasy-gm-container, see docker-compose.yml) into a short-lived
# access token for server/chat.js. Statically-linked Go binary, no
# musl/glibc concerns on Alpine.
ARG ANT_VERSION=1.26.1
RUN apk add --no-cache curl && \
    curl -fsSL "https://github.com/anthropics/anthropic-cli/releases/download/v${ANT_VERSION}/ant_${ANT_VERSION}_linux_amd64.tar.gz" \
      | tar -xz -C /usr/local/bin ant && \
    chmod +x /usr/local/bin/ant && \
    apk del curl

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000

CMD ["node", "server/index.js"]
