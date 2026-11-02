-- Google-Kalender an die Gespraechsbuchung anbinden: belegte Zeiten verschwinden selbst.
--
-- WOZU. Die Sperrzeiten aus 20260922_gespraech_sperrzeiten.sql sind Handarbeit, und
-- Handarbeit wird vergessen. Wer seinen eigenen Kalender ohnehin pflegt, soll ihn nicht
-- ein zweites Mal pflegen muessen.
--
-- WARUM OAUTH UND NICHT DIE GEHEIME ICAL-ADRESSE. Die private iCal-Adresse waere in
-- fuenf Minuten eingerichtet, Google aktualisiert sie aber traege — je nach Kalender
-- Stunden bis zu einem Tag. Ein Termin, der heute Vormittag entsteht, liesse dann heute
-- Nachmittag noch ein Buchungsfenster offen. Das ist genau der Fall, den die Anbindung
-- verhindern soll. Entscheidung von Lilian am 22.09.2026, nachdem beide Wege mit ihrem
-- Preis nebeneinander standen.
--
-- WAS HIER *NICHT* STEHT: Termine. Abgefragt wird ausschliesslich die FreeBusy-Auskunft
-- (`calendar.freebusy`), und die gibt Zeitspannen zurueck, keine Titel, keine
-- Teilnehmer, keine Orte. Was in diese Tabelle einlaeuft, ist "von 14:00 bis 15:00
-- belegt" — mehr weiss Nurvo nicht, und mehr darf es nicht wissen: Im Kalender einer
-- Gruenderin stehen private Termine.
--
-- DER REFRESH-TOKEN IST DAS EIGENTLICHE GEHEIMNIS. Er liegt verschluesselt (AES-256-GCM,
-- lib/anbindungen/geheimnis.ts) und der Schluessel steht in der Umgebung
-- (ANBINDUNGEN_SCHLUESSEL), nicht in der Datenbank. Ein Datenbank-Auszug allein reicht
-- damit nicht, um fremde Kalender abzufragen.
--
-- Code-Referenzen: lib/gespraech/google-kalender.ts, app/api/admin/google-kalender/*,
--   app/api/gespraech/route.ts, app/admin/page.tsx
--
-- Einmalig im Supabase-SQL-Editor ausfuehren (deployt NICHT automatisch mit).
-- Setzt 20260922_gespraech_sperrzeiten.sql voraus.
-- Idempotent: ein zweiter Lauf aendert nichts.

create table if not exists gespraech_google_konten (
  id            uuid primary key default gen_random_uuid(),

  -- Welches Konto haengt dran. Steht nur im Admin-Panel, damit erkennbar ist, WESSEN
  -- Kalender gerade sperrt — bei drei Gruendern ist das die erste Rueckfrage.
  google_email  text not null,

  -- 'primary' ist der Hauptkalender des Kontos. Als Spalte, weil jemand spaeter einen
  -- eigenen "Nurvo"-Kalender anbinden will statt des privaten.
  kalender_id   text not null default 'primary',

  -- AES-256-GCM, Format "v1:iv:marke:daten" (lib/anbindungen/geheimnis.ts). Niemals im
  -- Klartext, auch nicht "nur kurz".
  refresh_token text not null,

  -- Der kurzlebige Zugriffstoken, ebenfalls verschluesselt, plus sein Ablauf. Gecacht,
  -- damit nicht jeder Abgleich zuerst einen neuen holt — Google zaehlt das mit.
  zugriff_token text,
  zugriff_bis   timestamptz,

  -- Wann zuletzt abgeglichen wurde. Steuert, ob ein Seitenaufruf einen neuen Abgleich
  -- ausloest: Ein Cron-Job taugt hier nicht, Vercel Hobby erlaubt einen pro Tag und der
  -- ist von der Auto-Planung belegt.
  zuletzt_abgeglichen timestamptz,
  -- Der letzte Fehler im Klartext. Eine Anbindung, die still nicht mehr laeuft, ist
  -- schlimmer als gar keine: Man verlaesst sich darauf.
  letzter_fehler      text,

  verbunden_am  timestamptz not null default now(),
  verbunden_von text
);

-- Ein Konto einmal. Wer dasselbe Google-Konto erneut verbindet, ersetzt den Eintrag,
-- statt einen zweiten anzulegen, der dieselben Zeiten ein zweites Mal sperrt.
create unique index if not exists gespraech_google_konten_email
  on gespraech_google_konten(google_email, kalender_id);

alter table gespraech_google_konten enable row level security;
-- Bewusst ohne Policy: ausschliesslich ueber den service_role-Client (lib/admin-client.ts).
-- In dieser Tabelle liegt ein Token, mit dem sich der Kalender einer Person abfragen
-- laesst. Keine Rolle ausser service_role hat hier etwas verloren.

notify pgrst, 'reload schema';

-- ── Kontrollabfrage: 0 Zeilen = alles da ────────────────────────────────────────
select 'TABELLE FEHLT: gespraech_google_konten' as befund
where to_regclass('public.gespraech_google_konten') is null
union all
select 'SPALTE FEHLT: gespraech_google_konten.' || t.spalte
from (values
  ('google_email'), ('kalender_id'), ('refresh_token'), ('zugriff_token'),
  ('zugriff_bis'), ('zuletzt_abgeglichen'), ('letzter_fehler'), ('verbunden_von')
) as t(spalte)
where not exists (
  select 1 from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'gespraech_google_konten'
    and c.column_name = t.spalte
)
union all
select 'VORAUSSETZUNG FEHLT: gespraech_sperrzeiten (20260922_gespraech_sperrzeiten.sql)'
where to_regclass('public.gespraech_sperrzeiten') is null;
