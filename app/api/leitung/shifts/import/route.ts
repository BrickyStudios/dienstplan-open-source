import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveLeitung } from "@/lib/leitung-auth";
import { NextRequest, NextResponse } from "next/server";
async function resolveContext(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    return ctx ? { admin: createAdminClient(), facilityName: ctx.facilityName } : null;
}
import { deriveShiftType } from "@/lib/scheduling/shift-demand";
type ShiftInput = {
    date: string;
    station?: string;
    shift_type?: string;
    start_time?: string;
    end_time?: string;
    planned_staff?: number;
    actual_staff?: number;
    notes?: string;
};
type SchichtSchluessel = {
    station: string;
    date: string;
    shift_type: string;
};
const schluessel = (r: SchichtSchluessel) => `${r.date}|${r.station}|${r.shift_type}`;
export function filtereDubletten<T extends SchichtSchluessel>(rows: T[], vorhandene: SchichtSchluessel[]): {
    neue: T[];
    uebersprungen: number;
} {
    const belegt = new Set(vorhandene.map(schluessel));
    const neue: T[] = [];
    for (const r of rows) {
        const k = schluessel(r);
        if (belegt.has(k))
            continue;
        belegt.add(k);
        neue.push(r);
    }
    return { neue, uebersprungen: rows.length - neue.length };
}
export async function POST(req: NextRequest) {
    const ctx = await resolveContext(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json();
    const { shifts } = body as {
        shifts: ShiftInput[];
    };
    if (!Array.isArray(shifts) || shifts.length === 0) {
        return NextResponse.json({ error: "Keine Schichten übergeben" }, { status: 400 });
    }
    const facilityName = ctx.facilityName;
    if (!facilityName) {
        return NextResponse.json({ error: "Einrichtung nicht bekannt" }, { status: 400 });
    }
    const rows = shifts.map(s => ({
        facility_name: facilityName,
        station: s.station || "Station 1",
        date: s.date,
        shift_type: s.shift_type || deriveShiftType(s.start_time, s.end_time),
        start_time: s.start_time ?? null,
        end_time: s.end_time ?? null,
        planned_staff: s.planned_staff ?? 0,
        actual_staff: s.actual_staff ?? 0,
        notes: s.notes ?? "",
    }));
    const daten = rows.map(r => r.date).sort();
    const { data: vorhandene, error: leseFehler } = await ctx.admin
        .from("shifts")
        .select("station, date, shift_type")
        .eq("facility_name", facilityName)
        .gte("date", daten[0])
        .lte("date", daten[daten.length - 1]);
    if (leseFehler)
        return NextResponse.json({ error: leseFehler.message }, { status: 500 });
    const { neue, uebersprungen } = filtereDubletten(rows, vorhandene ?? []);
    if (neue.length === 0) {
        return NextResponse.json({ inserted: 0, skipped: uebersprungen });
    }
    const { data, error } = await ctx.admin.from("shifts").insert(neue).select("id");
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ inserted: data?.length ?? 0, skipped: uebersprungen });
}
