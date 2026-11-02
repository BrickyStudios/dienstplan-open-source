import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { admin } from "@/lib/admin-client";
import { wochentag, type BereichsVorlage } from "@/lib/scheduling/bereich-automatik";
import { tabelleFehlt } from "@/lib/db-fehler";
const FEHLT = "Tabelle 'bereich_shift_templates' fehlt — SQL-Migration 20260918 erforderlich";
const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
function zeitOderNull(v: unknown): string | null | undefined {
    if (v === undefined)
        return undefined;
    const s = typeof v === "string" ? v.trim() : "";
    if (!s)
        return null;
    return UHRZEIT.test(s) ? s : undefined;
}
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const bereichId = new URL(req.url).searchParams.get("bereich_id");
    let q = admin()
        .from("bereich_shift_templates")
        .select("*")
        .eq("facility_name", ctx.facilityName);
    if (bereichId)
        q = q.eq("bereich_id", bereichId);
    const { data, error } = await q.order("bereich_id").order("weekday").order("start_time");
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ templates: [], tableMissing: true });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ templates: data ?? [] });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json();
    const bereichId = body.bereich_id as string | undefined;
    if (!bereichId)
        return NextResponse.json({ error: "bereich_id erforderlich" }, { status: 400 });
    const tage: number[] = Array.isArray(body.weekdays)
        ? body.weekdays.map(Number)
        : body.weekday !== undefined ? [Number(body.weekday)] : [];
    if (tage.length === 0)
        return NextResponse.json({ error: "Mindestens ein Wochentag erforderlich" }, { status: 400 });
    if (tage.some(t => !Number.isInteger(t) || t < 0 || t > 6)) {
        return NextResponse.json({ error: "Wochentag muss zwischen 0 (Montag) und 6 (Sonntag) liegen" }, { status: 400 });
    }
    const start = zeitOderNull(body.start_time);
    const ende = zeitOderNull(body.end_time);
    if (start === undefined || ende === undefined) {
        return NextResponse.json({ error: "Uhrzeiten im Format HH:MM angeben" }, { status: 400 });
    }
    const bedarf = body.staff_needed === undefined ? 1 : Number(body.staff_needed);
    if (!Number.isInteger(bedarf) || bedarf < 0 || bedarf > 99) {
        return NextResponse.json({ error: "Besetzung muss zwischen 0 und 99 liegen" }, { status: 400 });
    }
    const db = admin();
    const { data: bereich } = await db
        .from("bereiche").select("id").eq("id", bereichId).eq("facility_name", ctx.facilityName).maybeSingle();
    if (!bereich)
        return NextResponse.json({ error: "Bereich nicht gefunden" }, { status: 404 });
    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : null;
    const { data, error } = await db
        .from("bereich_shift_templates")
        .upsert([...new Set(tage)].map(weekday => ({
        facility_name: ctx.facilityName,
        bereich_id: bereichId,
        weekday,
        start_time: start,
        end_time: ende,
        label,
        staff_needed: bedarf,
        active: true,
    })), { onConflict: "bereich_id,weekday,start_time,label", ignoreDuplicates: false })
        .select();
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: FEHLT }, { status: 500 });
        if (error.code === "42P10" || error.code === "PGRST100") {
            const { data: d2, error: e2 } = await db
                .from("bereich_shift_templates")
                .insert([...new Set(tage)].map(weekday => ({
                facility_name: ctx.facilityName, bereich_id: bereichId, weekday,
                start_time: start, end_time: ende, label, staff_needed: bedarf, active: true,
            })))
                .select();
            if (e2?.code === "23505")
                return NextResponse.json({ error: "Diese Vorlage gibt es bereits" }, { status: 409 });
            if (e2)
                return NextResponse.json({ error: e2.message }, { status: 500 });
            return NextResponse.json({ templates: d2 ?? [] });
        }
        if (error.code === "23505")
            return NextResponse.json({ error: "Diese Vorlage gibt es bereits" }, { status: 409 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ templates: data ?? [] });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json();
    if (!body.id)
        return NextResponse.json({ error: "ID erforderlich" }, { status: 400 });
    const updates: Record<string, unknown> = {};
    if (body.staff_needed !== undefined) {
        const bedarf = Number(body.staff_needed);
        if (!Number.isInteger(bedarf) || bedarf < 0 || bedarf > 99) {
            return NextResponse.json({ error: "Besetzung muss zwischen 0 und 99 liegen" }, { status: 400 });
        }
        updates.staff_needed = bedarf;
    }
    if (body.active !== undefined)
        updates.active = !!body.active;
    for (const feld of ["start_time", "end_time"] as const) {
        if (body[feld] === undefined)
            continue;
        const z = zeitOderNull(body[feld]);
        if (z === undefined)
            return NextResponse.json({ error: "Uhrzeiten im Format HH:MM angeben" }, { status: 400 });
        updates[feld] = z;
    }
    if (body.label !== undefined)
        updates.label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : null;
    if (Object.keys(updates).length === 0)
        return NextResponse.json({ error: "Nichts zu ändern" }, { status: 400 });
    const { data, error } = await admin()
        .from("bereich_shift_templates")
        .update(updates)
        .eq("id", body.id)
        .eq("facility_name", ctx.facilityName)
        .select()
        .maybeSingle();
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: FEHLT }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data)
        return NextResponse.json({ error: "Vorlage nicht gefunden" }, { status: 404 });
    return NextResponse.json({ template: data });
}
export async function DELETE(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id, bereich_id } = await req.json();
    if (!id && !bereich_id)
        return NextResponse.json({ error: "id oder bereich_id erforderlich" }, { status: 400 });
    let q = admin().from("bereich_shift_templates").delete().eq("facility_name", ctx.facilityName);
    q = id ? q.eq("id", id) : q.eq("bereich_id", bereich_id);
    const { error } = await q;
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: FEHLT }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
export async function PUT(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { bereich_id, von, bis } = await req.json();
    if (!bereich_id || !von || !bis)
        return NextResponse.json({ error: "bereich_id, von und bis erforderlich" }, { status: 400 });
    const db = admin();
    const { data: dienste, error } = await db
        .from("bereich_shifts")
        .select("id, bereich_id, date, start_time, end_time, label")
        .eq("facility_name", ctx.facilityName)
        .eq("bereich_id", bereich_id)
        .gte("date", von)
        .lte("date", bis);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    if (!dienste?.length)
        return NextResponse.json({ error: "In diesem Zeitraum steht kein Dienst, der sich übernehmen ließe" }, { status: 400 });
    const { data: besetzung } = await db
        .from("bereich_shift_assignments")
        .select("shift_id")
        .in("shift_id", dienste.map(d => d.id as string));
    const zahl: Record<string, number> = {};
    for (const a of (besetzung ?? []) as Array<{
        shift_id: string;
    }>)
        zahl[a.shift_id] = (zahl[a.shift_id] ?? 0) + 1;
    const proSchluessel = new Map<string, BereichsVorlage>();
    for (const d of dienste as Array<{
        id: string;
        date: string;
        start_time: string | null;
        end_time: string | null;
        label: string | null;
    }>) {
        const weekday = wochentag(d.date);
        const key = `${weekday}|${(d.start_time ?? "").trim().toLowerCase()}|${(d.label ?? "").trim().toLowerCase()}`;
        const vorhanden = proSchluessel.get(key);
        if (vorhanden) {
            vorhanden.staff_needed = Math.max(vorhanden.staff_needed, zahl[d.id] ?? 1);
            continue;
        }
        proSchluessel.set(key, {
            bereich_id,
            weekday,
            start_time: d.start_time,
            end_time: d.end_time,
            label: d.label,
            staff_needed: Math.max(1, zahl[d.id] ?? 1),
        });
    }
    const { error: delErr } = await db
        .from("bereich_shift_templates")
        .delete()
        .eq("facility_name", ctx.facilityName)
        .eq("bereich_id", bereich_id);
    if (delErr) {
        if (tabelleFehlt(delErr))
            return NextResponse.json({ error: FEHLT }, { status: 500 });
        return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    const { data, error: insErr } = await db
        .from("bereich_shift_templates")
        .insert([...proSchluessel.values()].map(v => ({
        facility_name: ctx.facilityName,
        bereich_id: v.bereich_id,
        weekday: v.weekday,
        start_time: v.start_time,
        end_time: v.end_time,
        label: v.label,
        staff_needed: v.staff_needed,
        active: true,
    })))
        .select();
    if (insErr)
        return NextResponse.json({ error: insErr.message }, { status: 500 });
    return NextResponse.json({ templates: data ?? [] });
}
