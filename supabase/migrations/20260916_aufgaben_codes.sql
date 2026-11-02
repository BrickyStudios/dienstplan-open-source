-- Aufgaben per Code-Aufkleber ausloesen.
--
-- DIE IDEE: Ein Aufkleber mit QR-Code klebt am Bett. Wer ihn mit dem Handy scannt,
-- legt in zwei Schritten eine Reinigungsaufgabe an — ohne einzutippen, wo er steht.
-- Der Ort haengt am Code, nicht am Scannenden.
--
-- WARUM KEINE NEUE AUFGABEN-TABELLE: Es gibt bereits zwei, und sie passen.
-- bereich_tasks (20260602) fuehrt Aufgaben je stationsuebergreifendem Bereich —
-- genau die Reinigungseinheit, an die eine Bett-Aufgabe gehen soll. station_tasks
-- (20260604) fuehrt sie je Station. task_categories (20260612) ist bereits die
-- Aufgabenvorlage samt Checkliste, die die Einrichtung selbst pflegt. Diese Datei
-- ergaenzt also drei Dinge und erfindet nichts neu:
--
--   1. task_codes          — der Aufkleber mit fest hinterlegtem Ort
--   2. task_categories     — an welche Einheit eine Vorlage geht (Zustaendigkeit)
--   3. bereich_/station_tasks — Kommentar, Herkunft und der ausloesende Code
--
-- DIE ZUSTAENDIGKEIT IST DER KERN. Eine ausgeloeste Aufgabe ist NICHT fuer alle
-- sichtbar: "Bett reinigen" geht an die Bettenreinigung und an die Station, die es
-- ausgeloest hat. Die normale Reinigung sieht sie nicht. Technisch faellt das ohne
-- Zusatzlogik heraus: die Aufgabe landet in bereich_tasks mit der bereich_id der
-- zustaendigen Einheit, und /api/mein-bereich filtert ohnehin auf die Bereiche, in
-- denen jemand Mitglied ist.
--
-- Damit ist auch die naechste Stufe nur noch Konfiguration, kein Umbau: Wer
-- "Bettenreinigung infektioes" als zweiten Bereich anlegt und eine zweite Vorlage
-- darauf zeigen laesst, hat die Trennung — ohne dass hier eine Zeile geaendert wird.
-- Diese zweite Einheit wird bewusst NICHT vorangelegt.
--
-- Code-Referenzen: lib/task-codes.ts, app/api/leitung/task-codes/route.ts,
--   app/api/scan/[code]/route.ts, app/(app)/(leitung)/aufgaben-codes/page.tsx,
--   app/scan/[code]/page.tsx
--
-- Einmalig im Supabase-SQL-Editor ausfuehren (deployt NICHT automatisch mit).
-- Idempotent: ein zweiter Lauf aendert nichts.

-- ── 1) Die Aufkleber ────────────────────────────────────────────────────────────
-- Der Ort wird beim ANLEGEN hinterlegt, nicht beim Scannen. Das ist der ganze Trick:
-- Wer vor dem Bett steht, hat weder Lust noch Zeit, "Station 1, Zimmer 193, Bett an
-- der Tuer" einzutippen — und genau dort entstehen sonst die Fehler.
create table if not exists task_codes (
  id            uuid primary key default gen_random_uuid(),
  facility_name text not null,

  -- Steht auf dem Aufkleber und im QR-Code. Global eindeutig, weil er aus einer URL
  -- aufgeloest wird, bevor bekannt ist, zu welcher Einrichtung er gehoert.
  code          text not null unique,

  label         text,          -- "Bett 1 (an der Tuer)" — was auf dem Etikett gross steht
  station       text,          -- "Station 1"
  room          text,          -- "193"
  bed           text,          -- "Bett 1"
  building      text,          -- "Haus C"
  location_hint text,          -- frei: "Flur", "Abstellraum neben 193"

  -- Zustaendige Einheit als VORGABE. Greift, wenn die gewaehlte Vorlage selbst keine
  -- nennt. Kein Fremdschluessel, wie schon bei task_categories.category_id (20260612):
  -- die Spalte bleibt brauchbar, auch wenn ein Bereich geloescht wird.
  bereich_id    uuid,

  -- Leere Liste/NULL = alle aktiven Vorlagen der Einrichtung sind waehlbar.
  -- Gefuellt = nur diese. So haengt am Bett nur, was ans Bett gehoert.
  allowed_category_ids jsonb not null default '[]'::jsonb,

  active        boolean not null default true,
  created_at    timestamptz default now(),
  created_by_name text,

  -- Nur fuer die Leitungs-Uebersicht: welche Aufkleber werden benutzt, welche haengen
  -- tot an der Wand. Kein Personenbezug.
  last_scan_at  timestamptz,
  scan_count    integer not null default 0
);
create index if not exists task_codes_facility on task_codes(facility_name, active);
create index if not exists task_codes_station  on task_codes(facility_name, station);

