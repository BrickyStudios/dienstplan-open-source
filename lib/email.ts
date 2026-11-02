import { Resend } from "resend";
import { escHtml } from "./utils";
import { absoluteUrl } from "./site-url";
function getResend() {
    return new Resend(process.env.RESEND_API_KEY);
}
export async function sendInviteEmail({ to, staffName, facilityName, code, siteUrl, }: {
    to: string;
    staffName: string;
    facilityName: string;
    code: string;
    siteUrl: string;
}) {
    const safeName = escHtml(staffName);
    const safeFacilityName = escHtml(facilityName);
    const safeCode = escHtml(code);
    const registerUrl = `${siteUrl}/register?invite_code=${encodeURIComponent(code)}`;
    const { error } = await getResend().emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Nurvo <einladung@nurvo.app>",
        to,
        subject: `Deine Einladung zu Nurvo — ${facilityName}`,
        html: `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f8f7;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8f7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e0e0e8;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#0f766e;padding:28px 36px;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Nurv<span style="color:#5eead4;">o</span></span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 36px 28px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0b1c30;">Hallo ${safeName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#45464d;line-height:1.6;">
                Du wurdest zur Einrichtung <strong>${safeFacilityName}</strong> auf Nurvo eingeladen.<br/>
                Registriere dich jetzt und starte direkt.
              </p>

              <!-- Code box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#eef5f4;border:2px dashed #0f766e;border-radius:12px;padding:20px 24px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#0d9488;">Dein Einladungscode</p>
                    <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:4px;color:#0f766e;font-family:monospace;">${safeCode}</p>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr>
                  <td align="center">
                    <a href="${registerUrl}"
                       style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;">
                      Jetzt registrieren →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 4px;font-size:12px;color:#76777d;text-align:center;">
                Oder gehe zu <a href="${siteUrl}/register" style="color:#0f766e;">${siteUrl}/register</a>
                und gib den Code manuell ein.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f5f8f7;border-top:1px solid #e5eeff;padding:16px 36px;">
              <p style="margin:0;font-size:11px;color:#9999a8;line-height:1.5;">
                Diese Email wurde von Nurvo gesendet. Falls du keine Einladung erwartest, kannst du diese Email ignorieren.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });
    if (error)
        throw new Error(error.message);
}
export async function sendPlanChangeEmail({ to, staffName, facilityName, effectiveLabel, changes, }: {
    to: string;
    staffName: string;
    facilityName: string;
    effectiveLabel: string;
    changes: string[];
}) {
    const safeName = escHtml(staffName);
    const safeFacility = escHtml(facilityName);
    const safeEffective = escHtml(effectiveLabel);
    const items = changes.map(c => `<li style="margin:0 0 6px;font-size:14px;color:#45464d;">${escHtml(c)}</li>`).join("");
    const { error } = await getResend().emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Nurvo <einladung@nurvo.app>",
        to,
        subject: `Änderungen am Dienstplan ab ${effectiveLabel} — ${facilityName}`,
        html: `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f5f8f7;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e0e0e8;overflow:hidden;">
        <tr><td style="background:#0f766e;padding:28px 36px;"><span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Nurv<span style="color:#5eead4;">o</span></span></td></tr>
        <tr><td style="padding:36px 36px 28px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0b1c30;">Hallo ${safeName},</p>
          <p style="margin:0 0 20px;font-size:15px;color:#45464d;line-height:1.6;">
            in <strong>${safeFacility}</strong> ändert sich die Dienstplanung <strong>ab ${safeEffective}</strong>. Folgende Anpassungen wurden übernommen:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr><td style="background:#eef5f4;border-radius:12px;padding:18px 22px;">
              <ul style="margin:0;padding-left:18px;">${items}</ul>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#76777d;line-height:1.6;">Die Änderungen greifen automatisch ab dem genannten Monat. Du musst nichts tun.</p>
        </td></tr>
        <tr><td style="background:#f5f8f7;border-top:1px solid #e5eeff;padding:16px 36px;">
          <p style="margin:0;font-size:11px;color:#9999a8;line-height:1.5;">Diese Benachrichtigung wurde automatisch von Nurvo gesendet.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
    if (error)
        throw new Error(error.message);
}
export async function sendNewDeviceEmail({ to, userName, deviceName, facility, }: {
    to: string;
    userName: string;
    deviceName: string;
    facility: string;
}) {
    const safeUserName = escHtml(userName);
    const safeDeviceName = escHtml(deviceName);
    const safeFacility = escHtml(facility);
    const { error } = await getResend().emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Nurvo <einladung@nurvo.app>",
        to,
        subject: "Neues Gerät hat sich bei deinem Nurvo-Konto angemeldet",
        html: `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f8f7;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8f7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e0e0e8;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#0f766e;padding:28px 36px;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Nurv<span style="color:#5eead4;">o</span></span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 36px 28px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0b1c30;">Hallo ${safeUserName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#45464d;line-height:1.6;">
                Ein neues Gerät hat sich gerade bei deinem Nurvo-Konto angemeldet.
              </p>

              <!-- Device box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#eef5f4;border:2px solid #0f766e;border-radius:12px;padding:20px 24px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#0d9488;">Gerät</p>
                    <p style="margin:0;font-size:17px;font-weight:600;color:#0f766e;">${safeDeviceName}</p>
                    <p style="margin:6px 0 0;font-size:13px;color:#0d9488;">${safeFacility}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:14px;color:#45464d;line-height:1.6;">
                Falls du das warst, musst du nichts weiter tun.<br/>
                Falls du dich nicht erkennst, ändere bitte sofort dein Passwort.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f5f8f7;border-top:1px solid #e5eeff;padding:16px 36px;">
              <p style="margin:0;font-size:11px;color:#9999a8;line-height:1.5;">
                Diese Benachrichtigung wurde automatisch von Nurvo gesendet.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });
    if (error)
        throw new Error(error.message);
}
export async function sendWebsiteContactAck({ to, name }: {
    to: string;
    name?: string;
}) {
    const greeting = name?.trim() ? `Hallo ${escHtml(name.trim().split(" ")[0])},` : "Hallo,";
    const from = process.env.RESEND_CONTACT_FROM
        ?? process.env.RESEND_FROM_EMAIL
        ?? "Lilian Schiffer · Nurvo <kontakt@nurvo.app>";
    const { error } = await getResend().emails.send({
        from,
        to,
        subject: "Ihre Nachricht ist bei mir angekommen — Nurvo",
        html: `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f5f8f7;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e0e0e8;overflow:hidden;">
        <tr><td style="background:#0f766e;padding:28px 36px;">
          <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Nurv<span style="color:#5eead4;">o</span></span>
        </td></tr>
        <tr><td style="padding:36px 36px 28px;">
          <p style="margin:0 0 16px;font-size:16px;color:#0b1c30;line-height:1.6;">${greeting}</p>
          <p style="margin:0 0 16px;font-size:15px;color:#45464d;line-height:1.7;">
            vielen Dank für Ihre Nachricht — sie ist bei mir angekommen. Ich schaue mir Ihr Anliegen
            persönlich an und <strong>antworte Ihnen in Kürze direkt von mir</strong>, in der Regel
            innerhalb eines Werktages.
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#45464d;line-height:1.7;">
            Diese kurze Eingangsbestätigung ist automatisch — meine persönliche Antwort auf Ihre Frage
            folgt separat.
          </p>
          <p style="margin:0;font-size:15px;color:#0b1c30;line-height:1.6;">
            Viele Grüße<br/>
            <strong>Lilian Schiffer</strong><br/>
            <span style="color:#76777d;font-size:13px;">Technischer Leiter · Nurvo</span>
          </p>
        </td></tr>
        <tr><td style="background:#f5f8f7;border-top:1px solid #e5eeff;padding:16px 36px;">
          <p style="margin:0;font-size:11px;color:#9999a8;line-height:1.5;">
            Sie erhalten diese E-Mail, weil Sie uns über das Kontaktformular auf nurvo.app geschrieben haben.
            Ihre Adresse nutzen wir ausschließlich zur Beantwortung Ihrer Anfrage.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
    if (error)
        throw new Error(error.message);
}
export async function sendShiftAssignedEmail({ to, staffName, facilityName, dateLabel, shiftLabel, station, timeLabel, reason, isOvertime, }: {
    to: string;
    staffName: string;
    facilityName: string;
    dateLabel: string;
    shiftLabel: string;
    station: string;
    timeLabel: string;
    reason: string;
    isOvertime: boolean;
}) {
    const s = {
        name: escHtml(staffName), facility: escHtml(facilityName), date: escHtml(dateLabel),
        shift: escHtml(shiftLabel), station: escHtml(station), time: escHtml(timeLabel), reason: escHtml(reason),
    };
    const { error } = await getResend().emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Nurvo <einladung@nurvo.app>",
        to,
        subject: `Neue Schicht am ${dateLabel}: ${shiftLabel}, ${station}`,
        html: `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f5f8f7;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e0e0e8;overflow:hidden;">
        <tr><td style="background:#0f766e;padding:28px 36px;"><span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Nurv<span style="color:#5eead4;">o</span></span></td></tr>
        <tr><td style="padding:36px 36px 28px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0b1c30;">Hallo ${s.name},</p>
          <p style="margin:0 0 20px;font-size:15px;color:#45464d;line-height:1.6;">
            du wurdest in <strong>${s.facility}</strong> für eine Schicht eingeteilt.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr><td style="background:#eef5f4;border-radius:12px;padding:20px 22px;">
              <p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#0b1c30;">${s.date}</p>
              <p style="margin:0 0 4px;font-size:15px;color:#0b1c30;">${s.shift} · ${s.time}</p>
              <p style="margin:0;font-size:14px;color:#45464d;">${s.station}</p>
            </td></tr>
          </table>
          <p style="margin:0 0 16px;font-size:14px;color:#45464d;line-height:1.6;">${s.reason}</p>
          ${isOvertime ? `<p style="margin:0 0 16px;font-size:13px;color:#92400e;background:#fef3c7;border-radius:8px;padding:10px 14px;">Diese Schicht wird als <strong>Überstunde</strong> erfasst.</p>` : ""}
          <p style="margin:0 0 20px;font-size:14px;color:#45464d;line-height:1.6;">
            <a href="${absoluteUrl("/mein-plan")}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">Meinen Plan öffnen</a>
          </p>
          <p style="margin:0;font-size:13px;color:#76777d;line-height:1.6;">
            Passt das nicht? Melde dich so früh wie möglich bei deiner Leitung — dann wird umgeplant.
          </p>
        </td></tr>
        <tr><td style="background:#f5f8f7;border-top:1px solid #e5eeff;padding:16px 36px;">
          <p style="margin:0;font-size:11px;color:#9999a8;line-height:1.5;">Diese Benachrichtigung wurde automatisch von Nurvo gesendet.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
    if (error)
        throw new Error(error.message);
}
export async function sendCertificateReminderEmail({ to, staffName, certName, expiryLabel, daysLeft, stage, }: {
    to: string;
    staffName: string;
    certName: string;
    expiryLabel: string;
    daysLeft: number;
    stage: "soon" | "urgent" | "expired";
}) {
    const s = { name: escHtml(staffName), cert: escHtml(certName), expiry: escHtml(expiryLabel) };
    const subject = stage === "expired"
        ? `Zertifikat abgelaufen: ${certName}`
        : stage === "urgent"
            ? `Zertifikat läuft bald ab (${daysLeft} Tage): ${certName}`
            : `Zertifikat läuft in ${daysLeft} Tagen ab: ${certName}`;
    const badge = stage === "expired"
        ? { bg: "#fee2e2", border: "#dc2626", text: "#991b1b", label: `Am ${s.expiry} abgelaufen` }
        : stage === "urgent"
            ? { bg: "#fef3c7", border: "#d97706", text: "#92400e", label: `Läuft in ${daysLeft} Tagen ab (${s.expiry})` }
            : { bg: "#eef5f4", border: "#0f766e", text: "#0f766e", label: `Läuft in ${daysLeft} Tagen ab (${s.expiry})` };
    const intro = stage === "expired"
        ? `dein Zertifikat <strong>${s.cert}</strong> ist abgelaufen. Bitte kümmere dich zeitnah um die Erneuerung.`
        : `dein Zertifikat <strong>${s.cert}</strong> läuft bald ab. Bitte kümmere dich rechtzeitig um die Erneuerung.`;
    const { error } = await getResend().emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Nurvo <einladung@nurvo.app>",
        to,
        subject,
        html: `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f5f8f7;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e0e0e8;overflow:hidden;">
        <tr><td style="background:#0f766e;padding:28px 36px;"><span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Nurv<span style="color:#5eead4;">o</span></span></td></tr>
        <tr><td style="padding:36px 36px 28px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0b1c30;">Hallo ${s.name},</p>
          <p style="margin:0 0 20px;font-size:15px;color:#45464d;line-height:1.6;">${intro}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr><td style="background:${badge.bg};border:2px solid ${badge.border};border-radius:12px;padding:18px 22px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:${badge.text};">${s.cert}</p>
              <p style="margin:0;font-size:16px;font-weight:700;color:${badge.text};">${badge.label}</p>
            </td></tr>
          </table>
          <p style="margin:0 0 20px;">
            <a href="${absoluteUrl("/meine-zertifikate")}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">Meine Zertifikate ansehen</a>
          </p>
          <p style="margin:0;font-size:13px;color:#76777d;line-height:1.6;">Reiche das erneuerte Zertifikat bei deiner Leitung ein, sobald es vorliegt.</p>
        </td></tr>
        <tr><td style="background:#f5f8f7;border-top:1px solid #e5eeff;padding:16px 36px;">
          <p style="margin:0;font-size:11px;color:#9999a8;line-height:1.5;">Diese Benachrichtigung wurde automatisch von Nurvo gesendet.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
    if (error)
        throw new Error(error.message);
}
export async function sendMonthlyPlanEmail({ to, staffName, facilityName, monthLabel, shiftCount, firstShiftLabel, }: {
    to: string;
    staffName: string;
    facilityName: string;
    monthLabel: string;
    shiftCount: number;
    firstShiftLabel: string | null;
}) {
    const s = {
        name: escHtml(staffName), facility: escHtml(facilityName), month: escHtml(monthLabel),
        first: firstShiftLabel ? escHtml(firstShiftLabel) : null,
    };
    const { error } = await getResend().emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Nurvo <einladung@nurvo.app>",
        to,
        subject: `Dein Dienstplan für ${monthLabel} steht`,
        html: `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f5f8f7;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e0e0e8;overflow:hidden;">
        <tr><td style="background:#0f766e;padding:28px 36px;"><span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Nurv<span style="color:#5eead4;">o</span></span></td></tr>
        <tr><td style="padding:36px 36px 28px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0b1c30;">Hallo ${s.name},</p>
          <p style="margin:0 0 20px;font-size:15px;color:#45464d;line-height:1.6;">
            der Dienstplan für <strong>${s.month}</strong> in ${s.facility} ist fertig.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr><td style="background:#eef5f4;border-radius:12px;padding:20px 22px;">
              <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#0b1c30;">${shiftCount} ${shiftCount === 1 ? "Schicht" : "Schichten"}</p>
              ${s.first ? `<p style="margin:0;font-size:14px;color:#45464d;">Erste Schicht: ${s.first}</p>` : ""}
            </td></tr>
          </table>
          <p style="margin:0 0 20px;">
            <a href="${absoluteUrl("/mein-plan")}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">Meinen Plan ansehen</a>
          </p>
          <p style="margin:0;font-size:13px;color:#76777d;line-height:1.6;">
            Passt etwas nicht? Sprich deine Leitung an oder biete die Schicht im Schichttausch an.
          </p>
        </td></tr>
        <tr><td style="background:#f5f8f7;border-top:1px solid #e5eeff;padding:16px 36px;">
          <p style="margin:0;font-size:11px;color:#9999a8;line-height:1.5;">Diese Benachrichtigung wurde automatisch von Nurvo gesendet.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
    if (error)
        throw new Error(error.message);
}
export async function sendNotfallEmail({ to, staffName, facilityName, titel, nachricht, schicht, }: {
    to: string;
    staffName: string;
    facilityName: string;
    titel: string;
    nachricht: string;
    schicht: string | null;
}) {
    const s = {
        name: escHtml(staffName), facility: escHtml(facilityName), titel: escHtml(titel),
        nachricht: escHtml(nachricht).replace(/\n/g, "<br>"), schicht: schicht ? escHtml(schicht) : "",
    };
    const { error } = await getResend().emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Nurvo <einladung@nurvo.app>",
        to,
        subject: `Notfall in ${facilityName}: ${titel}`,
        html: `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f5f8f7;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e0e0e8;overflow:hidden;">
        <tr><td style="background:#0f766e;padding:28px 36px;"><span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Nurv<span style="color:#5eead4;">o</span></span></td></tr>
        <tr><td style="padding:36px 36px 28px;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#b91c1c;">Notfall · ${s.facility}</p>
          <p style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0b1c30;">${s.titel}</p>
          <p style="margin:0 0 16px;font-size:15px;color:#45464d;line-height:1.6;">Hallo ${s.name},</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr><td style="background:#fef2f2;border-left:4px solid #b91c1c;border-radius:8px;padding:18px 20px;">
              <p style="margin:0;font-size:15px;color:#0b1c30;line-height:1.6;">${s.nachricht}</p>
            </td></tr>
          </table>
          ${s.schicht ? `<p style="margin:0 0 16px;font-size:14px;color:#45464d;">Ihre Schicht: <strong>${s.schicht}</strong></p>` : ""}
          <p style="margin:0 0 20px;font-size:14px;color:#45464d;line-height:1.6;">
            <a href="${absoluteUrl("/mein-plan")}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">Meinen Plan öffnen</a>
          </p>
          <p style="margin:0;font-size:13px;color:#76777d;line-height:1.6;">
            Rückfragen bitte direkt an die Leitung.
          </p>
        </td></tr>
        <tr><td style="background:#f5f8f7;border-top:1px solid #e5eeff;padding:16px 36px;">
          <p style="margin:0;font-size:11px;color:#9999a8;line-height:1.5;">Diese Nachricht wurde über eine Notfall-Vorlage in Nurvo ausgelöst.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
    if (error)
        throw new Error(error.message);
}
