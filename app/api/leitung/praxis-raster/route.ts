import { NextRequest, NextResponse } from "next/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveLeitung } from "@/lib/leitung-auth";
import { planAusZeile } from "@/lib/plan";
import { spalteFehlt } from "@/lib/db-fehler";
import { besetzungBereinigt, einstellungenAusRaster, leseClosedSlots, leseMittagspause, leseTagesZeiten, leseTurnus, rasterAusEinstellungen, type PraxisRaster, type Schichtart, } from "@/lib/scheduling/praxis-raster";
import { deriveShiftType } from "@/lib/scheduling/shift-demand";
const FARBEN = ["#3b82f6", "#f59e0b", "#6366f1"];
const UHR = /^([01]\d|2[0-3]):[0-5]\d$/;
async function lade(admin: any, facility: string) {
    const [settingsRes, vorlagenRes, stationRes] = await Promise.all([
        admin.from("facility_settings")
            .select("plan, shift_demand, doctor_demand, replacement_min, closed_slots, day_shift_times")
            .eq("facility_name", facility).maybeSingle(),
        admin.from("shift_templates").select("name, start_time, end_time, sort_order").eq("facility_name", facility).order("sort_order"),
        admin.from("stations").select("name").eq("facility_name", facility).order("sort_order").limit(1),
    ]);
    const einheit = (stationRes.data?.[0]?.name as string | undefined) ?? facility;
    return { settings: settingsRes.data, settingsFehler: settingsRes.error, vorlagen: vorlagenRes.data ?? [], einheit };
}
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    const { settings, settingsFehler, vorlagen, einheit } = await lade(admin, ctx.facilityName);
    if (settingsFehler && !spalteFehlt(settingsFehler))
        return NextResponse.json({ error: settingsFehler.message }, { status: 500 });
    if (planAusZeile(settings) !== "praxis")
        return NextResponse.json({ praxis: false });
    const raster = rasterAusEinstellungen({
        vorlagen, einheit,
        shiftDemand: settings?.shift_demand, doctorDemand: settings?.doctor_demand, replacementMin: settings?.replacement_min,
        closedSlots: settings?.closed_slots, dayShiftTimes: settings?.day_shift_times,
    });
    return NextResponse.json({ praxis: true, einheit, raster });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = (await req.json().catch(() => null)) as {
        raster?: Partial<PraxisRaster>;
    } | null;
    const r = body?.raster;
    if (!r || !Array.isArray(r.schichten))
        return NextResponse.json({ error: "Kein Raster übergeben." }, { status: 400 });
    const schichten: PraxisRaster["schichten"] = [];
    for (const s of r.schichten) {
        if (!s || typeof s.name !== "string" || !s.name.trim() || !UHR.test(String(s.start)) || !UHR.test(String(s.end)))
            continue;
        const art = deriveShiftType(s.start, s.end) as Schichtart;
        if (schichten.some(x => x.art === art))
            continue;
        const bedarf = Math.max(0, Math.min(30, Math.round(Number(s.bedarf)) || 0));
        const mindestens = Math.max(0, Math.min(bedarf, Math.round(Number(s.mindestens ?? bedarf)) || 0));
        const aerzte = Math.max(0, Math.min(30, Math.round(Number(s.aerzte)) || 0));
        schichten.push({ name: s.name.trim().slice(0, 40), start: s.start, end: s.end, art, bedarf, mindestens, aerzte });
    }
    if (!schichten.length)
        return NextResponse.json({ error: "Das Raster enthält keine gültige Schicht." }, { status: 400 });
    const arten = schichten.map(s => s.art as string);
    const admin = createAdminClient();
    const { settings, einheit } = await lade(admin, ctx.facilityName);
    if (planAusZeile(settings) !== "praxis")
        return NextResponse.json({ error: "Das Raster gibt es nur für Praxen." }, { status: 400 });
    const nurArten = (o: Partial<Record<string, Partial<Record<string, unknown>> | undefined>> | null | undefined) => Object.fromEntries(Object.entries(o ?? {}).map(([tag, a]) => [tag, Object.fromEntries(Object.entries(a ?? {}).filter(([art]) => arten.includes(art)))])
        .filter(([, a]) => Object.keys(a as object).length > 0));
    const geschlossen = Object.fromEntries(Object.entries(leseClosedSlots(r.geschlossen) ?? {})
        .map(([tag, a]) => [tag, (a ?? []).filter(x => arten.includes(x))]).filter(([, a]) => (a as string[]).length > 0));
    const tage: Record<string, unknown> = nurArten(leseTagesZeiten(r.zeitenJeTag));
    const pause = arten.includes("frueh") && arten.includes("spaet") ? leseMittagspause({ mittag: r.mittagspause }) : null;
    if (pause)
        tage.mittag = pause;
    const turnus = nurArten(leseTurnus({ turnus: r.turnus }));
    if (Object.keys(turnus).length)
        tage.turnus = turnus;
    const besetzung = besetzungBereinigt(r.besetzungJeTag, schichten);
    if (Object.keys(besetzung).length)
        tage.besetzung = besetzung;
    const alt = (v: unknown) => (v && typeof v === "object" ? v as Record<string, unknown> : {});
    const werte = einstellungenAusRaster(schichten);
    const { error: setErr } = await admin.from("facility_settings").update({
        shift_demand: { ...alt(settings?.shift_demand), [einheit]: werte.shiftDemand },
        doctor_demand: { ...alt(settings?.doctor_demand), [einheit]: werte.doctorDemand },
        replacement_min: { ...alt(settings?.replacement_min), [einheit]: werte.replacementMin },
        closed_slots: geschlossen,
        day_shift_times: Object.keys(tage).length ? tage : null,
    }).eq("facility_name", ctx.facilityName);
    if (setErr)
        return NextResponse.json({ error: `Einstellungen: ${setErr.message}` }, { status: 500 });
    const { data: alteVorlagen } = await admin.from("shift_templates")
        .select("name, start_time, end_time, color, sort_order").eq("facility_name", ctx.facilityName);
    await admin.from("shift_templates").delete().eq("facility_name", ctx.facilityName);
    const { error: tplErr } = await admin.from("shift_templates").insert(schichten.map((s, i) => ({
        facility_name: ctx.facilityName, name: s.name, start_time: s.start, end_time: s.end,
        color: FARBEN[i % FARBEN.length], sort_order: i,
    })));
    if (tplErr) {
        if (alteVorlagen?.length)
            await admin.from("shift_templates").insert(alteVorlagen.map((v: Record<string, unknown>) => ({ ...v, facility_name: ctx.facilityName })));
        return NextResponse.json({ error: `Schichtvorlagen: ${tplErr.message}` }, { status: 500 });
    }
    const gespeichert = rasterAusEinstellungen({
        vorlagen: schichten.map(s => ({ name: s.name, start_time: s.start, end_time: s.end })), einheit,
        shiftDemand: { [einheit]: werte.shiftDemand },
        doctorDemand: { [einheit]: werte.doctorDemand },
        replacementMin: { [einheit]: werte.replacementMin },
        closedSlots: geschlossen, dayShiftTimes: tage,
    });
    return NextResponse.json({ ok: true, raster: gespeichert });
}
