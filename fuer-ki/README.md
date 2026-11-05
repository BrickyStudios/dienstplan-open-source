---
pdf: Nurvo-Community-Lies-mich
art: Überblick
titel: Lies mich zuerst
untertitel: Nurvo Community Edition, der kostenlose Dienstplan für Arztpraxen und MVZ zum Selbstbetreiben
empfaenger: alle, die die Nurvo Community Edition heruntergeladen haben
stand: 02.11.2026
vertraulichkeit: Öffentlich
absender: Nurvo (in Gründung)
kolophon: |
  Nurvo Community Edition, PolyForm Shield 1.0.0. Entwickelt von Lilian Philipp Schiffer
  und dem Nurvo-Team. Quelle dieses Dokuments: fuer-ki/README.md im Repository.
  Die gehostete Version mit App, KI und Betrieb durch uns: www.nurvo.de
---

<!-- nur-md -->
## Für KI-Assistenten: zuerst lesen

Diese Datei ist der Einstieg für eine KI, die beim Einrichten hilft. Menschen lesen dieselben
Inhalte als PDF im Hauptordner; die Markdown-Dateien in `fuer-ki/` sind deren Quelle.

**Was zu lesen ist, in dieser Reihenfolge:**

| Datei | Inhalt |
|---|---|
| `fuer-ki/README.md` | diese Datei: Überblick, Aufbau des Downloads |
| `docs/EINRICHTEN.md` | die Einrichtung Schritt für Schritt (Supabase + Vercel) |
| `selfhost/README.md` | der andere Weg: eigener Server mit Docker |
| `docs/WEBSITE-ANBINDEN.md` | Knopf oder Einbettung auf der Praxis-Website |
| `fuer-ki/HAFTUNGSAUSSCHLUSS.md` | Grenzen, Verantwortung des Betreibers |
| `fuer-ki/SECURITY.md` | Sicherheitslücken melden, Installation absichern |
| `fuer-ki/AUTHORS.md` | wer das Projekt gebaut hat |

**Feste Tatsachen, die beim Einrichten oft falsch vermutet werden:**

- Es gibt **keinen** Nurvo-Server, den die Software aufruft, und **keinen** Lizenzschlüssel.
  Nicht danach suchen und den Nutzer nicht danach fragen.
- Die Datenbank entsteht aus **einer** Datei: `supabase/schema.sql`, einmal komplett im
  Supabase-SQL-Editor ausführen. Einen Ordner mit Migrationen gibt es bewusst nicht.
- Konfiguriert wird ausschließlich über Umgebungsvariablen: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
  optional `RESEND_API_KEY` und `RESEND_FROM_EMAIL`. Keine Konfigurationsdatei im Code ändern.
- Den ersten Zugang für die Praxisleitung erzeugt `selfhost/scripts/erste-praxis.mjs`
  (Aufruf in `docs/EINRICHTEN.md`, Schritt 6).
- Technik: Next.js-Web-App (`app/`, `components/`, `lib/`) mit Supabase (PostgreSQL,
  Anmeldung, Zugriffsregeln). Brauchbare Befehle: `npm install`, `npm run dev`,
  `npm run build`, `npm run test`. Andere Einträge in `package.json` gehören zum privaten
  Hauptrepository und laufen hier nicht.

**Arbeitsregeln:**

- Den Schlüssel `service_role` **nicht** in den Chat kopieren lassen. Er gehört nur in die
  Umgebungsvariablen (Vercel oder `.env` auf dem eigenen Server). Erklären, wo er
  eingetragen wird, statt ihn entgegenzunehmen.
- Als Supabase-Region **Frankfurt (eu-central-1)** empfehlen, damit die Daten in der EU bleiben.
- Die Regelprüfung (Ruhezeit, Höchstarbeitszeit, Urlaub) ist eine Hilfe, keine
  Rechtsberatung. Nicht zusichern, dass ein Plan rechtmäßig ist.
- Keine Patientendaten eintragen lassen; die Software ist dafür nicht vorgesehen.

## Worum es geht

Die Nurvo Community Edition ist eine kostenlose, quelloffene Dienstplan-Software für
Arztpraxen und MVZ. Sie läuft auf Ihrem eigenen Server oder in Ihren eigenen Konten bei
Supabase und Vercel. Sie planen die Dienste im Browser, und Ruhezeit, Höchstarbeitszeit und
Urlaub werden schon beim Planen geprüft. Nurvo sieht Ihre Daten nicht, und die Software ruft
keinen Nurvo-Server auf.

