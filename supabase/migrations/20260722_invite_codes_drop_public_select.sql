-- C1 (KRITISCH): invite_codes war world-readable.
--
-- Die alte Policy `for select using (true)` erlaubte JEDEM (Rolle anon, deren Key im
-- Client-Bundle steckt) das Lesen ALLER Einladungscodes inkl. role, facility_name und
-- Preset-PII (preset_email, preset_first_name/last_name, preset_phone, preset_hourly_rate,
-- preset_vacation_days, preset_certificates). Damit ließen sich unbenutzte Codes enumerieren
-- → Selbst-Registrierung in beliebige Einrichtung als leitung/mitarbeiter + PII-Leak.
--
-- Validierung UND Einlösung laufen ausschließlich serverseitig über den service_role-Key
-- (app/api/invite/validate + app/api/invite/redeem, lib/leitung-auth, lib/demo-auth), der
-- RLS ohnehin umgeht. Es gibt KEINEN Client-Zugriff auf invite_codes (verifiziert per grep).
-- Die public-select-Policy ist daher überflüssig und wird ersatzlos entfernt.
--
-- Danach: RLS bleibt aktiv, aber ohne SELECT-Policy kann anon/authenticated die Tabelle
-- nicht mehr lesen. service_role (API) ist von RLS ausgenommen → Funktion unverändert.

drop policy if exists "Code einlösen" on invite_codes;

-- Sicherstellen, dass RLS aktiv bleibt (No-op, falls schon an).
alter table invite_codes enable row level security;
