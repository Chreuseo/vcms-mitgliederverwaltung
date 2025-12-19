# syntax=docker/dockerfile:1.6

# -----------------------------
# 1) Dependencies layer
# -----------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# System deps for native modules (e.g., sharp) and Prisma engines
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm install --include=dev --no-audit --no-fund

# -----------------------------
# 2) Builder layer
# -----------------------------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
# Copy source
COPY . .
# Ensure prisma client is generated before build
RUN npx prisma generate
# Next.js standalone build
ENV NEXT_TELEMETRY_DISABLED=1
# Übergibt public ENV-Variablen als Build-Args (werden von Next.js beim Build inlined)
ARG NEXT_PUBLIC_COMPANY
ENV NEXT_PUBLIC_COMPANY=$NEXT_PUBLIC_COMPANY
RUN npm run build

# -----------------------------
# 3) Production runner (small, secure)
# -----------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# System deps
RUN apk add --no-cache libc6-compat openssl \
  && addgroup -g 1001 -S nodejs \
  && adduser -S nextjs -u 1001

# Copy the minimal files for Next standalone runtime
# - standalone server bundle includes necessary node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Prisma engines sometimes aren't included in standalone; copy them explicitly
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Expose and run
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
# Laufzeitverzeichnis vorbereiten und Berechtigungen setzen
RUN mkdir -p /app/uploads_tmp && chown -R 1001:1001 /app
USER 1001
CMD ["node", "server.js"]
# -----------------------------