-- Mitarbeiter-Selbst-Verfügbarkeit ("Ich bin verfügbar / Springer") an-/abschaltbar.
-- Wenn true (Default), dürfen Mitarbeiter sich freiwillig als verfügbar eintragen und
-- zählen damit als Springer (availability_entries werden von der Ausfall-Kaskade
-- lib/sick-resolution.ts und der Verstärkungs-Anfrage als Bereitschaft gewertet).
-- Default true → Bestandsverhalten unverändert.
alter table public.facility_settings
  add column if not exists employee_availability_enabled boolean not null default true;
