---
pdf: Nurvo-Community-Sicherheit
art: Sicherheitsrichtlinie
titel: Sicherheit
untertitel: Sicherheitslücken melden und die eigene Installation absichern
empfaenger: alle, die die Nurvo Community Edition betreiben, prüfen oder verändern
stand: 02.11.2026
vertraulichkeit: Öffentlich
absender: Nurvo (in Gründung)
kolophon: |
  Nurvo Community Edition, AGPL-3.0. Quelle dieses Dokuments: fuer-ki/SECURITY.md
  im Repository. Ergänzend gilt der Haftungsausschluss (Abschnitte 5 und 6).
---

## Sicherheitslücke gefunden?

Melden Sie Sicherheitslücken bitte **nicht** als öffentliches Issue auf GitHub. Schreiben Sie
vertraulich an die Kontaktadresse im Impressum von
[www.nurvo.de/impressum](https://www.nurvo.de/impressum).

Hilfreich in der Meldung sind: die betroffene Stelle (Seite, Schnittstelle oder Datei), die
Schritte, mit denen sich die Lücke nachvollziehen lässt, und die Fassung, die Sie geprüft
haben (Datum des Downloads oder Commit).

## Wer für eine Installation verantwortlich ist

Für selbst betriebene Installationen ist der **Betreiber** verantwortlich, nicht Nurvo.
Nurvo hat keinen Zugriff auf diese Installationen und die darin gespeicherten Daten.

Das heißt für den Betrieb:

- **Updates zeitnah einspielen.** Wie das geht, steht in der Anleitung „Nurvo Community
  Edition einrichten“, Abschnitt „Updates einspielen“.
- **Den Schlüssel `service_role` geheim halten.** Er hat vollen Zugriff auf alle Daten und
  gehört nur in die Umgebungsvariablen des Servers, nie in den Code, eine E-Mail oder die
  Website.
- **Nur über HTTPS** erreichbar machen und starke Passwörter verwenden.
- **Datensicherungen** einrichten und gelegentlich prüfen, ob sie sich zurückspielen lassen.
