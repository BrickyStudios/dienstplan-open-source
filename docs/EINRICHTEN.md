---
pdf: Nurvo-Community-Einrichten
art: Anleitung
titel: Nurvo Community Edition einrichten
untertitel: Der eigene Dienstplan für Ihre Praxis, in rund 30 Minuten
empfaenger: Praxisinhaber, Praxismanagement und IT-Dienstleister von Arztpraxen und MVZ
stand: 02.11.2026
vertraulichkeit: Öffentlich
absender: Nurvo (in Gründung)
kolophon: |
  Nurvo Community Edition, AGPL-3.0. Entwickelt von Lilian Philipp Schiffer
  und dem Nurvo-Team. Quelle dieser Anleitung: docs/EINRICHTEN.md im Repository.
  Die gehostete Version mit App, KI und Betrieb durch uns: www.nurvo.de
---

## Worum es geht

Die Nurvo Community Edition ist ein kostenloser Dienstplan für Arztpraxen und MVZ. Sie läuft
als Web-App unter einer Adresse Ihrer Praxis, zum Beispiel `dienstplan.ihre-praxis.de`.
Leitung und Team melden sich dort mit dem eigenen Konto an, im Browser, am Rechner wie am
Handy.

Am Ende dieser Anleitung haben Sie:

1. eine eigene Datenbank für die Dienstplandaten,
2. die Web-App, die mit dieser Datenbank spricht,
3. eine Adresse Ihrer Praxis, unter der beides erreichbar ist,
4. den ersten Zugang für die Praxisleitung.

Wie Sie die Web-App von Ihrer Praxis-Website aus verlinken oder dort einbetten, steht in der
zweiten Anleitung: **Nurvo an die eigene Website anbinden**.

> **Wichtig vorab:** Die Community Edition ruft keinen Nurvo-Server auf. Es gibt keinen
> Nurvo-Lizenzschlüssel. Die Schlüssel, die Sie unten eintragen, gehören zu **Ihrer eigenen**
> Datenbank. Nurvo sieht Ihre Daten nicht.

## Was Sie brauchen

| | Wofür | Kosten |
|---|---|---|
| GitHub-Konto | eine eigene Kopie des Codes | kostenlos |
| Supabase-Konto | die Datenbank und die Anmeldung | kostenloser Einstiegstarif |
| Vercel-Konto | die Web-App betreiben | kostenloser Einstiegstarif |
| Ihre Domain | eine Adresse wie `dienstplan.ihre-praxis.de` | haben Sie meist schon |

Wer lieber einen eigenen Server betreibt, nimmt statt Supabase-Cloud und Vercel den Weg mit
Docker. Er steht kurz am Ende und ausführlich in `selfhost/README.md`.

## Schritt 1: Eigene Kopie des Codes anlegen

Öffnen Sie das Repository auf GitHub und klicken Sie oben rechts auf **Fork**. Danach liegt
eine Kopie in Ihrem eigenen GitHub-Konto. Mit dieser Kopie arbeiten alle folgenden Schritte.

## Schritt 2: Datenbank anlegen

