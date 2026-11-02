import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { einsatzStationenVon } from "@/lib/scheduling/generate-plan-core";
const VERTRAGSFELDER = [
    "hourly_rate", "minijob_buffer_pct", "tax_class", "church_tax", "children_count",
    "overtime_compensation", "overtime_hours_per_day",
    "max_shifts_per_week", "max_consecutive_days", "max_consecutive_nights", "max_hours_per_shift",
    "min_rest_hours", "break_after_minutes", "break_min", "max_holiday_shifts_per_month",
    "min_days_off_per_week", "no_sunday_work", "dienstplanung",
] as const;
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    const [profilesRes, facilityStaffRes] = await Promise.all([
        admin.from("user_profiles")
            .select("*")
            .eq("facility", ctx.facilityName)
            .eq("role", "mitarbeiter")
            .order("created_at", { ascending: false }),
        admin.from("facility_staff")
            .select("*")
            .eq("facility_name", ctx.facilityName),
    ]);
    if (profilesRes.error)
        return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
    const hoursById: Record<string, {
        max_hours_per_week: number;
        job_type: string;
        einsatz_stationen: string[];
        beruf: string;
    }> = {};
    for (const s of facilityStaffRes.data ?? []) {
        hoursById[s.id] = {
            max_hours_per_week: Number(s.max_hours_per_week) || 40,
            job_type: (s.job_type as string) || "Vollzeit",
            einsatz_stationen: einsatzStationenVon(s),
            beruf: (s.role as string) || "",
        };
    }
    const einsatzNachName = new Map((facilityStaffRes.data ?? []).map(s => [s.full_name as string, einsatzStationenVon(s)]));
    const stammById = new Map((facilityStaffRes.data ?? []).map(s => [s.id as string, s as Record<string, unknown>]));
    const stammByName = new Map((facilityStaffRes.data ?? []).map(s => [s.full_name as string, s as Record<string, unknown>]));
    const vertragVon = (row: Record<string, unknown> | undefined) => Object.fromEntries(VERTRAGSFELDER.filter(k => row && k in row).map(k => [k, row![k]]));
    const staff = (profilesRes.data ?? []).map(p => ({
        ...p,
        ...vertragVon(stammById.get(p.id) ?? stammByName.get(p.full_name)),
        max_hours_per_week: hoursById[p.id]?.max_hours_per_week ?? 40,
        job_type: hoursById[p.id]?.job_type ?? "Vollzeit",
        einsatz_stationen: hoursById[p.id]?.einsatz_stationen ?? einsatzNachName.get(p.full_name) ?? [],
        beruf: hoursById[p.id]?.beruf ?? ((stammByName.get(p.full_name)?.role as string | undefined) || ""),
    }));
    return NextResponse.json({ staff });
}
