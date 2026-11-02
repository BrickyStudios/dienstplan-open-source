// Erzeugt die Supabase-Mailvorlagen aus einem gemeinsamen Rahmen.
//
//   node supabase/email-vorlagen/bauen.mjs
//
// Supabase haelt die Vorlagen nur im Dashboard (Auth → Emails → Templates). Damit
// sie nicht verloren gehen und alle gleich aussehen, entstehen sie hier und werden
// von Hand dort eingefuegt. Geaendert wird diese Datei, nie die .html direkt.
//
// Tatsaechlich verschickt wird heute nur „Confirm sign up" — die App nutzt weder
// Einladungs- noch Magic-Link- noch Passwort-Mails (Passwort-Reset laeuft ueber die
// Wiederherstellungs-Phrase). Die uebrigen stehen trotzdem auf Deutsch bereit, damit
// keine englische Supabase-Mail rausgeht, falls ein Weg doch einmal ausgeloest wird.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));

const SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
// Geschuetzte Bindestriche: Auf dem Handy brach „E-Mail" sonst nach dem „E-" um.
const EMAIL = "E&#8209;Mail";

function codeFeld(beschriftung) {
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background:#EDF4F2;border-radius:10px;padding:26px 16px;">
                    <div style="margin:0 0 8px;font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#0E5C55;">
                      ${beschriftung}
                    </div>
                    <div style="font-family:'SFMono-Regular',Consolas,'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:#0E5C55;">
                      {{ .Token }}
                    </div>
                  </td>
                </tr>
              </table>`;
}

function knopf(text) {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#0E5C55;border-radius:10px;">
                    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">${text}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:#66706E;">
                Funktioniert die Schaltfläche nicht? Kopieren Sie diese Adresse in Ihren Browser:<br>
                <a href="{{ .ConfirmationURL }}" style="color:#0E5C55;word-break:break-all;">{{ .ConfirmationURL }}</a>
              </p>`;
}

function absatz(text, unten = 28) {
  return `
              <p style="margin:0 0 ${unten}px;font-family:${SANS};font-size:15px;line-height:1.6;color:#4E5755;">
                ${text}
              </p>`;
}

function hinweis(text) {
  return `
              <p style="margin:24px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:#66706E;">
                ${text}
              </p>`;
}

function rahmen({ betreff, vorschau, ueberschrift, inhalt, fuss }) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${betreff}</title>
</head>
<body style="margin:0;padding:0;background:#F2F1EC;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F2F1EC;">${vorschau}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F2F1EC;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

          <tr>
            <td style="padding:0 4px 20px;font-family:${SERIF};font-size:26px;font-weight:600;letter-spacing:-0.5px;color:#1A1D1C;">
              Nurv<span style="color:#14B8A6;">o</span>
            </td>
          </tr>

          <tr>
            <td style="background:#FAF9F6;border:1px solid #E3E1DA;border-radius:14px;padding:40px 36px 36px;">
              <h1 style="margin:0 0 12px;font-family:${SERIF};font-size:26px;line-height:1.25;font-weight:600;letter-spacing:-0.3px;color:#1A1D1C;">
                ${ueberschrift}
              </h1>${inhalt}
            </td>
          </tr>

          <tr>
            <td style="padding:24px 4px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:#66706E;">
              ${fuss}
              <br><br>
              Nurvo · Dienstplanung für Pflege und Klinik · <a href="https://www.nurvo.de" style="color:#0E5C55;text-decoration:none;">www.nurvo.de</a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

