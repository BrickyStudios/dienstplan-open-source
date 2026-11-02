import { generateInviteCode, inviteCodeExpiry } from "@/lib/invite-code";
import { spalteFehlt } from "@/lib/db-fehler";
export const BULK_INVITE_TTL_DAYS = 30;
export const BULK_MAX_ZEILEN = 300;
export const ERWEITERTE_PRESETS = [
    "preset_email", "preset_phone", "preset_first_name", "preset_last_name",
    "preset_weekend_pct", "preset_holiday_pct", "preset_vacation_days",
    "preset_break_min", "preset_certificates",
] as const;
export function istFehlendeSpalte(err: unknown): boolean {
    return spalteFehlt(err as {
        code?: string;
    });
}
export type InviteEingabe = {
    name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    station?: string;
    station_secondary?: string;
    role?: string;
    job_type?: string;
    max_hours_per_week?: string | number;
    hourly_rate?: string | number;
    minijob_buffer_pct?: string | number;
    weekend_pct?: string | number;
    holiday_pct?: string | number;
    vacation_days?: string | number;
    break_min?: string | number;
};
export type InviteKontext = {
    facilityName: string;
    facilityId: string | null;
    createdBy: string | null;
};
const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const gesetzt = (v: unknown): boolean => v != null && v !== "";
export function baueInviteZeile(e: InviteEingabe, ctx: InviteKontext, opts: {
    ttlTage?: number;
} = {}): {
    zeile: Record<string, unknown>;
    code: string;
    name: string;
} | {
    fehler: string;
} {
    const fullName = txt(e.name) || [txt(e.first_name), txt(e.last_name)].filter(Boolean).join(" ").trim();
    if (!fullName)
        return { fehler: "Name erforderlich" };
    const code = generateInviteCode("NRV-M");
    const zeile: Record<string, unknown> = {
        code,
        role: "mitarbeiter",
        facility_id: ctx.facilityId,
        facility_name: ctx.facilityName,
        created_by: ctx.createdBy,
        preset_name: fullName,
        used: false,
        expires_at: new Date(inviteCodeExpiry(opts.ttlTage)).toISOString(),
    };
    if (txt(e.station))
        zeile.preset_station = txt(e.station);
    if (txt(e.station_secondary))
        zeile.preset_station_secondary = txt(e.station_secondary);
    if (txt(e.job_type))
        zeile.preset_job_type = txt(e.job_type);
    if (txt(e.role))
        zeile.preset_role = txt(e.role).slice(0, 100);
    if (gesetzt(e.max_hours_per_week))
        zeile.preset_max_hours = parseInt(String(e.max_hours_per_week)) || 40;
    if (gesetzt(e.hourly_rate))
        zeile.preset_hourly_rate = parseFloat(String(e.hourly_rate)) || null;
    if (e.minijob_buffer_pct !== undefined)
        zeile.preset_minijob_buffer = parseInt(String(e.minijob_buffer_pct)) || 15;
    if (txt(e.email))
        zeile.preset_email = txt(e.email).toLowerCase();
    if (txt(e.phone))
        zeile.preset_phone = txt(e.phone);
    if (txt(e.first_name))
        zeile.preset_first_name = txt(e.first_name);
    if (txt(e.last_name))
        zeile.preset_last_name = txt(e.last_name);
    if (gesetzt(e.weekend_pct))
        zeile.preset_weekend_pct = parseFloat(String(e.weekend_pct));
    if (gesetzt(e.holiday_pct))
        zeile.preset_holiday_pct = parseFloat(String(e.holiday_pct));
    if (gesetzt(e.vacation_days))
        zeile.preset_vacation_days = parseInt(String(e.vacation_days));
    if (gesetzt(e.break_min))
        zeile.preset_break_min = parseInt(String(e.break_min));
    return { zeile, code, name: fullName };
}
export type VersandZeile = {
    code: string;
    facility_name: string | null;
    used: boolean;
    expires_at: string | null;
    preset_email: string | null;
};
export function versandAbsage(zeile: VersandZeile | undefined, gehoertZurEinrichtung: boolean, jetzt: number = Date.now()): string | null {
    if (!zeile)
        return "Code nicht gefunden";
    if (!gehoertZurEinrichtung)
        return "Gehoert nicht zu dieser Einrichtung";
    if (zeile.used)
        return "Bereits eingeloest";
    if (zeile.expires_at && new Date(zeile.expires_at).getTime() <= jetzt)
        return "Abgelaufen";
    if (!zeile.preset_email)
        return "Keine E-Mail-Adresse hinterlegt";
    return null;
}
export function ohnePresetRole(zeilen: Record<string, unknown>[]): Record<string, unknown>[] {
    return zeilen.map(z => {
        const kopie = { ...z };
        delete kopie.preset_role;
        return kopie;
    });
}
export function ohneErweiterteSpalten(zeilen: Record<string, unknown>[]): Record<string, unknown>[] {
    return zeilen.map(z => {
        const kopie = { ...z };
        for (const k of ERWEITERTE_PRESETS)
            delete kopie[k];
        return kopie;
    });
}
