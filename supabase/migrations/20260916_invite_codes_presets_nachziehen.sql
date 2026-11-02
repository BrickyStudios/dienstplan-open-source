-- Leert die personenbezogenen Vorbelegungen aus BEREITS eingeloesten Einladungscodes.
--
-- Hintergrund: Die preset_*-Spalten in invite_codes sind ein Transportmittel, kein
-- Speicher. Die Leitung traegt beim Einladen Name, private Telefonnummer, Stundensatz
-- und Urlaubsanspruch ein; beim Einloesen wandern die Werte nach user_profiles und
-- facility_staff. Danach hat die Kopie in invite_codes keinen Zweck mehr.
--
-- Befund 3 der Sicherheitspruefung vom 14.09.2026: Nach "Konto loeschen" wurden
-- user_profiles und der Auth-Nutzer entfernt, die invite_codes-Zeile blieb stehen.
-- Name, Telefonnummer und Stundensatz lagen weiter in der Datenbank — Art. 15 und
-- Art. 17 DSGVO sind darauf nicht erfuellbar.
--
-- Der Code leert die Felder seit dem 16.09.2026 selbst (lib/invite-presets.ts, Commit
-- ef755eb) — aber nur AB JETZT. Zeilen, die vorher eingeloest wurden, tragen ihre Werte
-- noch. Diese Datei holt das einmalig nach.
--
-- Was NICHT geloescht wird: code, used, used_by, used_at. Das ist der Nachweis, dass und
-- wann ein Zugang vergeben wurde, und der gehoert aufbewahrt.
--
-- Was diese Datei NICHT tut: eine rollierende Frist einrichten, nach der eingeloeste
-- Codes ganz verschwinden. Wie lange der Nachweis aufbewahrt wird, ist eine Entscheidung
-- fuers Loeschkonzept (docs/recht/LOESCHKONZEPT.md) und keine technische Groesse.
--
-- Idempotent: ein zweiter Lauf findet nichts mehr und aendert nichts.

-- Vorher ansehen, wie viele Zeilen betroffen sind:
--   select count(*) from public.invite_codes
--   where used = true and (preset_name is not null or preset_email is not null
--         or preset_phone is not null or preset_hourly_rate is not null);

update public.invite_codes set
  preset_name               = null,
  preset_first_name         = null,
  preset_last_name          = null,
  preset_email              = null,
  preset_phone              = null,
  preset_password           = null,
  preset_hourly_rate        = null,
  preset_vacation_days      = null,
  preset_max_hours          = null,
  preset_job_type           = null,
  preset_station            = null,
  preset_station_secondary  = null,
  preset_minijob_buffer     = null,
  preset_weekend_pct        = null,
  preset_holiday_pct        = null,
  preset_break_min          = null,
  preset_certificates       = null
where used = true;

-- ── Kontrollabfrage ─────────────────────────────────────────────────────────────
-- Nach dem Ausfuehren mitlaufen lassen: 0 = alles geleert.
select count(*) as noch_mit_daten
from public.invite_codes
where used = true
  and (preset_name is not null or preset_first_name is not null
       or preset_last_name is not null or preset_email is not null
       or preset_phone is not null or preset_password is not null
       or preset_hourly_rate is not null or preset_vacation_days is not null);
