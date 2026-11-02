import type { SupabaseClient } from "@supabase/supabase-js";
type Admin = SupabaseClient<any>;
export type SickReportForNotify = {
    sick_staff_name?: string | null;
    sick_date?: string | null;
    shift_type?: string | null;
    station?: string | null;
};
export async function notifyLeitungOfSickReport(admin: Admin, facilityName: string, report: SickReportForNotify, opts?: {
    excludeUserId?: string;
}): Promise<void> {
    try {
        const { data: settings } = await admin
            .from("facility_settings")
            .select("auto_request_external_agencies")
            .eq("facility_name", facilityName)
            .maybeSingle();
        if (settings?.auto_request_external_agencies)
            return;
        const { data: leitungen } = await admin
            .from("user_profiles")
            .select("id")
            .eq("facility", facilityName)
            .eq("role", "leitung");
        if (!leitungen?.length)
            return;
        const dateStr = report.sick_date
            ? new Date(`${report.sick_date}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })
            : "";
        const shift = report.shift_type ? `, ${report.shift_type}` : "";
        const station = report.station ? ` (${report.station})` : "";
        const name = report.sick_staff_name ?? "Ein Mitarbeiter";
        const rows = leitungen
            .filter((l: {
            id: string;
        }) => l.id !== opts?.excludeUserId)
            .map((l: {
            id: string;
        }) => ({
            user_id: l.id,
            facility_name: facilityName,
            title: "Neue Krankmeldung",
            message: `${name} hat sich für ${dateStr}${shift} krankgemeldet${station}. Bitte Vertretung organisieren.`,
            read: false,
        }));
        if (rows.length === 0)
            return;
        await admin.from("notifications").insert(rows).then(() => { });
    }
    catch {
    }
}
export async function notifyLeitungSickLogged(admin: Admin, facilityName: string, report: SickReportForNotify, opts?: {
    excludeUserId?: string;
}): Promise<void> {
    try {
        const { data: leitungen } = await admin
            .from("user_profiles")
            .select("id")
            .eq("facility", facilityName)
            .eq("role", "leitung");
        if (!leitungen?.length)
            return;
        const dateStr = report.sick_date
            ? new Date(`${report.sick_date}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })
            : "—";
        const shift = report.shift_type ? ` · ${report.shift_type}` : "";
        const station = report.station ? ` · ${report.station}` : "";
        const name = report.sick_staff_name ?? "Ein Mitarbeiter";
        const rows = leitungen
            .filter((l: {
            id: string;
        }) => l.id !== opts?.excludeUserId)
            .map((l: {
            id: string;
        }) => ({
            user_id: l.id,
            facility_name: facilityName,
            title: "Fehlmeldung eingegangen",
            message: `${name} — ${dateStr}${shift}${station}.`,
            read: false,
        }));
        if (rows.length === 0)
            return;
        await admin.from("notifications").insert(rows).then(() => { });
    }
    catch {
    }
}
