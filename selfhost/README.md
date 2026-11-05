# Nurvo Selfhost — eigenes „Vercel" + eigenes „Supabase" (DSGVO, DE-Server)

Damit läuft Nurvo **ohne Supabase-Cloud und ohne Vercel** — komplett auf **eurem eigenen Server**.
„Eure eigene Supabase-Version" ist der **quelloffene Supabase-Stack** (Postgres + Auth + PostgREST
+ Storage + Gateway), den ihr selbst betreibt: die Firma Supabase sieht **nie** eure Daten.
„Euer eigenes Vercel" ist der App-Container (`Dockerfile`) hinter Caddy (TLS).

> **Warum als Add-on zum offiziellen `supabase/docker`?** Supabase pflegt die (versionssensible)
> DB-Init, Rollen, GoTrue/Storage-Migrationen. Wir setzen nur **App + Reverse-Proxy** obendrauf und
> laden **unser** Schema. Das ist deutlich robuster, als den ganzen Supabase-Stack von Hand
> nachzubauen.

Ergebnis-Topologie (Ein-Server-Start; HA/Replikation → `docs/INFRASTRUKTUR.md`):

```
Internet ──443──> Caddy ──> app.deine-praxis.de  → Nurvo (Next.js, :3000)   ← "eigenes Vercel"
                       └──> db.deine-praxis.de   → Kong → GoTrue/PostgREST/Storage → Postgres  ← "eigenes Supabase"
```

---

## 0. Voraussetzungen
- 1 Linux-Server in DE (Docker + Docker Compose v2), Ports 80/443 offen.
- Zwei DNS-A-Records auf den Server: `app.deine-praxis.de` und `db.deine-praxis.de` (Domains anpassbar).
- Dieses Repo (`nurvo`) auf dem Server (oder Image woanders bauen).
- Node ≥ 18 auf dem Server (nur für das Key-Skript).

---

## 1. Supabase-Basis holen
```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env          # Supabase-Standard-ENV
```

## 2. Schlüssel & Geheimnisse erzeugen
```bash
NURVO=/pfad/zu/nurvo
node "$NURVO/selfhost/scripts/gen-keys.mjs" >> .env      # POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, …
cat "$NURVO/selfhost/.env.app.example"     >> .env       # App-Variablen (Domains anpassen!)
```
Danach **`.env` öffnen** und setzen/prüfen:
- `APP_DOMAIN`, `DB_DOMAIN`, `SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `API_EXTERNAL_URL` → eure Domains.
- In der Supabase-Sektion außerdem `SITE_URL`/`API_EXTERNAL_URL` konsistent halten und die von der
  jeweiligen Supabase-Version verlangten Felder füllen (die `.env.example` von supabase/docker listet sie).
- `RESEND_*` bzw. SMTP für E-Mails; optional `ANTHROPIC_API_KEY` oder `AI_*` (KI).

> Doppelte Keys vermeiden: falls `.env.example` von Supabase bereits `ANON_KEY`/`SERVICE_ROLE_KEY`/
> `JWT_SECRET`/`POSTGRES_PASSWORD` enthält, die **von gen-keys.mjs** erzeugten Werte gewinnen lassen
> (die alten Zeilen entfernen), sonst zieht Compose den falschen.

## 3. Supabase-Stack starten
```bash
docker compose up -d            # db, auth, rest, storage, kong, studio, …
docker compose ps               # warten bis db + auth "healthy"/up
```

## 4. Nurvo-Schema in die eigene DB laden
```bash
NURVO_REPO="$NURVO" bash "$NURVO/selfhost/scripts/bootstrap-db.sh"
```
Lädt `supabase/schema.sql` in die frische DB. Muss **nach** Schritt 3 laufen (das `auth`-Schema muss existieren).

## 5. App + Reverse-Proxy dazustarten
```bash
docker compose --env-file ./.env \
  -f docker-compose.yml \
  -f "$NURVO/selfhost/docker-compose.app.yml" \
  up -d --build
```
Caddy holt automatisch Let's-Encrypt-Zertifikate für `app.` und `db.`.
→ Nurvo läuft auf **https://app.deine-praxis.de**.

## 6. Erste Admin-/Leitungskonten
Registrierung läuft über Einladungscodes (`invite_codes`). Einen Start-Code/Admin legt ihr direkt
in der DB an (Supabase-Studio nur über SSH-Tunnel, **nicht** öffentlich) oder per SQL im
`db`-Container. Danach normaler Login-/Onboarding-Flow.

---

## Cron (Vercel-Cron-Ersatz)
Die `/api/cron/*`-Endpunkte brauchen `Authorization: Bearer $CRON_SECRET`. Einfachster Weg —
**Host-Crontab** (`crontab -e`), z. B. täglich 03:00:
```cron
0 3 * * * curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://app.deine-praxis.de/api/cron/auto-schedule >/dev/null
```
(Weitere Cron-Endpunkte analog: `external-followup`, `overtime-rebalance`.)

## Updates / Deploy (euer „git push = live")
Neuer Code → Image neu bauen + App neu starten:
```bash
cd "$NURVO" && git pull
docker compose --env-file ./.env -f docker-compose.yml -f "$NURVO/selfhost/docker-compose.app.yml" \
  up -d --build app
```
Datenbank-Änderungen laufen **nicht** automatisch mit. Stehen in den Release-Notizen SQL-Dateien, diese per `psql` einspielen.

---

## DSGVO-Status nach diesem Setup
- ✅ **Daten** (Postgres, Auth, Storage) liegen ausschließlich auf eurem DE-Server.
- ✅ **App-Hosting** self-hosted (kein Vercel).
- ⚠️ **E-Mail:** solange `RESEND_*` (US) aktiv ist, gehen Mails über einen US-Dienst → auf EU-SMTP wechseln.
- ⚠️ **KI:** solange `ANTHROPIC_API_KEY` gesetzt ist, gehen KI-Prompts an die Anthropic-Cloud (US).
  Für vollen Selfhost `AI_PROVIDER=openai` + lokales Ollama/Gemma setzen (Code ist vorbereitet, `lib/ai.ts`).

## Was hier NICHT enthalten ist (bewusst)
- **HA/lückenloses Failover, Streaming-Replikation, Backups (pgBackRest), Monitoring** → das ist der
  Ausbau in **`docs/INFRASTRUKTUR.md`** (2 Server, Patroni/etcd, MinIO-Replikation). Dieses Setup ist
  der **funktionierende Ein-Server-Start**, auf dem der HA-Ausbau aufsetzt.

> Hinweis: Diese Dateien sind ein geprüft strukturierter Bausatz, aber in dieser Umgebung nicht
> end-to-end lauffähig getestet (kein Docker/Server hier). Beim ersten `up` können versions-
> spezifische Supabase-ENV-Felder nachzutragen sein — die `.env.example` von supabase/docker ist
> dafür die Referenz.
