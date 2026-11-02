-- ============================================================================
-- Nurvo — Schichtabgabe („Ich kann diese Schicht nicht übernehmen")
-- Einmalig im Supabase SQL-Editor ausführen. Idempotent.
--
-- WARUM DIESE MIGRATION:
-- Bisher kannte das System nur den TAUSCH: zwei Menschen tauschen zwei Schichten
-- (supabase/migrations/20260722_shift_swap_rebuild.sql). Der Einstieg ist aber
-- nie „ich möchte tauschen", sondern „ich kann nicht". Ob daraus eine Übernahme
-- oder eine ersatzlose Absage wird, entscheidet die Besetzungslage — nicht die
-- anfragende Person. Diese Migration legt das Fundament dafür.
--
-- KEINE KLARNAMEN: alle neuen Spalten verweisen ausschließlich über uuid
-- (staff_id) auf Personen. Ziel ist, dass auf dem Server perspektivisch nur
-- Pseudonyme liegen — dieselbe Linie wie burnout_scores (20260909).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Schichttausch je Station und je Bereich schaltbar
--
-- DREIWERTIG UND DAS MIT ABSICHT: null = „wie die Einrichtung es eingestellt hat".
-- Ein boolean mit `default true` würde die einrichtungsweite Einstellung
-- (facility_settings.shift_swap_mode) beim ersten ALTER TABLE stillschweigend
-- aushebeln — jede Station stünde dann auf „Tausch erlaubt", auch dort, wo die
-- Leitung ihn nie freigegeben hat. Nur ein ausdrücklich gesetzter Wert überschreibt.
--
-- Fachlicher Hintergrund: auf einer Intensivstation kann ein Tausch an fachlicher
-- Eignung scheitern, in der Reinigung ist er unproblematisch. Eine einzige
-- Einstellung für die ganze Einrichtung bildet das nicht ab.
-- Auflösungsreihenfolge im Code: lib/swap-scope.ts (genau eine Stelle).
-- ─────────────────────────────────────────────────────────────────────────────
alter table stations add column if not exists shift_swap_enabled boolean;
alter table bereiche  add column if not exists shift_swap_enabled boolean;

comment on column stations.shift_swap_enabled is
  'Schichttausch/-abgabe auf dieser Station: null = Einstellung der Einrichtung, true/false = ausdruecklich ueberschrieben. Aufloesung in lib/swap-scope.ts.';
comment on column bereiche.shift_swap_enabled is
  'Schichttausch/-abgabe fuer Mitglieder dieses Bereichs: null = Einstellung der Einrichtung, true/false = ausdruecklich ueberschrieben. Bereiche sind stationsuebergreifend, die Regel folgt also der Person. Aufloesung in lib/swap-scope.ts.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Der Vorgang selbst: eine Person meldet, dass sie eine Schicht nicht kann
--
-- Ein offener Vorgang je Schicht und Person. Was daraus wird, entscheidet die
-- Kaskade (lib/shift-release.ts):
--   sucht_ersatz         → Bedarfs- und Kandidatenprüfung läuft
--   wartet_auf_kandidat  → eine Anfrage liegt bei einer Person, Frist läuft
--   wartet_auf_leitung   → Ersatz ist nicht nötig, die Leitung muss es nur bestätigen
--   ohne_ersatz_abgesagt → Endzustand: der Tag ist auch ohne diese Person gedeckt
--   uebernommen          → Endzustand: jemand hat zugesagt, die Zuweisung ist umgeschrieben
--   eskaliert            → Endzustand der Automatik: niemand gefunden, die Leitung übernimmt
--   abgelehnt_leitung / zurueckgezogen → Endzustände durch Menschen
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists shift_release_requests (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,

  -- Wer gibt ab. Kein Klarname — die Anzeige löst den Namen serverseitig über
  -- lib/staff-identity.ts auf, gespeichert wird nur die uuid.
  staff_id uuid not null,

  shift_id   uuid not null,
  shift_date date not null,
  shift_type text not null,
  -- Station der Schicht: kein Personenbezug, aber nötig, um den Vorgang ohne
  -- zweiten Join der richtigen Stations-Regel zuordnen zu können.
  station text,

  reason text not null,

  status text not null default 'sucht_ersatz' check (status in (
    'sucht_ersatz', 'wartet_auf_kandidat', 'wartet_auf_leitung',
    'ohne_ersatz_abgesagt', 'uebernommen', 'eskaliert',
    'abgelehnt_leitung', 'zurueckgezogen'
  )),

  -- Ergebnis der Bedarfsprüfung: braucht es überhaupt Ersatz? luecke = Soll minus
  -- Ist ohne diese Person (computeShiftGapExcluding aus lib/sick-resolution.ts).
  ersatz_noetig boolean,
  luecke smallint,

  -- Wer übernommen hat (uuid, kein Klarname).
  uebernommen_von uuid,

  -- Was die Automatik versucht hat, in Zahlen: {"geprueft":12,"angefragt":3,
  -- "abgelehnt":2,"frist_abgelaufen":1,"gruende":{"urlaub":2,"ruhezeit":4}}.
  -- Bewusst strukturiert und OHNE Namen: die Leitung braucht die Begründung,
  -- nicht eine Liste, wer alles abgesagt hat — die steht in shift_release_offers.
  diagnose jsonb,

  created_at         timestamptz not null default now(),
  leitung_decided_at timestamptz,
  resolved_at        timestamptz
);

create index if not exists idx_release_facility_status on shift_release_requests(facility_name, status);
create index if not exists idx_release_staff           on shift_release_requests(staff_id, status);
create index if not exists idx_release_shift           on shift_release_requests(shift_id);

-- Höchstens EIN offener Vorgang je Schicht und Person. Sonst entstehen bei
-- Doppelklick oder parallelen Geräten zwei Kaskaden, die sich gegenseitig
-- Kandidaten wegnehmen. Gleiche Absicherung wie uniq_open_swap_per_shift (20260723).
create unique index if not exists uniq_offene_abgabe_pro_schicht
  on shift_release_requests (shift_id, staff_id)
  where status in ('sucht_ersatz', 'wartet_auf_kandidat', 'wartet_auf_leitung');

comment on table shift_release_requests is
  'Schichtabgabe: eine Person meldet, dass sie eine Schicht nicht uebernehmen kann. Das System prueft den Bedarf und sucht Ersatz (lib/shift-release.ts). Nur server-seitig (Service-Role).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Die einzelnen Anfragen der Kaskade — die Nachvollziehbarkeit
--
-- Eine Zeile je angefragter Person, mit Rang, Frist und Ausgang. Genau das ist
-- bei Streit über Arbeitszeit die entscheidende Auskunft: wer wurde wann gefragt,
-- wer hat abgelehnt, wo ist eine Frist verstrichen. Ein Status allein am Vorgang
-- würde diese Historie bei jedem Kaskadenschritt überschreiben.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists shift_release_offers (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  release_id uuid not null references shift_release_requests(id) on delete cascade,

  -- Angefragte Person (uuid, kein Klarname).
  staff_id uuid not null,

  -- Platz in der Kaskade (0 = bester Vorschlag) und der Ranking-Score, damit
  -- später erklärbar bleibt, WARUM diese Person zuerst gefragt wurde.
  rang  smallint not null default 0,
  score smallint,

  status text not null default 'offen' check (status in (
    'offen', 'angenommen', 'abgelehnt', 'frist_abgelaufen', 'uebersprungen'
  )),

  -- Ende der Antwortfrist. Begründung der Länge: lib/shift-release.ts (berechneFrist).
  frist timestamptz not null,

  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists idx_offer_release on shift_release_offers(release_id, rang);
create index if not exists idx_offer_staff   on shift_release_offers(staff_id, status);
-- Die Kaskade fragt IMMER nur eine Person gleichzeitig: sonst sagen zwei zu und
-- eine von beiden hat umsonst umdisponiert.
create unique index if not exists uniq_offenes_angebot_pro_vorgang
  on shift_release_offers (release_id)
  where status = 'offen';

comment on table shift_release_offers is
  'Einzelne Uebernahme-Anfragen der Ausfall-Kaskade, je angefragter Person eine Zeile (angefragt/abgelehnt/Frist abgelaufen/angenommen). Nur server-seitig (Service-Role).';

-- Zugriff ausschließlich über den Service-Role-Client. RLS an, ohne Policy →
-- anon/authenticated sehen nichts, Service-Role bleibt frei. Gleiche Linie wie
-- shift_swap_requests.
alter table shift_release_requests enable row level security;
alter table shift_release_offers   enable row level security;

notify pgrst, 'reload schema';
