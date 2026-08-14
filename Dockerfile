FROM node:22-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates coreutils curl util-linux xz-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ARG NEXT_PUBLIC_BASE_PATH=/fornost-grc
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
RUN npm run build

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates coreutils curl util-linux \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ARG NEXT_PUBLIC_BASE_PATH=/fornost-grc
ENV NODE_ENV=production \
    NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH} \
    HOST=0.0.0.0 \
    PORT=3000 \
    FORNOST_DEMO_MODE=false

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/package.json ./package.json

RUN mkdir -p /app/.sites-runtime/data /app/.sites-runtime/home /app/.sites-runtime/tmp \
  && chown -R node:node /app/.sites-runtime

USER node
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=5 \
  CMD curl --fail --silent "http://127.0.0.1:3000${NEXT_PUBLIC_BASE_PATH}/api/auth" >/dev/null || exit 1

CMD ["bash", "scripts/linux/serve.sh"]
