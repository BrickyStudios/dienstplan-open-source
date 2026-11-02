import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { deriveShiftType, plannedForStation, plannedForBereich, overrideFor, applySpecialDayDemand, type Demand, type ShiftTimeOverrides, } from "@/lib/scheduling/shift-demand";
import type { SpecialDay } from "@/lib/scheduling/special-days";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
import { addDaysISO } from "@/lib/date";
import { andereHaelfteOffen, leseBesetzung, sollAmTag, findetStatt, istGeschlossen, leseClosedSlots, leseMittagspause, leseTagesZeiten, leseTurnus, mitMittagspause, zeitFuerTag } from "@/lib/scheduling/praxis-raster";
function eachDate(from: string, to: string): string[] {
    const out: string[] = [];
    let tag = from;
    for (let guard = 0; tag <= to && guard < 400; guard++) {
        out.push(tag);
        tag = addDaysISO(tag, 1);
    }
    return out;
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { from, to } = await req.json().catch(() => ({}));
    if (!from || !to)
        return NextResponse.json({ error: "from/to erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const [stationsRes, templatesRes, existingRes] = await Promise.all([
        admin.from("stations").select("name").eq("facility_name", ctx.facilityName).eq("archived", false),
        admin.from("shift_templates").select("name, start_time, end_time").eq("facility_name", ctx.facilityName),
        admin.from("shifts").select("station, date, shift_type").eq("facility_name", ctx.facilityName).gte("date", from).lte("date", to),
    ]);
    let settingsData: {
        shift_demand?: unknown;
        shift_time_overrides?: unknown;
        bundesland?: string | null;
        special_days?: unknown;
    } | null = null;
    {
        const r = await admin.from("facility_settings")
            .select("shift_demand, shift_time_overrides, bundesland, special_days").eq("facility_name", ctx.facilityName).maybeSingle();
        if (r.error && (spalteFehlt(r.error) || tabelleFehlt(r.error))) {
            const r2 = await admin.from("facility_settings")
                .select("shift_demand, shift_time_overrides").eq("facility_name", ctx.facilityName).maybeSingle();
            if (r2.error && (spalteFehlt(r2.error) || tabelleFehlt(r2.error))) {
                const r3 = await admin.from("facility_settings").select("shift_demand").eq("facility_name", ctx.facilityName).maybeSingle();
                settingsData = r3.data ?? null;
            }
            else {
                settingsData = r2.data ?? null;
            }
        }
        else {
            settingsData = r.data ?? null;
        }
    }
    const shiftDemand = settingsData && typeof settingsData.shift_demand === "object"
        ? (settingsData.shift_demand as Demand | null)
        : null;
    const overrides = settingsData && typeof settingsData.shift_time_overrides === "object"
        ? (settingsData.shift_time_overrides as ShiftTimeOverrides | null)
        : null;
    const bundesland = settingsData?.bundesland ?? null;
    const specialDays = settingsData && Array.isArray(settingsData.special_days)
        ? (settingsData.special_days as SpecialDay[])
        : null;
    const closedRes = await admin.from("facility_settings").select("closed_slots").eq("facility_name", ctx.facilityName).maybeSingle();
    const geschlossen = closedRes.error ? null : leseClosedSlots(closedRes.data?.closed_slots);
    const tagesRes = await admin.from("facility_settings").select("day_shift_times").eq("facility_name", ctx.facilityName).maybeSingle();
    const tagesZeiten = tagesRes.error ? null : leseTagesZeiten(tagesRes.data?.day_shift_times);
    const mittagspause = tagesRes.error ? null : leseMittagspause(tagesRes.data?.day_shift_times);
    const turnus = tagesRes.error ? null : leseTurnus(tagesRes.data?.day_shift_times);
    const tagesBesetzung = tagesRes.error ? null : leseBesetzung(tagesRes.data?.day_shift_times);
    let stations = stationsRes.data;
    if (stationsRes.error) {
        const retry = await admin.from("stations").select("name").eq("facility_name", ctx.facilityName);
        stations = retry.data;
    }
    const stationNames = (stations ?? []).map((s: {
        name: string;
    }) => s.name).filter(Boolean);
    const templates = (templatesRes.data ?? []) as {
        name: string;
        start_time: string | null;
        end_time: string | null;
    }[];
    let inserted = 0;
    if (stationNames.length > 0 && templates.length > 0) {
        const existing = new Set((existingRes.data ?? []).map((s: {
            station: string;
            date: string;
            shift_type: string;
        }) => `${s.station}|${s.date}|${s.shift_type}`));
        const dates = eachDate(from, to);
        const rows: Record<string, unknown>[] = [];
        for (const date of dates) {
            for (const st of stationNames) {
                for (const tpl of templates) {
                    const shiftType = deriveShiftType(tpl.start_time, tpl.end_time);
                    if (istGeschlossen(geschlossen, date, shiftType) || !findetStatt(turnus, date, shiftType))
                        continue;
                    const key = `${st}|${date}|${shiftType}`;
                    if (existing.has(key))
                        continue;
                    existing.add(key);
                    const tagZeit = zeitFuerTag(tagesZeiten, date, shiftType);
                    const ov = tagZeit ?? overrideFor(overrides, st, shiftType);
                    let start_time = (ov?.start || tpl.start_time) || null;
                    let end_time = (ov?.end || tpl.end_time) || null;
                    if (!tagZeit && start_time && end_time) {
                        ({ start: start_time, end: end_time } = mitMittagspause({ start: start_time, end: end_time }, mittagspause, shiftType, andereHaelfteOffen(geschlossen, date, shiftType)));
                    }
                    rows.push({
                        facility_name: ctx.facilityName,
                        station: st,
                        date,
                        shift_type: shiftType,
                        start_time,
                        end_time,
                        planned_staff: applySpecialDayDemand(sollAmTag(tagesBesetzung, date, shiftType) ?? plannedForStation(shiftDemand, st, shiftType), date, specialDays, bundesland),
                        actual_staff: 0,
                        notes: "",
                    });
                }
            }
        }
        for (let i = 0; i < rows.length; i += 500) {
            const chunk = rows.slice(i, i + 500);
            const { error } = await admin.from("shifts").insert(chunk);
            if (error) {
                if (tabelleFehlt(error))
                    return NextResponse.json({ error: "Tabelle 'shifts' fehlt" }, { status: 500 });
                return NextResponse.json({ error: error.message, inserted }, { status: 500 });
            }
            inserted += chunk.length;
        }
    }
    let bereichInserted = 0;
    if (shiftDemand && templates.length > 0) {
        const bereicheRes = await admin.from("bereiche").select("id, name").eq("facility_name", ctx.facilityName);
        const bereiche = (bereicheRes.error ? [] : (bereicheRes.data ?? [])) as {
            id: string;
            name: string;
        }[];
        const planned = bereiche.filter(b => shiftDemand[b.name]);
        if (planned.length > 0) {
            const existingBerRes = await admin.from("bereich_shifts")
                .select("bereich_id, date, label").eq("facility_name", ctx.facilityName).gte("date", from).lte("date", to);
            if (!(existingBerRes.error && tabelleFehlt(existingBerRes.error))) {
                const existingBer = new Set((existingBerRes.data ?? []).map((s: {
                    bereich_id: string;
                    date: string;
                    label: string | null;
                }) => `${s.bereich_id}|${s.date}|${s.label ?? ""}`));
                const dates = eachDate(from, to);
                const berRows: Record<string, unknown>[] = [];
                for (const date of dates) {
                    for (const b of planned) {
                        for (const tpl of templates) {
                            const shiftType = deriveShiftType(tpl.start_time, tpl.end_time);
                            const need = plannedForBereich(shiftDemand, b.name, shiftType);
                            if (need <= 0)
                                continue;
                            if (istGeschlossen(geschlossen, date, shiftType) || !findetStatt(turnus, date, shiftType))
                                continue;
                            const label = tpl.name || shiftType;
                            const key = `${b.id}|${date}|${label}`;
                            if (existingBer.has(key))
                                continue;
                            existingBer.add(key);
                            const ov = zeitFuerTag(tagesZeiten, date, shiftType) ?? overrideFor(overrides, b.name, shiftType);
                            berRows.push({
                                facility_name: ctx.facilityName,
                                bereich_id: b.id,
                                date,
                                start_time: (ov?.start || tpl.start_time) || null,
                                end_time: (ov?.end || tpl.end_time) || null,
                                label,
                                planned_staff: applySpecialDayDemand(need, date, specialDays, bundesland),
                                notes: "",
                            });
                        }
                    }
                }
                for (let i = 0; i < berRows.length; i += 500) {
                    let chunk = berRows.slice(i, i + 500);
                    let { error } = await admin.from("bereich_shifts").insert(chunk);
                    if (error && spalteFehlt(error)) {
                        chunk = chunk.map(r => { const c = { ...r }; delete c.planned_staff; return c; });
                        ({ error } = await admin.from("bereich_shifts").insert(chunk));
                    }
                    if (error)
                        break;
                    bereichInserted += chunk.length;
                }
            }
        }
    }
    return NextResponse.json({ ok: true, inserted, bereichInserted });
}
