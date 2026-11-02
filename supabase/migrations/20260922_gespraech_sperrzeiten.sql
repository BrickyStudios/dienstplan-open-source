-- Sperrzeiten fuer die Gespraechsbuchung: Zeiten, die gar nicht erst angeboten werden.
--
-- WOZU. Die Fensterliste kannte bisher zwei Gruende, ein Fenster wegzulassen: Es liegt
-- in der Vergangenheit (Vorlauf), oder es hat schon jemand. Alles andere wurde
-- angeboten — auch die Woche, in der niemand von uns da ist. Das faellt erst auf, wenn
-- ein Interessent sie waehlt, und dann kostet es eine Absage.
--
-- Ausdrueckliche Vorgabe vom 22.09.2026: "einstellen koennen, an welchen Terminen wir
-- auf jeden Fall nicht sein koennen, sodass sie gar nicht erst angezeigt werden."
--
-- ZWEI FORMEN IN EINER TABELLE. Ganztags ueber mehrere Tage (Urlaub, Messe) und ein
-- Zeitfenster an einem Tag (Vormittag belegt). Der Unterschied ist, ob `von_zeit` und
-- `bis_zeit` gesetzt sind — nicht eine zweite Tabelle.
--
-- HERKUNFT steht dabei, weil hier spaeter mehr als Handarbeit einlaeuft: 'hand' ist ein
-- Eintrag aus dem Admin-Panel, andere Werte kommen aus einer angebundenen Kalenderquelle.
-- Wer eine Quelle abhaengt, loescht ihre Zeilen ueber `herkunft`, ohne die von Hand
-- gesetzten mitzureissen.
--
-- Code-Referenzen: lib/gespraech/termine.ts (istGesperrt), app/api/gespraech/route.ts,
--   app/api/admin/sperrzeiten/route.ts, app/admin/page.tsx
--
-- Einmalig im Supabase-SQL-Editor ausfuehren (deployt NICHT automatisch mit).
-- Idempotent: ein zweiter Lauf aendert nichts.

create table if not exists gespraech_sperrzeiten (
  id            uuid primary key default gen_random_uuid(),

  -- Beide Grenzen EINSCHLIESSLICH. Ein einzelner Tag hat von_datum = bis_datum; das
  -- spart den Sonderfall im Code und liest sich im SQL-Editor ohne Nachdenken.
  von_datum     date not null,
  bis_datum     date not null,

  -- NULL = ganztags. Sonst das gesperrte Fenster, `von_zeit` einschliesslich,
  -- `bis_zeit` ausschliesslich — dieselbe Lesart wie bei einer Schicht. Ein Gespraech
  -- von 09:00 bis 09:30 gilt als gesperrt, sobald es die Sperre ueberhaupt beruehrt.
  von_zeit      time,
  bis_zeit      time,

  -- Steht nur intern. Erscheint nirgends auf der Website: Ein Besucher sieht ein
  -- Fenster nicht — warum es fehlt, geht ihn nichts an.
  grund         text,

  -- 'hand' | 'google' | spaetere Quellen. Siehe Kopf.
  herkunft      text not null default 'hand',
  -- Bei einer eingelesenen Quelle die Kennung des Ereignisses, damit ein zweiter
  -- Abgleich dieselbe Zeile trifft statt eine zweite anzulegen.
  quell_id      text,

  erstellt_am   timestamptz not null default now(),
  erstellt_von  text,

  -- Ein Zeitraum, der rueckwaerts laeuft, ist immer ein Tippfehler.
  constraint gespraech_sperrzeiten_reihenfolge check (bis_datum >= von_datum),
  -- Zeit entweder beide oder keine: eine halbe Angabe waere nicht auswertbar.
  constraint gespraech_sperrzeiten_zeitpaar check (
    (von_zeit is null and bis_zeit is null)
    or (von_zeit is not null and bis_zeit is not null and bis_zeit > von_zeit)
  )
);

-- Die einzige Abfrage im Betrieb: "was ist ab heute gesperrt".
create index if not exists gespraech_sperrzeiten_zeitraum
  on gespraech_sperrzeiten(bis_datum, von_datum);

-- Ein eingelesenes Ereignis genau einmal. Teil-Index, weil `quell_id` bei Handarbeit
-- leer bleibt und NULL sich in Postgres nicht mit sich selbst deckt.
create unique index if not exists gespraech_sperrzeiten_quelle
  on gespraech_sperrzeiten(herkunft, quell_id)
  where quell_id is not null;

alter table gespraech_sperrzeiten enable row level security;
-- Bewusst ohne Policy: Zugriff ausschliesslich ueber den service_role-Client
-- (lib/admin-client.ts), gesetzt wird nur aus dem Admin-Panel. Die oeffentliche Route
-- liest die Tabelle zwar, gibt aber nie eine Zeile heraus — nur die fertige Liste der
-- verbleibenden Fenster. Der Grund einer Sperre bleibt damit intern.

notify pgrst, 'reload schema';

-- ── Kontrollabfrage: 0 Zeilen = alles da ────────────────────────────────────────
select 'TABELLE FEHLT: gespraech_sperrzeiten' as befund
where to_regclass('public.gespraech_sperrzeiten') is null
union all
select 'SPALTE FEHLT: gespraech_sperrzeiten.' || t.spalte
from (values
  ('von_datum'), ('bis_datum'), ('von_zeit'), ('bis_zeit'),
  ('grund'), ('herkunft'), ('quell_id'), ('erstellt_von')
) as t(spalte)
where not exists (
  select 1 from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'gespraech_sperrzeiten'
    and c.column_name = t.spalte
)
union all
select 'INDEX FEHLT: gespraech_sperrzeiten_zeitraum'
where to_regclass('public.gespraech_sperrzeiten_zeitraum') is null;
