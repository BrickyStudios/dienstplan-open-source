-- Persönliches Kalenderabo für Mitarbeitende (10.10.2026)
--
-- Jede Person kann ihre eigenen Dienste als Kalenderabo in Google, Apple oder Outlook
-- eintragen (Mein Plan → „Kalender verbinden“). Die Adresse ist der Zugang — ein
-- Kalenderprogramm kann sich nicht anmelden. Deshalb steht hier nur der SHA-256 des
-- Tokens, nie der Token selbst, und eine Person hat höchstens ein Abo: Neu verbinden
-- ersetzt die alte Adresse, Trennen löscht die Zeile.
--
-- Der Kalender zeigt nur Dienstart, Zeit und Station — keinen Namen und keine Einrichtung.
-- Wer die Adresse findet, erfährt nicht, wessen Dienste das sind (lib/mitarbeiter-kalender.ts).
--
-- OHNE DIESE DATEI: Der Knopf „Kalender verbinden“ meldet, dass die Funktion noch nicht
-- eingerichtet ist. Sonst ändert sich nichts.

create table if not exists mitarbeiter_kalender (
  user_id        uuid primary key,
  facility_name  text not null,
  token_hash     text not null unique,
  erstellt_am    timestamptz not null default now(),
  letzter_abruf  timestamptz
);

-- Nur über den Server (Service-Schlüssel) — kein Zugriff aus dem Browser.
alter table mitarbeiter_kalender enable row level security;

-- Prüfen: 1 Zeile = da.
select table_name from information_schema.tables where table_name = 'mitarbeiter_kalender';
