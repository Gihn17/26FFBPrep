FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000

CMD ["node", "server/index.js"]
