-- Station zählt NICHT zur PPBV-Pflegequote (z.B. „Ärztlicher Dienst", Funktions-/Verwaltungs-
-- einheiten). Default false = Bestandsverhalten (alle Stationen zählen wie bisher).
-- Defensiv: bis zur Ausführung inert (Dashboard-PPBV ignoriert die Spalte dann einfach).
ALTER TABLE public.stations ADD COLUMN IF NOT EXISTS ppbv_exempt boolean NOT NULL DEFAULT false;