const vorlagen = [
  {
    datei: "1-bestaetigungscode.html",
    dashboard: "Confirm sign up",
    betreff: "Ihr Bestätigungscode für Nurvo",
    vorschau: "Ihr Code: {{ .Token }}",
    ueberschrift: `Bestätigen Sie Ihre ${EMAIL}&#8209;Adresse`,
    inhalt:
      absatz("Geben Sie diesen Code auf der Seite ein, auf der Sie sich gerade registriert haben. Danach ist Ihr Konto aktiv.") +
      codeFeld("Ihr Bestätigungscode") +
      hinweis(`Der Code gilt für <strong style="color:#4E5755;">{{ .Email }}</strong> und läuft nach kurzer Zeit ab. Ist er abgelaufen, fordern Sie auf der Anmeldeseite einfach einen neuen an.`),
    fuss: "Sie haben sich nicht bei Nurvo registriert? Dann können Sie diese Mail ignorieren – ohne den Code passiert nichts.",
  },
  {
    datei: "2-einladung.html",
    dashboard: "Invite user",
    betreff: "Sie wurden zu Nurvo eingeladen",
    vorschau: "Nehmen Sie die Einladung an und legen Sie Ihr Passwort fest.",
    ueberschrift: "Sie wurden zu Nurvo eingeladen",
    inhalt:
      absatz("Ihre Einrichtung plant Dienste mit Nurvo und hat Ihnen einen Zugang eingerichtet. Nehmen Sie die Einladung an und legen Sie Ihr Passwort fest.") +
      knopf("Einladung annehmen") +
      hinweis(`Die Einladung gilt für <strong style="color:#4E5755;">{{ .Email }}</strong> und ist nur eine begrenzte Zeit gültig. Ist sie abgelaufen, bitten Sie Ihre Leitung um eine neue.`),
    fuss: "Sie erwarten keine Einladung? Dann können Sie diese Mail ignorieren – ohne Ihre Bestätigung wird kein Zugang aktiv.",
  },
  {
    datei: "3-anmeldelink.html",
    dashboard: "Magic link",
    betreff: "Ihr Anmeldelink für Nurvo",
    vorschau: "Mit einem Klick anmelden – oder mit dem Code {{ .Token }}.",
    ueberschrift: "Bei Nurvo anmelden",
    inhalt:
      absatz("Melden Sie sich mit einem Klick an. Der Link funktioniert nur einmal.") +
      knopf("Jetzt anmelden") +
      hinweis("Alternativ können Sie diesen Code eingeben: <strong style=\"color:#4E5755;letter-spacing:2px;\">{{ .Token }}</strong>"),
    fuss: "Sie haben keine Anmeldung angefordert? Dann können Sie diese Mail ignorieren – Ihr Konto bleibt unverändert.",
  },
  {
    datei: "4-email-aendern.html",
    dashboard: "Change email address",
    betreff: "Bestätigen Sie Ihre neue E-Mail-Adresse",
    vorschau: "Bitte bestätigen Sie die Änderung Ihrer E-Mail-Adresse bei Nurvo.",
    ueberschrift: `Neue ${EMAIL}&#8209;Adresse bestätigen`,
    inhalt:
      absatz(`Für Ihr Nurvo-Konto wurde eine Änderung der ${EMAIL}&#8209;Adresse angefordert – von <strong style="color:#1A1D1C;">{{ .Email }}</strong> zu <strong style="color:#1A1D1C;">{{ .NewEmail }}</strong>. Bitte bestätigen Sie die Änderung.`) +
      knopf("Änderung bestätigen"),
    fuss: "Sie haben diese Änderung nicht angefordert? Dann ignorieren Sie diese Mail und informieren Sie Ihre Leitung – Ihre bisherige Adresse bleibt bestehen.",
  },
  {
    datei: "5-passwort-zuruecksetzen.html",
    dashboard: "Reset password",
    betreff: "Passwort für Nurvo zurücksetzen",
    vorschau: "Legen Sie ein neues Passwort für Ihr Nurvo-Konto fest.",
    ueberschrift: "Neues Passwort festlegen",
    inhalt:
      absatz(`Für das Nurvo-Konto <strong style="color:#1A1D1C;">{{ .Email }}</strong> wurde ein neues Passwort angefordert. Über die Schaltfläche legen Sie es fest.`) +
      knopf("Passwort festlegen") +
      hinweis("Der Link funktioniert nur einmal und läuft nach kurzer Zeit ab."),
    fuss: "Sie haben kein neues Passwort angefordert? Dann können Sie diese Mail ignorieren – Ihr bisheriges Passwort bleibt gültig.",
  },
  {
    datei: "6-erneut-bestaetigen.html",
    dashboard: "Reauthentication",
    betreff: "Ihr Sicherheitscode für Nurvo",
    vorschau: "Ihr Code: {{ .Token }}",
    ueberschrift: "Bestätigen Sie, dass Sie es sind",
    inhalt:
      absatz("Für eine geschützte Änderung an Ihrem Konto brauchen wir eine kurze Bestätigung. Geben Sie dazu diesen Code ein.") +
      codeFeld("Ihr Sicherheitscode") +
      hinweis("Der Code läuft nach kurzer Zeit ab."),
    fuss: "Sie haben nichts geändert? Dann ignorieren Sie diese Mail und ändern Sie zur Sicherheit Ihr Passwort.",
  },
];

for (const v of vorlagen) {
  writeFileSync(join(hier, v.datei), rahmen(v));
  console.log(`${v.datei.padEnd(30)} → ${v.dashboard.padEnd(22)} Betreff: ${v.betreff}`);
}
