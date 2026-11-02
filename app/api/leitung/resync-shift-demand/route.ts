import { leseBesetzung, sollAmTag } from "@/lib/scheduling/praxis-raster";
import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { plannedForStation, applySpecialDayDemand, type Demand } from "@/lib/scheduling/shift-demand";
import type { SpecialDay } from "@/lib/scheduling/special-days";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    const { from, to, station, facility_name: facilityOverride } = body ?? {};
    const ctx = await resolveLeitung(req, facilityOverride || undefined);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    if (!from || !to)
        return NextResponse.json({ error: "from/to erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    let settingsRes = await admin.from("facility_settings")
        .select("shift_demand, bundesland, special_days").eq("facility_name", ctx.facilityName).maybeSingle();
    if (settingsRes.error && (spalteFehlt(settingsRes.error) || tabelleFehlt(settingsRes.error))) {
        settingsRes = await admin.from("facility_settings")
            .select("shift_demand").eq("facility_name", ctx.facilityName).maybeSingle();
    }
    const shiftDemand = settingsRes.data && typeof settingsRes.data.shift_demand === "object"
        ? (settingsRes.data.shift_demand as Demand | null)
        : null;
    const bundesland = (settingsRes.data as {
        bundesland?: string | null;
    } | null)?.bundesland ?? null;
    const specialDays = settingsRes.data && Array.isArray((settingsRes.data as {
        special_days?: unknown;
    }).special_days)
        ? ((settingsRes.data as {
            special_days?: unknown;
        }).special_days as SpecialDay[])
        : null;
    const tagesRes = await admin.from("facility_settings").select("day_shift_times").eq("facility_name", ctx.facilityName).maybeSingle();
    const tagesBesetzung = tagesRes.error ? null : leseBesetzung(tagesRes.data?.day_shift_times);
    let query = admin.from("shifts")
        .select("id, station, date, shift_type, planned_staff")
        .eq("facility_name", ctx.facilityName)
        .gte("date", from)
        .lte("date", to);
    if (station)
        query = query.eq("station", station);
    const { data, error } = await query;
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: "Tabelle 'shifts' fehlt" }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const shifts = (data ?? []) as {
        id: string;
        station: string;
        date: string;
        shift_type: string;
        planned_staff: number | null;
    }[];
    if (shifts.length === 0) {
        return NextResponse.json({
            ok: true, checked: 0, updated: 0, unchanged: 0,
            hasShiftDemand: Boolean(shiftDemand),
            message: "Keine Schichten im gewählten Zeitraum" + (station ? ` für Station „${station}"` : "") + ".",
        });
    }
    const idsByTarget = new Map<number, string[]>();
    let unchanged = 0;
    for (const s of shifts) {
        const current = s.planned_staff ?? 0;
        if (current !== 0) {
            unchanged++;
            continue;
        }
        const target = applySpecialDayDemand(sollAmTag(tagesBesetzung, s.date, s.shift_type) ?? plannedForStation(shiftDemand, s.station, s.shift_type), s.date, specialDays, bundesland);
        if (target === 0) {
            unchanged++;
            continue;
        }
        const list = idsByTarget.get(target) ?? [];
        list.push(s.id);
        idsByTarget.set(target, list);
    }
    let updated = 0;
    for (const [target, ids] of idsByTarget) {
        for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            const { error: updErr } = await admin.from("shifts")
                .update({ planned_staff: target })
                .eq("facility_name", ctx.facilityName)
                .in("id", chunk);
            if (updErr)
                return NextResponse.json({ error: updErr.message, updated }, { status: 500 });
            updated += chunk.length;
        }
    }
    return NextResponse.json({
        ok: true,
        checked: shifts.length,
        updated,
        unchanged,
        hasShiftDemand: Boolean(shiftDemand),
        message: updated === 0
            ? "Soll-Bedarf war bereits korrekt — nichts zu ändern."
            : `${updated} von ${shifts.length} Schicht(en) auf den aktuellen Soll-Bedarf korrigiert.`,
    });
}
