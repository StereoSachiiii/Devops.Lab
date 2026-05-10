# Use Node.js LTS as base
FROM node:20-slim AS base

# Install openssl for Prisma
RUN apt-get update -y && apt-get install -y openssl

# Set working directory
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY services/content/package.json ./services/content/
RUN npm install

# Build the application
FROM deps AS builder
COPY . .
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN npm run build --workspace=@devops/content-service

# Production image
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3001

# Create a non-root user
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nextjs

# Copy built files
COPY --from=builder /app/services/content/dist ./services/content/dist
COPY --from=builder /app/services/content/package.json ./services/content/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/db/node_modules ./packages/db/node_modules

USER nextjs

EXPOSE 3001

CMD ["node", "services/content/dist/index.js"]
