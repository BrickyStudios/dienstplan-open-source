# Nurvo App — Selfhost-Image ("euer eigenes Vercel").
# Baut die Next.js-App als standalone (schlanke Node-Runtime) und startet sie auf Port 3000.
#
# WICHTIG: NEXT_PUBLIC_*-Variablen werden BEIM BUILD in das Client-Bundle gebacken → sie müssen
# als Build-Args gesetzt sein. Geheimnisse (SERVICE_ROLE_KEY, SMTP, AI_*, …) sind reine
# RUNTIME-Env (kommen aus docker-compose), NICHT ins Image.
#
# Build z. B.:
#   docker build \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://db.nurvo.app \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://app.nurvo.app \
#     -t nurvo-app:latest .

# ── Build ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Nur Manifeste zuerst → besserer Layer-Cache für npm ci
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# standalone-Output aktivieren (next.config.ts: output = standalone, wenn NEXT_STANDALONE=1)
ENV NEXT_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1

# Öffentliche (client-sichtbare) Build-Variablen
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Nicht als root laufen
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# standalone-Bundle + statische Assets + public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Healthcheck nutzt den bestehenden /api/health-Endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
