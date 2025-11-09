# syntax=docker/dockerfile:1
ARG NODE_VERSION=22.13.1

# Build stage
FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app

# Install dependencies
COPY --link . ./

RUN --mount=type=cache,target=/root/.npm npm i

# COPY --link dist/ ./dist/
# COPY --link house-mailed-me-uk.crt ./
# COPY --link house-mailed-me-uk-privateKey.key ./
# COPY --link state.json ./

# Build the TypeScript project
# RUN --mount=type=cache,target=/root/.npm npm run build

# Production stage
FROM node:${NODE_VERSION}-slim AS final
WORKDIR /app

# Copy the dist/ directory from the builder stage
COPY --from=builder /app /app

# Create non-root user
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"
USER appuser

EXPOSE 8088
EXPOSE 8443
EXPOSE 1883

CMD ["node", "dist/server.js"]