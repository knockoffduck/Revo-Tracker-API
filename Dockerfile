# ---- Dependencies stage ----
FROM oven/bun:1-alpine AS deps

WORKDIR /app
COPY package.json ./

# Install only production dependencies
RUN bun install --frozen-lockfile --production

# ---- Runtime stage ----
FROM oven/bun:1-alpine

WORKDIR /app

# Add CA certificates for HTTPS calls (used by axios/fetch to external sites)
RUN apk add --no-cache ca-certificates curl

# Copy installed dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser  -u 1001 -S appuser -G appgroup && \
    mkdir -p /app/logs && \
    chown -R appuser:appgroup /app/logs
USER appuser

EXPOSE 3001

CMD ["bun", "run", "start"]
