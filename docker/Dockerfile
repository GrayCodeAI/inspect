# =============================================================================
# Inspect - Multi-stage Production Dockerfile
# =============================================================================
#
# Build:  docker build -f docker/Dockerfile -t inspect .
# Run:    docker run -p 4100:3000 -e ANTHROPIC_API_KEY=sk-... inspect
# CLI:    docker run --rm -e ANTHROPIC_API_KEY=sk-... inspect node apps/cli/dist/index.js test -m "test login"
#

# Stage 1: Base image with pnpm
FROM node:22-slim AS base
LABEL org.opencontainers.image.title="Inspect"
LABEL org.opencontainers.image.description="AI-Powered Browser Testing Platform"
LABEL org.opencontainers.image.source="https://github.com/nichochar/inspect"
LABEL org.opencontainers.image.licenses="MIT"
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Stage 2: Install dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/browser/package.json packages/browser/
COPY packages/core/package.json packages/core/
COPY packages/agent/package.json packages/agent/
COPY packages/quality/package.json packages/quality/
COPY packages/visual/package.json packages/visual/
COPY packages/workflow/package.json packages/workflow/
COPY packages/credentials/package.json packages/credentials/
COPY packages/data/package.json packages/data/
COPY packages/api/package.json packages/api/
COPY packages/network/package.json packages/network/
COPY packages/observability/package.json packages/observability/
COPY packages/sdk/package.json packages/sdk/
COPY packages/reporter/package.json packages/reporter/
COPY apps/cli/package.json apps/cli/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Stage 3: Build all packages
FROM deps AS build
COPY . .
RUN pnpm build

# Stage 4: Install Playwright browsers
FROM build AS playwright
RUN npx playwright install --with-deps chromium
# Install additional tools for quality scanning
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Stage 5: Production image
FROM node:22-slim AS production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production
ENV IN_DOCKER=true
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Install runtime dependencies for Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r inspect && useradd -r -g inspect -G audio,video inspect \
    && mkdir -p /home/inspect/.cache /home/inspect/.inspect \
    && chown -R inspect:inspect /home/inspect

WORKDIR /app

# Copy built application
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps ./apps

# Copy Playwright browsers
COPY --from=playwright /ms-playwright /ms-playwright

# Copy additional runtime files
COPY --from=build /app/yaml ./yaml
COPY --from=build /app/evals ./evals

# Set ownership
RUN chown -R inspect:inspect /app

USER inspect

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Expose API port
EXPOSE 3000

# Use dumb-init to handle PID 1 responsibilities
ENTRYPOINT ["dumb-init", "--"]

# Default command: start the API server
CMD ["node", "apps/cli/dist/index.js", "serve", "--port", "3000"]
