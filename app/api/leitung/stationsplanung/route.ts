import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { admin as createAdminClient } from "@/lib/admin-client";
import { ladeGenehmigteAbwesenheiten } from "@/lib/scheduling/plan-context";
import { baueStationsplanung } from "@/lib/scheduling/stationsplanung";
import { wochenTage } from "@/lib/scheduling/eignung";
import { addDaysISO, todayISO } from "@/lib/date";
import { tabelleFehlt } from "@/lib/db-fehler";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const wocheParam = req.nextUrl.searchParams.get("woche") ?? "";
    const tage = wochenTage(ISO.test(wocheParam) ? wocheParam : todayISO());
    const von = tage[0];
    const bis = tage[6];
    const station = (req.nextUrl.searchParams.get("station") ?? "").trim();
    const db = createAdminClient();
    if (!station)
        return uebersicht(db, ctx.facilityName, von, bis);
    const fensterVon = addDaysISO(von, -7);
    const fensterBis = addDaysISO(bis, 7);
    const [shiftsRes, staffRes, profilesRes, settingsRes] = await Promise.all([
        db.from("shifts")
            .select("id, station, date, shift_type, planned_staff, start_time, end_time")
            .eq("facility_name", ctx.facilityName)
            .gte("date", fensterVon).lte("date", fensterBis),
        db.from("facility_staff")
            .select("*")
            .eq("facility_name", ctx.facilityName)
            .or("active.neq.false,active.is.null"),
        db.from("user_profiles")
            .select("id, full_name, station")
            .eq("facility", ctx.facilityName)
            .eq("role", "mitarbeiter"),
        db.from("facility_settings")
            .select("*")
            .eq("facility_name", ctx.facilityName)
            .maybeSingle(),
    ]);
    if (shiftsRes.error && !tabelleFehlt(shiftsRes.error)) {
        return NextResponse.json({ error: shiftsRes.error.message }, { status: 500 });
    }
    const shifts = shiftsRes.data ?? [];
    const shiftIds = shifts.map(s => s.id as string);
    const assignRes = shiftIds.length
        ? await db.from("shift_assignments")
            .select("shift_id, staff_id, staff_name, status, is_springer")
            .eq("facility_name", ctx.facilityName)
            .in("shift_id", shiftIds)
        : { data: [] };
    const staffIds = [...new Set([
            ...(profilesRes.data ?? []).map(p => p.id as string),
            ...(staffRes.data ?? []).map(s => s.id as string),
        ])].filter(Boolean);
    const absences = await ladeGenehmigteAbwesenheiten(db, { facilityName: ctx.facilityName, staffIds, von, bis });
    const plan = baueStationsplanung({
        station, von, bis,
        shifts,
        assignments: assignRes.data ?? [],
        facilityStaff: staffRes.data ?? [],
        profiles: profilesRes.data ?? [],
        settings: settingsRes.data ?? null,
        absences,
    });
    return NextResponse.json({ von, bis, ...plan });
}
async function uebersicht(db: ReturnType<typeof createAdminClient>, facilityName: string, von: string, bis: string) {
    const [stationsRes, shiftsRes, staffRes, profilesRes] = await Promise.all([
        db.from("stations")
            .select("*")
            .eq("facility_name", facilityName)
            .eq("archived", false)
            .order("sort_order").order("name"),
        db.from("shifts")
            .select("id, station, planned_staff")
            .eq("facility_name", facilityName)
            .gte("date", von).lte("date", bis),
        db.from("facility_staff")
            .select("full_name, station")
            .eq("facility_name", facilityName)
            .or("active.neq.false,active.is.null"),
        db.from("user_profiles")
            .select("full_name, station")
            .eq("facility", facilityName)
            .eq("role", "mitarbeiter"),
    ]);
    const wocheIds = (shiftsRes.data ?? []).map(s => s.id as string);
    const belegtRes = wocheIds.length
        ? await db.from("shift_assignments")
            .select("shift_id, status")
            .eq("facility_name", facilityName)
            .in("shift_id", wocheIds)
        : { data: [] };
    const besetzt = new Map<string, number>();
    for (const a of belegtRes.data ?? []) {
        if ((a.status ?? "confirmed") === "cancelled")
            continue;
        besetzt.set(a.shift_id, (besetzt.get(a.shift_id) ?? 0) + 1);
    }
    const stationJePerson = new Map<string, string | null>();
    for (const p of profilesRes.data ?? [])
        if (p.full_name)
            stationJePerson.set(p.full_name, p.station ?? null);
    for (const s of staffRes.data ?? []) {
        if (s.full_name && !stationJePerson.has(s.full_name))
            stationJePerson.set(s.full_name, s.station ?? null);
    }
    type Zeile = {
        name: string;
        color: string | null;
        personen: number;
        schichten: number;
        offen: number;
    };
    const zeilen = new Map<string, Zeile>();
    for (const s of stationsRes.data ?? []) {
        zeilen.set(s.name, { name: s.name, color: s.color ?? null, personen: 0, schichten: 0, offen: 0 });
    }
    for (const s of shiftsRes.data ?? []) {
        const z = zeilen.get(s.station) ?? { name: s.station, color: null, personen: 0, schichten: 0, offen: 0 };
        z.schichten++;
        if ((besetzt.get(s.id) ?? 0) < (Number(s.planned_staff) || 0))
            z.offen++;
        zeilen.set(s.station, z);
    }
    for (const st of stationJePerson.values()) {
        const z = st ? zeilen.get(st) : undefined;
        if (z)
            z.personen++;
    }
    return NextResponse.json({ von, bis, stationen: [...zeilen.values()].filter(z => z.name) });
}