1. Bei [supabase.com](https://supabase.com) anmelden und **New project** wählen.
2. Als Region **Frankfurt (eu-central-1)** wählen. So bleiben die Daten in der EU.
3. Ein sicheres Datenbank-Passwort vergeben und an einem sicheren Ort ablegen.
4. Im Projekt links den **SQL Editor** öffnen.
5. Die Datei `supabase/schema.sql` aus Ihrer Kopie öffnen, den gesamten Inhalt kopieren, in
   den SQL Editor einfügen und **Run** klicken.

Damit stehen alle Tabellen, Rollen und Zugriffsregeln, die Nurvo braucht.

## Schritt 3: Die drei Schlüssel abholen

Im Supabase-Projekt unter **Project Settings → API** stehen drei Werte. Kopieren Sie sie
in eine Notiz, Sie brauchen sie gleich:

| Name in Supabase | Was es ist |
|---|---|
| **Project URL** | die Adresse Ihrer Datenbank |
| **anon public** | der öffentliche Schlüssel, den der Browser benutzt |
| **service_role** | der geheime Schlüssel für den Server |

> Der Schlüssel **service_role** hat vollen Zugriff auf alle Daten. Er gehört nur in die
> Einstellungen von Vercel, nie in eine E-Mail, nie auf die Website, nie in den Code.

## Schritt 4: Die eine Stelle, an der alles eingetragen wird

Alles, was Nurvo wissen muss, steht an einer Stelle: in den **Umgebungsvariablen** bei
Vercel. Es gibt keine weitere Konfigurationsdatei, die Sie bearbeiten müssen.

1. Bei [vercel.com](https://vercel.com) mit dem GitHub-Konto anmelden.
2. **Add New → Project** wählen und Ihre Kopie von `dienstplan-open-source` importieren.
3. Vor dem ersten Start unter **Environment Variables** diese vier Werte eintragen:

| Variable | Wert |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | die **Project URL** aus Schritt 3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | der Schlüssel **anon public** |
| `SUPABASE_SERVICE_ROLE_KEY` | der Schlüssel **service_role** |
| `NEXT_PUBLIC_SITE_URL` | die spätere Adresse, z. B. `https://dienstplan.ihre-praxis.de` |

Danach **Deploy** klicken. Nach wenigen Minuten läuft die Web-App unter einer Vercel-Adresse.

Optional, aber empfohlen: Damit Einladungen und Passwort-Mails ankommen, zusätzlich einen
Mail-Dienst eintragen.

| Variable | Wert |
|---|---|
| `RESEND_API_KEY` | API-Schlüssel Ihres Mail-Dienstes |
| `RESEND_FROM_EMAIL` | Absender, z. B. `Praxis Dr. Muster <dienstplan@ihre-praxis.de>` |

Ändern Sie später einen Wert, wählen Sie bei Vercel **Redeploy**. Erst dann gilt er.

## Schritt 5: Die Adresse Ihrer Praxis verbinden

1. Bei Vercel im Projekt **Settings → Domains** öffnen und `dienstplan.ihre-praxis.de`
   eintragen.
2. Vercel zeigt einen **CNAME**-Eintrag an. Diesen beim Anbieter Ihrer Domain (IONOS,
   Strato, INWX, …) in der DNS-Verwaltung anlegen.
3. In Supabase unter **Authentication → URL Configuration** dieselbe Adresse als
   **Site URL** eintragen. Sonst führen die Links in Passwort-Mails ins Leere.

Nach ein paar Minuten ist der Dienstplan unter Ihrer Adresse erreichbar, mit
HTTPS-Verschlüsselung.

## Schritt 6: Den ersten Zugang für die Leitung anlegen

Nurvo vergibt Zugänge über Einladungscodes. Den ersten Code erzeugen Sie einmal von Hand.
Dafür brauchen Sie Node.js auf Ihrem Rechner:

```bash
SUPABASE_URL=<Project URL> SERVICE_ROLE_KEY=<service_role> \
  node selfhost/scripts/erste-praxis.mjs "Praxis Dr. Muster"
```

Das Skript legt die Praxis an und gibt einen Code der Form `NRV-L-…` aus. Die Praxisleitung
öffnet `https://dienstplan.ihre-praxis.de/register`, gibt den Code ein und legt ihr Konto an.
Der Code gilt sieben Tage.

## Schritt 7: Das Team einladen

Ab jetzt läuft alles in der Web-App. Die Leitung lädt das Team ein, jede Person bekommt einen
eigenen Einladungscode und meldet sich damit ebenfalls unter `/register` an.

| Wer | Was er oder sie sieht |
|---|---|
| **Leitung** | Dienstplan, Mitarbeitende, Urlaub, Wünsche, Regelprüfung |
| **Mitarbeitende** | den eigenen Plan, Urlaubsanträge, Wünsche, Zeiterfassung |

Die Anmeldung ist für alle dieselbe Seite: `https://dienstplan.ihre-praxis.de/login`.

## Updates einspielen

Neue Fassungen erscheinen im Original-Repository. In Ihrer Kopie auf GitHub **Sync fork**
klicken, Vercel baut danach selbst neu. Steht in den Release-Notizen eine Datenbank-Änderung,
die SQL-Datei wie in Schritt 2 im SQL Editor ausführen.

## Datenschutz: Was bei Ihnen liegt

Wer Nurvo selbst betreibt, ist für die Daten verantwortlich, nicht Nurvo. Für die Praxis
heißt das:

- Mit Supabase und Vercel je einen **Auftragsverarbeitungsvertrag** abschließen. Beide bieten
  ihn im Konto an.
- **Backups** einrichten. Der kostenlose Supabase-Tarif sichert nicht dauerhaft.
- Mitarbeitende und, falls vorhanden, den Betriebsrat informieren, bevor der Plan
  eingeführt wird.
- Die Regelprüfung (Ruhezeit, Höchstarbeitszeit, Urlaub) ist eine Hilfe beim Planen. Sie
  ersetzt keine Rechtsberatung. Den vollständigen Haftungsausschluss enthält
  `HAFTUNGSAUSSCHLUSS.md` im Repository.

## Alternative: Eigener Server mit Docker

Für Praxen mit eigenem Server oder IT-Dienstleister: Nurvo läuft auch komplett auf einem
Linux-Server mit Docker, mit dem quelloffenen Supabase-Stack daneben. Dann verlässt kein
Datensatz Ihren Server. Die Schritte stehen in `selfhost/README.md`.

## Wenn Sie es nicht selbst betreiben wollen

Die Community Edition ist für alle, die gern selbst Hand anlegen. Wer das nicht will, bucht
Nurvo gehostet: Wir betreiben Server, Backups und Updates in Deutschland, richten den Plan
mit Ihnen per Video ein und übernehmen Ihren bisherigen Dienstplan.

| | Community Edition | Nurvo gehostet |
|---|---|---|
| Dienstplan mit Regelprüfung | ✓ | ✓ |
| Mitarbeiter-Ansicht im Browser | ✓ | ✓ |
| Native App für Windows | | ✓ |
| KI-Copilot und Ausfall-Autopilot | | ✓ |
| Lohnabrechnung, Personalakte, Notfallplan | | ✓ |
| Betrieb, Backups, Updates, Support | selbst | Nurvo |

**Mehr unter [www.nurvo.de](https://www.nurvo.de)**
