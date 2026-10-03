FROM node:22-trixie-slim AS build

ARG FORNOST_SOURCE_COMMIT=unknown

RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends bash ca-certificates coreutils curl util-linux xz-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ARG NEXT_PUBLIC_BASE_PATH=/fornost-grc
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund \
  && npm cache clean --force

# Prepare writable directories with the historical UID so existing volumes work.
RUN mkdir -p /app/.sites-runtime/data /app/.sites-runtime/home /app/.sites-runtime/tmp \
  && chown -R 1000:1000 /app/.sites-runtime

# No shell, curl, util-linux, package manager or build tools in production.
FROM gcr.io/distroless/nodejs22-debian13:nonroot AS runtime
ARG FORNOST_SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.title="Fornost GRC" \
      org.opencontainers.image.revision="${FORNOST_SOURCE_COMMIT}"
WORKDIR /app
ARG NEXT_PUBLIC_BASE_PATH=/fornost-grc
ENV NODE_ENV=production \
    NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH} \
    FORNOST_BUILD_REVISION=${FORNOST_SOURCE_COMMIT} \
    HOST=0.0.0.0 \
    PORT=3000 \
    FORNOST_DEMO_MODE=false
COPY --from=build --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=build --chown=1000:1000 /app/dist ./dist
COPY --from=build --chown=1000:1000 /app/scripts ./scripts
COPY --from=build --chown=1000:1000 /app/package.json ./package.json
COPY --from=build --chown=1000:1000 /app/.sites-runtime ./.sites-runtime
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=5 \
  CMD ["/nodejs/bin/node", "scripts/linux/container-health.mjs"]
ENTRYPOINT ["/nodejs/bin/node"]
CMD ["scripts/linux/container-runtime.mjs"]
