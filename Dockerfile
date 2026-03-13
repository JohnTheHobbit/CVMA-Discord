# Build stage
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

# Production stage
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/dist/ ./dist/

RUN mkdir -p /app/logs && chown node:node /app/logs
RUN mkdir -p /app/data && chown node:node /app/data

USER node

CMD ["node", "dist/index.js"]
