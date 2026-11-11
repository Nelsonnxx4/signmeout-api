FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 10001 signmeout
COPY --from=build --chown=signmeout:signmeout /app/package.json /app/package-lock.json ./
COPY --from=build --chown=signmeout:signmeout /app/node_modules ./node_modules
COPY --from=build --chown=signmeout:signmeout /app/dist ./dist
COPY --from=build --chown=signmeout:signmeout /app/prisma ./prisma
USER signmeout
EXPOSE 5000
CMD ["node", "dist/server.js"]
