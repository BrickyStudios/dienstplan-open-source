import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { escHtml } from "./utils";
import { siteUrl as resolveSiteUrl } from "@/lib/site-url";
type Admin = SupabaseClient<any>;
export type SickReportForRequest = {
    id: string;
    sick_date: string;
    shift_type: string | null;
    sick_staff_name: string | null;
    station: string | null;
};
type Agency = Record<string, any>;
export type NextRequestResult = {
    status: "sent" | "no_agencies" | "exhausted" | "already_accepted";
    agency?: string;
};
async function resolveLeitungName(admin: Admin, facilityName: string): Promise<string> {
    const { data } = await admin
        .from("user_profiles")
        .select("full_name")
        .eq("facility", facilityName)
        .eq("role", "leitung")
        .limit(1)
        .maybeSingle();
    return (data?.full_name as string) || facilityName;
}
async function sendOneAgencyRequest(admin: Admin, facilityName: string, leitungName: string, report: Omit<SickReportForRequest, "sick_staff_name">, agency: Agency): Promise<void> {
    const siteUrl = resolveSiteUrl();
    const resend = new Resend(process.env.RESEND_API_KEY);
    const sickDate = new Date(report.sick_date).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
    const shiftLabel = report.shift_type ? ` (${report.shift_type})` : "";
    const stationLabel = report.station ? ` auf ${report.station}` : "";
    const safeFacility = escHtml(facilityName);
    const safeLeitung = escHtml(leitungName);
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const acceptUrl = `${siteUrl}/external/respond?token=${token}&answer=accepted`;
    const declineUrl = `${siteUrl}/external/respond?token=${token}&answer=declined`;
    const { error: dbErr } = await admin.from("external_agency_requests").insert({
        sick_report_id: report.id,
        agency_id: agency.id,
        agency_name: agency.name,
        agency_email: agency.email,
        facility_name: facilityName,
        response_token: token,
        expires_at: expiresAt,
    });
    if (dbErr)
        return;
    const { error: mailFehler } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Nurvo <einladung@nurvo.app>",
        to: agency.email,
        subject: `Personalanfrage für ${sickDate} — ${facilityName}`,
        html: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f8f7;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e0e0e8;overflow:hidden;">
        <tr><td style="background:#0f766e;padding:28px 36px;">
          <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Nurv<span style="color:#5eead4;">o</span></span>
        </td></tr>
        <tr><td style="padding:36px 36px 28px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0b1c30;">Personalanfrage</p>
          <p style="margin:0 0 24px;font-size:15px;color:#45464d;line-height:1.6;">
            <strong>${safeFacility}</strong> (Leitung: ${safeLeitung}) benötigt kurzfristig Unterstützung:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="background:#eef5f4;border:2px solid #0f766e;border-radius:12px;padding:20px 24px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#0d9488;">Benötigt für</p>
              <p style="margin:0;font-size:18px;font-weight:700;color:#0f766e;">${escHtml(sickDate)}${escHtml(shiftLabel)}</p>
              ${report.station ? `<p style="margin:6px 0 0;font-size:14px;color:#0d9488;">${escHtml(stationLabel)}</p>` : ""}
            </td></tr>
          </table>
          <p style="margin:0 0 20px;font-size:15px;color:#45464d;">Können Sie an diesem Tag Personal bereitstellen?</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="48%" style="padding-right:8px;">
                <a href="${acceptUrl}" style="display:block;text-align:center;background:#0d9488;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px;border-radius:10px;">
                  ✓ Ja, wir kommen
                </a>
              </td>
              <td width="4%"></td>
              <td width="48%" style="padding-left:8px;">
                <a href="${declineUrl}" style="display:block;text-align:center;background:#f1f5f9;color:#64748b;text-decoration:none;font-size:15px;font-weight:600;padding:14px;border-radius:10px;border:1px solid #e2e8f0;">
                  Nein, leider nicht
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0;font-size:12px;color:#9999a8;">Diese Anfrage läuft in 24 Stunden ab.</p>
        </td></tr>
        <tr><td style="background:#f5f8f7;border-top:1px solid #e5eeff;padding:16px 36px;">
          <p style="margin:0;font-size:11px;color:#9999a8;">Gesendet von Nurvo — ${safeFacility}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
    if (mailFehler) {
        console.error(`[external-agencies] Anfrage an ${agency.name} NICHT zugestellt —`, mailFehler.name, mailFehler.message);
    }
}
export async function sendNextExternalAgencyRequest(admin: Admin, facilityName: string, report: SickReportForRequest, leitungName?: string): Promise<NextRequestResult> {
    const { data: agencies } = await admin
        .from("external_agencies")
        .select("*")
        .eq("facility_name", facilityName)
        .eq("active", true)
        .order("name");
    if (!agencies?.length)
        return { status: "no_agencies" };
    const { data: existing } = await admin
        .from("external_agency_requests")
        .select("agency_id, status")
        .eq("sick_report_id", report.id);
    const ex = existing ?? [];
    if (ex.some((r) => r.status === "accepted"))
        return { status: "already_accepted" };
    const contacted = new Set(ex.map((r) => r.agency_id));
    const next = agencies.find((a) => !contacted.has(a.id));
    if (!next)
        return { status: "exhausted" };
    const name = leitungName ?? (await resolveLeitungName(admin, facilityName));
    await sendOneAgencyRequest(admin, facilityName, name, report, next);
    return { status: "sent", agency: next.name as string };
}
export async function maybeAutoRequestExternal(admin: Admin, facilityName: string, reportId: string, requestReplacement?: boolean | null): Promise<void> {
    try {
        if (requestReplacement === false)
            return;
        let autoOn = false;
        const { data: settings, error: setErr } = await admin
            .from("facility_settings")
            .select("auto_request_external_agencies")
            .eq("facility_name", facilityName)
            .maybeSingle();
        if (!setErr && settings)
            autoOn = Boolean(settings.auto_request_external_agencies);
        if (!autoOn)
            return;
        const { data: report } = await admin
            .from("sick_reports")
            .select("id, sick_date, shift_type, sick_staff_name, station, facility_name")
            .eq("id", reportId)
            .eq("facility_name", facilityName)
            .single();
        if (!report)
            return;
        const { count: alreadySent } = await admin
            .from("external_agency_requests")
            .select("id", { count: "exact", head: true })
            .eq("sick_report_id", reportId);
        if ((alreadySent ?? 0) > 0)
            return;
        const sickDate = report.sick_date as string;
        const shiftType = report.shift_type as string | null;
        const sickName = report.sick_staff_name as string | null;
        const shiftMatches = (candidateShift: string | null) => !shiftType || !candidateShift || candidateShift === shiftType;
        const [onCallRes, availRes] = await Promise.all([
            admin.from("on_call_entries").select("staff_name, shift_type").eq("facility_name", facilityName).eq("on_call_date", sickDate),
            admin.from("availability_entries").select("staff_name, shift_type").eq("facility_name", facilityName).eq("available_date", sickDate),
        ]);
        const candidates = [...(onCallRes.data ?? []), ...(availRes.data ?? [])];
        const hasInternalSpringer = candidates.some((r) => r.staff_name !== sickName && shiftMatches((r.shift_type as string | null) ?? null));
        if (hasInternalSpringer)
            return;
        await sendNextExternalAgencyRequest(admin, facilityName, {
            id: report.id as string,
            sick_date: sickDate,
            shift_type: shiftType,
            sick_staff_name: sickName,
            station: (report.station as string | null) ?? null,
        });
    }
    catch {
    }
}
