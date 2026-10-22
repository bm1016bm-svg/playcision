FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run check && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=4174 BETA_DATA_DIR=/data
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/scripts/start-beta.mjs ./scripts/start-beta.mjs
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4174
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4174/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-beta.mjs"]
