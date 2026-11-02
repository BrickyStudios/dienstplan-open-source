-- Teil 2: Springer fest im Dienstplan einplanen.
-- Wenn true, designiert der Planungs-Algorithmus beim Generieren des Monatsplans
-- pro Tag eine Bereitschaft (Springer), speichert sie als on_call_entries und
-- benachrichtigt die Person. Bei einem Ausfall greift die Ausfall-Kaskade
-- (lib/sick-resolution.ts) zuerst auf diese Bereitschaft zu.
-- Default false → Bestandskunden bleiben unverändert.
alter table public.facility_settings
  add column if not exists schedule_springer_enabled boolean not null default false;

-- Herkunft eines Bereitschafts-Eintrags: 'plan' = vom Generator gesetzt (idempotent
-- ersetzbar), NULL = manuell von der Leitung. So überschreibt eine Neugenerierung
-- nur die eigenen Plan-Springer und lässt manuelle Bereitschaften unangetastet.
alter table public.on_call_entries
  add column if not exists source text;
