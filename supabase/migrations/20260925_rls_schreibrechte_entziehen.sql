-- ============================================================================
-- Schreibrechte fuer anon und authenticated entziehen
-- Sicherheitspruefung 24.09.2026, Befunde K1 und K2
-- docs/sicherheit/SICHERHEITSPRUEFUNG-20260924.md
-- ============================================================================
--
-- WAS OFFEN WAR.
--
-- K1: Die Policy "write_own_row" auf user_profiles stand seit dem 19.05.2026 als
--     `FOR ALL USING (id = auth.uid())`, ohne WITH CHECK. Postgres prueft damit nur,
--     dass die Zeile weiter dem Nutzer gehoert — welche Spalten er aendert, nicht.
--     Wer angemeldet ist, konnte mit dem oeffentlichen anon-Key direkt ueber
--     /rest/v1/user_profiles seine eigene `role` und `facility` setzen. Die App liest
--     beides aus genau dieser Zeile (lib/leitung-auth.ts): `facility` auf den Namen
--     einer fremden Einrichtung heisst Leitung dieser Einrichtung. Ueber den
--     oeffentlichen Demo-Login ging das ohne eigenes Konto.
--     Am 24.09.2026 in Produktion nachgewiesen (No-op-Update am Demo-Leitungskonto
--     angenommen).
--
-- K2: Die Policies "tenant_isolation" auf facility_staff, shifts, stations,
--     staff_wishes, facility_settings, time_entries, sick_reports und invite_codes
--     haben kein FOR und gelten damit auch fuer INSERT/UPDATE/DELETE, ohne Rolle.
--     Jedes Mitglied einer Einrichtung konnte deren Schichten loeschen, Stundensaetze
--     aendern oder sich einen Leitungs-Einladungscode anlegen.
--
-- WARUM ALLE SCHREIBRECHTE UND NICHT JEDE POLICY EINZELN.
--
-- Die App schreibt ausschliesslich mit dem service_role-Schluessel. Geprueft am
-- 24.09.2026: Kein Browser-Code schreibt direkt (kein .insert/.update/.upsert/.delete
-- am Browser-Client, keine rpc, kein Storage), keine API-Route schreibt ueber den
-- Nutzer-Client, und die native App spricht nur /auth/v1 an. Die Schreibrechte von
-- anon und authenticated werden also nirgends gebraucht — und jedes einzelne ist eine
-- Tuer, die RLS allein bewachen muesste. Lesen bleibt, wie es ist.
--
-- service_role ist nicht betroffen (umgeht RLS und behaelt seine Rechte).
--
-- DANACH PRUEFEN: Als Demo-Leitung ein No-op-Update auf user_profiles und shifts —
-- beide muessen mit "permission denied" abgelehnt werden. Und einmal durch die App
-- (Anmelden, Dienstplan, Mitarbeiter anlegen, Zeiterfassung).
--
-- Idempotent: mehrfach ausfuehren schadet nicht.
-- ============================================================================

-- K1: die Hintertuer selbst
drop policy if exists "write_own_row" on public.user_profiles;

-- K1 + K2: Schreibrechte auf alle bestehenden Tabellen entziehen
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;

-- und fuer jede kuenftige Tabelle ebenso. Supabase vergibt sonst ALL an beide Rollen,
-- und die naechste Migration mit einer zu weiten Policy oeffnete dieselbe Tuer wieder.
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate on tables from anon, authenticated;
