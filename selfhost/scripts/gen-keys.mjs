#!/usr/bin/env node
// Erzeugt alle Geheimnisse für den Selfhost-Stack — v. a. JWT_SECRET und die daraus
// signierten ANON_KEY / SERVICE_ROLE_KEY (genau wie Supabase-Self-Hosting es verlangt).
// Ohne Abhängigkeiten (nur node:crypto). Ausgabe → in die .env kopieren.
//
//   node selfhost/scripts/gen-keys.mjs            # anzeigen
//   node selfhost/scripts/gen-keys.mjs >> .env    # direkt anhängen
//
// WICHTIG: EINMALIG erzeugen und SICHER verwahren. Ändert sich JWT_SECRET später, werden alle
// bestehenden Sessions/Keys ungültig.

import crypto from "node:crypto";

const b64url = (input) => Buffer.from(input).toString("base64url");
function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

const now = Math.floor(Date.now() / 1000);
const exp = now + 60 * 60 * 24 * 365 * 10; // 10 Jahre

const JWT_SECRET           = crypto.randomBytes(32).toString("hex");     // 64 Zeichen (>= 32 Pflicht)
const POSTGRES_PASSWORD    = crypto.randomBytes(24).toString("base64url");
const DASHBOARD_PASSWORD   = crypto.randomBytes(18).toString("base64url");
const SECRET_KEY_BASE      = crypto.randomBytes(32).toString("hex");     // 64 Zeichen
const VAULT_ENC_KEY        = crypto.randomBytes(16).toString("hex");     // exakt 32 Zeichen
const CRON_SECRET          = crypto.randomBytes(24).toString("base64url");
const MOBILE_AUTH_SECRET   = crypto.randomBytes(24).toString("base64url");
const ANALYTICS_HASH_SECRET= crypto.randomBytes(24).toString("base64url");

const ANON_KEY         = signJwt({ role: "anon",         iss: "supabase", iat: now, exp }, JWT_SECRET);
const SERVICE_ROLE_KEY = signJwt({ role: "service_role", iss: "supabase", iat: now, exp }, JWT_SECRET);

process.stdout.write(`# ── erzeugt von gen-keys.mjs am ${new Date().toISOString()} — GEHEIM halten ──
# Supabase-Kernschlüssel
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
SECRET_KEY_BASE=${SECRET_KEY_BASE}
VAULT_ENC_KEY=${VAULT_ENC_KEY}
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}

# App-Geheimnisse
CRON_SECRET=${CRON_SECRET}
MOBILE_AUTH_SECRET=${MOBILE_AUTH_SECRET}
ANALYTICS_HASH_SECRET=${ANALYTICS_HASH_SECRET}
`);
