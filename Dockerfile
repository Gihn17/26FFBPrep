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

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000

CMD ["node", "server/index.js"]
