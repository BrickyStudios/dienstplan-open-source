import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { admin } from "@/lib/admin-client";
import { syncActualStaff } from "@/lib/scheduling/actual-staff";
import { tabelleFehlt } from "@/lib/db-fehler";
import { ladeGuardDaten } from "@/lib/ai-guard-daten";
import { validateProposal, type GuardFinding } from "@/lib/ai-guardrails";
import { addDaysISO } from "@/lib/date";
async function pruefen(db: ReturnType<typeof admin>, facility: string, shiftId: string, staffId: string | null, name: string): Promise<GuardFinding[]> {
    const { data: schicht } = await db.from("shifts").select("date").eq("id", shiftId).maybeSingle();
    if (!schicht?.date)
        return [];
    const daten = await ladeGuardDaten(db, facility, schicht.date as string, addDaysISO(schicht.date as string, 1));
    const person = daten.staff.find((p) => (staffId && p.id === staffId) || p.name === name);
    if (!person)
        return [];
    return validateProposal({ ...daten, vorschlag: [{ shiftId, staffId: person.id }] }).befunde;
}
async function shiftBelongsToFacility(shiftId: string, facilityName: string): Promise<boolean> {
    const { data } = await admin()
        .from("shifts")
        .select("id")
        .eq("id", shiftId)
        .eq("facility_name", facilityName)
        .maybeSingle();
    return !!data;
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { shift_id, staff_name, staff_id, trotzdem, is_springer } = await req.json().catch(() => ({}));
    if (!shift_id || !String(staff_name ?? "").trim()) {
        return NextResponse.json({ error: "shift_id und staff_name erforderlich" }, { status: 400 });
    }
    const name = String(staff_name).trim();
    if (!(await shiftBelongsToFacility(shift_id, ctx.facilityName))) {
        return NextResponse.json({ error: "Schicht nicht gefunden" }, { status: 404 });
    }
    const db = admin();
    const { data: existing } = await db
        .from("shift_assignments")
        .select("id")
        .eq("shift_id", shift_id)
        .eq("staff_name", name)
        .maybeSingle();
    if (existing)
        return NextResponse.json({ assignment: existing, alreadyAssigned: true });
    const befunde = await pruefen(db, ctx.facilityName, shift_id, staff_id || null, name).catch(() => [] as GuardFinding[]);
    const blocker = befunde.filter((b) => b.schwere === "blocker");
    if (blocker.length && trotzdem !== true) {
        return NextResponse.json({ pruefung: befunde, error: blocker.map((b) => b.text).join(" ") }, { status: 409 });
    }
    const zeile = { shift_id, facility_name: ctx.facilityName, staff_id: staff_id || null, staff_name: name, is_springer: is_springer === true };
    let { data, error } = await db.from("shift_assignments").insert({ ...zeile, status: "manual" }).select().single();
    if (error?.code === "23514" && /status/.test(error.message ?? "")) {
        ({ data, error } = await db.from("shift_assignments").insert({ ...zeile, status: "confirmed" }).select().single());
    }
    if (error) {
        if (tabelleFehlt(error)) {
            return NextResponse.json({ error: "Tabelle 'shift_assignments' fehlt — SQL-Migration erforderlich" }, { status: 500 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await syncActualStaff(db, ctx.facilityName, [shift_id]);
    return NextResponse.json({ assignment: data, pruefung: befunde, uebersteuert: blocker.length > 0 });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { shift_id, staff_name, is_springer } = await req.json().catch(() => ({}));
    if (!shift_id || !staff_name || typeof is_springer !== "boolean") {
        return NextResponse.json({ error: "shift_id, staff_name und is_springer erforderlich" }, { status: 400 });
    }
    if (!(await shiftBelongsToFacility(shift_id, ctx.facilityName))) {
        return NextResponse.json({ error: "Schicht nicht gefunden" }, { status: 404 });
    }
    const { data, error } = await admin()
        .from("shift_assignments")
        .update({ is_springer })
        .eq("facility_name", ctx.facilityName)
        .eq("shift_id", shift_id)
        .eq("staff_name", staff_name)
        .select("shift_id, staff_name, is_springer");
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length)
        return NextResponse.json({ error: "Einteilung nicht gefunden" }, { status: 404 });
    return NextResponse.json({ assignment: data[0] });
}
export async function DELETE(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { shift_id, staff_name } = await req.json().catch(() => ({}));
    if (!shift_id || !staff_name) {
        return NextResponse.json({ error: "shift_id und staff_name erforderlich" }, { status: 400 });
    }
    if (!(await shiftBelongsToFacility(shift_id, ctx.facilityName))) {
        return NextResponse.json({ error: "Schicht nicht gefunden" }, { status: 404 });
    }
    const { error } = await admin()
        .from("shift_assignments")
        .delete()
        .eq("facility_name", ctx.facilityName)
        .eq("shift_id", shift_id)
        .eq("staff_name", staff_name);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    await syncActualStaff(admin(), ctx.facilityName, [shift_id]);
    return NextResponse.json({ ok: true });
}
