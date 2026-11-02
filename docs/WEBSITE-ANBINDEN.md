---
pdf: Nurvo-Community-Website-anbinden
art: Anleitung
titel: Nurvo an die eigene Website anbinden
untertitel: Ein Knopf auf der Praxis-Website, und das Team meldet sich an
empfaenger: Praxisinhaber, Praxismanagement und alle, die die Praxis-Website pflegen
stand: 01.11.2026
vertraulichkeit: Öffentlich
absender: Nurvo (in Gründung)
kolophon: |
  Nurvo Community Edition, AGPL-3.0. Entwickelt von Lilian Philipp Schiffer
  und dem Nurvo-Team. Quelle dieser Anleitung: docs/WEBSITE-ANBINDEN.md im Repository.
  Die gehostete Version mit App, KI und Betrieb durch uns: www.nurvo.de
---

## Das Ergebnis

Auf Ihrer Praxis-Website steht ein Knopf **Dienstplan**. Wer ihn anklickt, landet auf der
Anmeldeseite von Nurvo unter Ihrer Adresse, zum Beispiel `dienstplan.ihre-praxis.de`.
Praxisleitung und Mitarbeitende melden sich dort mit ihrem eigenen Konto an.

Voraussetzung: Die Community Edition läuft bereits. Wie das geht, steht in der Anleitung
**Nurvo Community Edition einrichten**.

## Weg 1 (empfohlen): Ein Knopf, der auf den Dienstplan führt

Das funktioniert mit jedem Website-Baukasten und braucht keine Technik. Sie setzen einen
Link auf `https://dienstplan.ihre-praxis.de/login`.

| Baukasten | So geht es |
|---|---|
| **WordPress** | Seite bearbeiten → Block **Buttons** → Text „Dienstplan“ → Link einfügen |
| **Wix** | **Hinzufügen → Button** → **Link → Webadresse** → Link einfügen |
| **Jimdo** | **Element hinzufügen → Button** → Link einfügen |
| **IONOS, Strato** | im Editor einen Button oder Menüpunkt anlegen → externer Link |

Am besten im **Menü** oder im **Fußbereich** der Website, nicht auf der Startseite für
Patientinnen und Patienten. Dort sucht das Team ihn, und Patienten stolpern nicht darüber.

Wer HTML einfügen kann, nimmt diesen fertigen Knopf:

```html
<a href="https://dienstplan.ihre-praxis.de/login"
   style="display:inline-block;padding:12px 22px;border-radius:8px;
          background:#0E5C55;color:#fff;font:600 15px/1.2 sans-serif;
          text-decoration:none">
  Dienstplan · Nurvo
</a>
```

## Weg 2: Den Dienstplan direkt in die Website einbetten

Soll die Anmeldung innerhalb Ihrer Website erscheinen, geht das per iframe, aber nur unter
einer Bedingung: **Website und Dienstplan gehören zur selben Domain.**

| Website | Dienstplan | Einbetten |
|---|---|---|
| `www.praxis-muster.de` | `dienstplan.praxis-muster.de` | ✓ funktioniert |
| `praxis-muster.wixsite.com` | `dienstplan.praxis-muster.de` | ✗ die Anmeldung scheitert |

Der Grund: Browser sperren Anmelde-Cookies in Rahmen fremder Domains. Dann sieht das Team
zwar die Seite, kann sich aber nicht anmelden. In diesem Fall bleiben Sie bei Weg 1.

So wird eingebettet:

**Erstens:** Bei Vercel unter **Settings → Environment Variables** diese Variable ergänzen und
danach **Redeploy** wählen.

| Variable | Wert |
|---|---|
| `EMBED_ORIGINS` | `https://www.praxis-muster.de` |

Ohne diesen Eintrag verweigert Nurvo das Einbetten bewusst. Das schützt vor fremden Seiten,
die Ihren Dienstplan in einen Rahmen setzen.

**Zweitens:** Auf der Website an der gewünschten Stelle einen HTML-Block mit diesem Inhalt
einfügen:

```html
<iframe src="https://dienstplan.praxis-muster.de/login"
        title="Dienstplan"
        style="width:100%;height:800px;border:0"></iframe>
```

## Was nicht geht, und warum

**Den Dienstplan öffentlich zeigen, ohne Anmeldung.** Ein Dienstplan enthält Namen,
Arbeitszeiten und Abwesenheiten von Beschäftigten. Das sind personenbezogene Daten, die
nicht ins offene Netz gehören. Deshalb zeigt Nurvo den Plan nur nach der Anmeldung.

**Sprechzeiten für Patienten.** Die Öffnungszeiten der Praxis pflegen Sie weiter auf der
Website. Nurvo plant das Team, nicht den Patientenkalender.

## Häufige Fragen

**Muss das Team eine App installieren?** Nein. Die Web-App läuft im Browser, am Rechner und
am Handy. Wer sie am Handy wie eine App nutzen will, wählt im Browser **Zum Home-Bildschirm
hinzufügen**.

**Wer vergibt die Zugänge?** Die Praxisleitung, in der Web-App. Jede Person bekommt einen
eigenen Einladungscode.

**Steht auf der Anmeldeseite unser Praxisname?** Die Anmeldeseite trägt den Namen Nurvo,
den Namen Ihrer Praxis sieht das Team nach der Anmeldung. Der Name Nurvo und das Logo sind
nicht Teil der Open-Source-Lizenz und bleiben stehen.

## Lieber ohne Technik?

Wenn Ihnen Server, Domains und Updates zu viel sind: Nurvo gibt es auch fertig betrieben.
Wir hosten in Deutschland, richten den Plan per Video mit Ihnen ein und übernehmen Ihren
bisherigen Dienstplan. Dazu kommen die App, der KI-Copilot, die Lohnabrechnung und der
Notfallplan bei Ausfällen.

**Mehr unter [www.nurvo.de](https://www.nurvo.de)**
