-- ============================================================================
-- 20260909 - staffing_needs: aus der Personalbedarf-Empfehlung wird ein Vorgang
-- ============================================================================
--
-- Bis hierher war die Personalbedarf-Empfehlung im Schichtplan eine Sackgasse: Sie
-- rechnete aus den Schichtdaten aus, wo regelmaessig Personal fehlt ("Innere 1,
-- Frueh, +2"), zeigte das an — und dort endete es. Es gab keinen Knopf, keine
-- Ablage, keinen Status. Beim naechsten Aufruf stand dieselbe Zahl wieder da, und
-- niemand konnte sehen, ob jemand sich darum gekuemmert hat.
--
-- Diese Tabelle macht daraus einen Vorgang mit Lebenslauf: uebernommen, in Arbeit,
-- erledigt oder verworfen. Der Wert liegt nicht in der Zahl - die rechnet die
-- Oberflaeche jederzeit neu -, sondern in der Entscheidung darueber und darin, dass
-- sie nachvollziehbar bleibt. Eine Einrichtung, die im Personalgespraech belegen
-- will, dass der Bedarf seit vier Monaten gemeldet ist, braucht genau das.
--
-- Keine Personennamen: Ein Personalbedarf haengt an Station und Schichtart, nicht an
-- Menschen. `decided_by` haelt bewusst nur eine Kennung, keinen Klarnamen.
-- ============================================================================

create table if not exists staffing_needs (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  station text not null,
  shift_type text not null,

  -- Wie viele Koepfe die Empfehlung vorschlaegt. Aenderbar: Die Leitung kennt Budget
  -- und Bewerberlage, die Auswertung nicht.
  headcount integer not null default 1,

  -- Die Zahlen, aus denen die Empfehlung entstand. Festgehalten, damit spaeter
  -- nachvollziehbar bleibt, worauf die Entscheidung beruhte - die Schichtdaten selbst
  -- aendern sich weiter.
  avg_gap numeric,
  understaffed_ratio numeric,
  sample_count integer,

  status text not null default 'offen',
  note text,
  decided_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Eine Station/Schichtart hat genau einen offenen Vorgang. Ohne das entstuende bei
-- jedem Klick ein weiterer Eintrag und die Liste waere nach einer Woche unlesbar.
create unique index if not exists staffing_needs_unique
  on staffing_needs (facility_name, station, shift_type);

create index if not exists staffing_needs_facility_status
  on staffing_needs (facility_name, status);

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'staffing_needs' and constraint_name = 'staffing_needs_status_check'
  ) then
    alter table staffing_needs
      add constraint staffing_needs_status_check
      check (status in ('offen', 'in_arbeit', 'erledigt', 'verworfen'));
  end if;
end $$;
