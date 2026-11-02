import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung, sameFacility } from "@/lib/leitung-auth";
import { baueInviteZeile, ERWEITERTE_PRESETS, istFehlendeSpalte, ohnePresetRole } from "@/lib/invite-staff";
import { errMsg } from "@/lib/db-fehler";
const EXTENDED_KEYS = ERWEITERTE_PRESETS;
const isMissingColumn = istFehlendeSpalte;
export async function POST(req: NextRequest) {
    try {
        const ctx = await resolveLeitung(req);
        if (!ctx)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        const body = await req.json();
        const admin = createAdminClient();
        const { data: facilityRow } = await admin.from("facilities").select("id").eq("name", ctx.facilityName).single();
        const gebaut = baueInviteZeile(body, {
            facilityName: ctx.facilityName,
            facilityId: facilityRow?.id ?? null,
            createdBy: ctx.createdBy,
        });
        if ("fehler" in gebaut)
            return NextResponse.json({ error: gebaut.fehler }, { status: 400 });
        const insertRow = gebaut.zeile;
        let { error: insertError } = await admin.from("invite_codes").insert(insertRow);
        if (insertError && isMissingColumn(insertError) && "preset_role" in insertRow) {
            delete insertRow.preset_role;
            ({ error: insertError } = await admin.from("invite_codes").insert(insertRow));
        }
        if (insertError && isMissingColumn(insertError)) {
            for (const k of EXTENDED_KEYS)
                delete insertRow[k];
            ({ error: insertError } = await admin.from("invite_codes").insert(insertRow));
        }
        if (insertError)
            throw insertError;
        return NextResponse.json({ ok: true, code: gebaut.code });
    }
    catch (err) {
        return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
}
export async function PATCH(req: NextRequest) {
    try {
        const ctx = await resolveLeitung(req);
        if (!ctx)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        const body = await req.json();
        const { code } = body;
        if (!code)
            return NextResponse.json({ error: "Code erforderlich" }, { status: 400 });
        const admin = createAdminClient();
        const { data: codeRow } = await admin
            .from("invite_codes")
            .select("code, facility_name, used, used_by")
            .eq("code", String(code).toUpperCase().trim())
            .maybeSingle();
        if (!codeRow || !sameFacility(codeRow.facility_name, ctx.facilityName)) {
            return NextResponse.json({ error: "Code nicht gefunden" }, { status: 404 });
        }
        if (codeRow.used)
            return direktBeiDerPerson(admin, ctx.facilityName, codeRow.used_by as string | null, body as Record<string, unknown>);
        const updates: Record<string, unknown> = {};
        const b = body as Record<string, unknown>;
        if (b.station != null)
            updates.preset_station = b.station;
        if (b.station_secondary != null)
            updates.preset_station_secondary = b.station_secondary;
        if (b.job_type != null)
            updates.preset_job_type = b.job_type;
        if (b.max_hours_per_week != null)
            updates.preset_max_hours = parseInt(String(b.max_hours_per_week)) || 40;
        if (b.hourly_rate != null && b.hourly_rate !== "")
            updates.preset_hourly_rate = parseFloat(String(b.hourly_rate));
        if (b.minijob_buffer_pct != null)
            updates.preset_minijob_buffer = parseInt(String(b.minijob_buffer_pct)) || 15;
        if (b.weekend_pct != null && b.weekend_pct !== "")
            updates.preset_weekend_pct = parseFloat(String(b.weekend_pct));
        if (b.holiday_pct != null && b.holiday_pct !== "")
            updates.preset_holiday_pct = parseFloat(String(b.holiday_pct));
        if (b.vacation_days != null && b.vacation_days !== "")
            updates.preset_vacation_days = parseInt(String(b.vacation_days));
        if (b.break_min != null && b.break_min !== "")
            updates.preset_break_min = parseInt(String(b.break_min));
        if (Array.isArray(b.preset_certificates))
            updates.preset_certificates = b.preset_certificates;
        if (Object.keys(updates).length === 0)
            return NextResponse.json({ ok: true });
        let { error: updErr } = await admin
            .from("invite_codes").update(updates).eq("code", codeRow.code);
        if (updErr && isMissingColumn(updErr)) {
            for (const k of EXTENDED_KEYS)
                delete updates[k];
            if (Object.keys(updates).length > 0) {
                ({ error: updErr } = await admin.from("invite_codes").update(updates).eq("code", codeRow.code));
            }
            else {
                return NextResponse.json({ ok: true, warning: "Erweiterte Felder benötigen Migration 20260608" });
            }
        }
        if (updErr)
            throw updErr;
        return NextResponse.json({ ok: true });
    }
    catch (err) {
        return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
}
async function direktBeiDerPerson(admin: any, facilityName: string, userId: string | null, b: Record<string, unknown>) {
    if (!userId)
        return NextResponse.json({ error: "Code bereits eingelöst" }, { status: 409 });
    const { data: person } = await admin.from("facility_staff")
        .select("id, full_name").eq("id", userId).eq("facility_name", facilityName).maybeSingle();
    if (!person)
        return NextResponse.json({ error: "Die Person zu diesem Code wurde nicht gefunden." }, { status: 404 });
    const zahl = (v: unknown, f: (s: string) => number) => (v != null && v !== "" && Number.isFinite(f(String(v))) ? f(String(v)) : undefined);
    const stamm: Record<string, unknown> = {
        station: b.station ?? undefined,
        job_type: b.job_type ?? undefined,
        max_hours_per_week: zahl(b.max_hours_per_week, parseInt),
        hourly_rate: zahl(b.hourly_rate, parseFloat),
        minijob_buffer_pct: zahl(b.minijob_buffer_pct, parseInt),
        weekend_pct: zahl(b.weekend_pct, parseFloat),
        holiday_pct: zahl(b.holiday_pct, parseFloat),
        break_min: zahl(b.break_min, parseInt),
    };
    const gesetzt = Object.fromEntries(Object.entries(stamm).filter(([, v]) => v !== undefined));
    const fehlgeschlagen: string[] = [];
    for (const [k, v] of Object.entries(gesetzt)) {
        const { error } = await admin.from("facility_staff").update({ [k]: v }).eq("id", userId).eq("facility_name", facilityName);
        if (error && !isMissingColumn(error))
            fehlgeschlagen.push(k);
    }
    const profil: Record<string, unknown> = {};
    if (b.station != null)
        profil.station = b.station;
    if (b.station_secondary != null)
        profil.station_secondary = b.station_secondary;
    const urlaub = zahl(b.vacation_days, parseInt);
    if (urlaub !== undefined)
        profil.vacation_days = urlaub;
    for (const [k, v] of Object.entries(profil)) {
        const { error } = await admin.from("user_profiles").update({ [k]: v }).eq("id", userId);
        if (error && !isMissingColumn(error))
            fehlgeschlagen.push(k);
    }
    if (Array.isArray(b.preset_certificates)) {
        const rows = (b.preset_certificates as {
            cert_name?: string;
            expiry_date?: string | null;
        }[])
            .filter(c => c?.cert_name)
            .map(c => ({
            user_id: userId, facility: facilityName, full_name: person.full_name,
            cert_name: c.cert_name, cert_type: "leitung", issued_date: null, expiry_date: c.expiry_date || null,
        }));
        if (rows.length) {
            const { error } = await admin.from("staff_certificates").insert(rows);
            if (error)
                fehlgeschlagen.push("Zertifikate");
        }
    }
    if (fehlgeschlagen.length)
        return NextResponse.json({ error: `Nicht gespeichert: ${fehlgeschlagen.join(", ")}` }, { status: 500 });
    return NextResponse.json({ ok: true, direkt: true });
}