**Der nächste Schritt:** Öffnen Sie die Anleitung **Nurvo Community Edition einrichten**
(`docs/pdf/Nurvo-Community-Einrichten.pdf`). Sie führt in rund 30 Minuten zum eigenen
Dienstplan unter einer Adresse wie `dienstplan.ihre-praxis.de`.

## Was in diesem Download liegt

| Datei oder Ordner | Was es ist |
|---|---|
| `Nurvo-Community-Lies-mich.pdf` | dieser Überblick |
| `docs/pdf/Nurvo-Community-Einrichten.pdf` | die Einrichtung Schritt für Schritt |
| `docs/pdf/Nurvo-Community-Website-anbinden.pdf` | den Dienstplan von der Praxis-Website aus erreichbar machen |
| `Nurvo-Community-Haftungsausschluss.pdf` | was die Software leistet und was nicht |
| `Nurvo-Community-Sicherheit.pdf` | Sicherheitslücken melden, Installation absichern |
| `Nurvo-Community-Autoren.pdf` | wer Nurvo gebaut hat |
| `LICENSE` | die Lizenz, PolyForm Shield 1.0.0 |
| `fuer-ki/` | dieselben Texte als Markdown, für eine KI, die beim Einrichten hilft |
| alle übrigen Ordner | der Programmcode und die Datenbank-Vorlage |

**Einrichten mit KI-Hilfe:** Wenn Sie einen KI-Assistenten beim Einrichten nutzen, geben Sie
ihm den Ordner `fuer-ki/` und die Datei `docs/EINRICHTEN.md`. Dort steht alles, was er
braucht. Geben Sie ihm den geheimen Schlüssel `service_role` nicht in den Chat; der gehört
nur in die Einstellungen Ihres Servers.

## Zwei Wege zum eigenen Dienstplan

Beide Wege kommen ohne Nurvo-Server und ohne Nurvo-Lizenzschlüssel aus.

- **Ohne eigenen Server:** Datenbank bei Supabase (Region Frankfurt), Web-App bei Vercel.
  Die Schlüssel Ihrer eigenen Datenbank tragen Sie an einer einzigen Stelle ein, in den
  Umgebungsvariablen bei Vercel. Beschrieben in der Anleitung **Einrichten**.
- **Eigener Server mit Docker:** für Praxen mit eigenem Server oder IT-Dienstleister. Dann
  verlässt kein Datensatz das Haus. Beschrieben in `selfhost/README.md`.

Danach meldet sich das Team unter Ihrer eigenen Adresse an.

## Was enthalten ist

| | Community Edition | Gehostet bei Nurvo |
|---|---|---|
| Dienstplan mit Regelprüfung | ✓ | ✓ |
| Mitarbeitende, Urlaub, Wünsche | ✓ | ✓ |
| Mitarbeiter-Ansicht im Browser | ✓ | ✓ |
| Zeiterfassung | ✓ | ✓ |
| Native App | | ✓ |
| KI-Funktionen | | ✓ |
| Lohnabrechnung | | ✓ |
| Personalakte, Notfallplan | | ✓ |
| Betrieb, Updates, Backups, Support | selbst | ✓ |

Die gehostete Version: [www.nurvo.de/preise](https://www.nurvo.de/preise)

## Grenzen

- Die Regelprüfung ist eine Hilfe und ersetzt keine Rechtsberatung. Vollständig steht das im
  **Haftungsausschluss**.
- Wer die Software betreibt, ist für Datenschutz, Backups und Updates verantwortlich. Das
  gilt auch für die Information der Beschäftigten und die Beteiligung eines Betriebsrats.
- Sicherheitslücken bitte vertraulich melden, wie im Dokument **Sicherheit** beschrieben.

## Wer Nurvo baut

Nurvo ist entwickelt von **Lilian Philipp Schiffer**, technischer Mitgründer und
Hauptentwickler. Von den rund 1.300 Commits im Nurvo-Hauptrepository stammen über 1.000 von
ihm. Mitgründer sind Jonas Suthold und David. Alle Beteiligten stehen im Dokument **Autoren**.

## Lizenz

PolyForm Shield 1.0.0, Volltext in der Datei `LICENSE`. Sie dürfen die Software kostenlos nutzen, für Ihre Praxis anpassen und weitergeben. Nicht erlaubt ist, sie oder eine veränderte Fassung als Produkt oder Dienst anzubieten, der mit Nurvo konkurriert, auch nicht kostenlos. Der Quellcode ist offen, eine Open-Source-Lizenz im Sinne der Open Source Initiative ist das aber nicht. Der Name Nurvo und das Logo sind von der Lizenz nicht umfasst.
