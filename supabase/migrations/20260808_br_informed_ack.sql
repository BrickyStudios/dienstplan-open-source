-- Nachweis nach Art. 26 Abs. 7 EU-KI-VO.
--
-- Die Einrichtung ist als Betreiber verpflichtet, ihre Beschäftigten und den
-- Betriebs-/Personalrat über den Einsatz eines KI-gestützten Systems zu informieren.
-- Diese Pflicht trifft die Einrichtung, nicht Nurvo — Nurvo muss aber belegen können,
-- dass darauf hingewiesen wurde. Der Zeitstempel wird im Onboarding-Wizard
-- (Schritt "datenschutz") gesetzt und nur, wenn die Leitung aktiv bestätigt hat.
--
-- NULL bedeutet: nicht bestätigt (z. B. Onboarding übersprungen). Kein Default,
-- ein automatisch gesetzter Zeitstempel wäre als Nachweis wertlos.

alter table user_profiles add column if not exists br_informed_ack_at timestamptz;

comment on column user_profiles.br_informed_ack_at is
  'Zeitpunkt der Bestaetigung im Onboarding, ueber die Informationspflicht gegenueber Beschaeftigten und Betriebs-/Personalrat (Art. 26 Abs. 7 KI-VO) informiert worden zu sein. NULL = nicht bestaetigt.';