alter table task_codes enable row level security;
-- Bewusst ohne Policy: Zugriff laeuft ausschliesslich ueber den service_role-Client
-- (lib/admin-client.ts). RLS an + null Policies = anon und authenticated sehen nichts.
-- Das ist wichtig, weil in dieser Tabelle steht, wo welches Bett steht.

-- ── 2) Zustaendigkeit an der Vorlage ────────────────────────────────────────────
-- An welche Einheit geht eine Vorlage? NULL = keine Vorgabe, dann entscheidet der Code.
alter table task_categories add column if not exists bereich_id uuid;

-- Vorlagen ausser Dienst stellen, ohne die Historie zu verlieren: erledigte Aufgaben
-- tragen category_name als Kopie, ein Loeschen wuerde sie nicht beschaedigen — aber
-- eine abgeschaltete Vorlage laesst sich wieder einschalten, eine geloeschte nicht.
alter table task_categories add column if not exists active boolean not null default true;

-- ── 3) Kommentar und Herkunft an der Aufgabe ────────────────────────────────────
-- note: der freie Zusatz beim Scannen ("Bett steht auf dem Flur."). Bewusst getrennt
-- von title — der Titel kommt aus der Vorlage und bleibt vergleichbar, der Kommentar
-- ist der Einzelfall.
alter table bereich_tasks  add column if not exists note text;
alter table station_tasks  add column if not exists note text;

-- code_id: welcher Aufkleber hat es ausgeloest. Macht "dieses Bett faellt staendig auf"
-- ueberhaupt erst auswertbar.
alter table bereich_tasks  add column if not exists code_id uuid;
alter table station_tasks  add column if not exists code_id uuid;

-- source: 'manuell' wie bisher ueber die Oberflaeche, 'scan' ueber einen Aufkleber.
alter table bereich_tasks  add column if not exists source text not null default 'manuell';
alter table station_tasks  add column if not exists source text not null default 'manuell';

create index if not exists bereich_tasks_code on bereich_tasks(code_id);
create index if not exists station_tasks_code on station_tasks(code_id);

-- Die Station sieht Aufgaben, die SIE ausgeloest hat, auch dann, wenn sie an einen
-- Bereich gegangen sind. Dafuer fragt /api/mein-station bereich_tasks nach station ab.
create index if not exists bereich_tasks_station on bereich_tasks(facility_name, station);

notify pgrst, 'reload schema';

-- ── Kontrollabfrage: 0 Zeilen = alles da ────────────────────────────────────────
select 'TABELLE FEHLT: task_codes' as befund
where to_regclass('public.task_codes') is null
union all
select 'SPALTE FEHLT: ' || t.tabelle || '.' || t.spalte
from (values
  ('task_categories','bereich_id'), ('task_categories','active'),
  ('bereich_tasks','note'), ('bereich_tasks','code_id'), ('bereich_tasks','source'),
  ('station_tasks','note'), ('station_tasks','code_id'), ('station_tasks','source')
) as t(tabelle, spalte)
where not exists (
  select 1 from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = t.tabelle and c.column_name = t.spalte
);
