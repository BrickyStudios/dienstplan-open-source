import { randomUUID } from "crypto";
import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { spalteFehlt, errMsg } from "@/lib/db-fehler";
import { DIENSTPLANUNGEN } from "@/lib/scheduling/dienstplanung";
function clampNullableInt(v: unknown, min: number, max: number): number | null {
    if (v === null || v === undefined || v === "")
        return null;
    const n = parseInt(String(v), 10);
    if (!Number.isFinite(n))
        return null;
    return Math.max(min, Math.min(max, n));
}
function clampNullableNum(v: unknown, min: number, max: number): number | null {
    if (v === null || v === undefined || v === "")
        return null;
    const n = parseFloat(String(v));
    if (!Number.isFinite(n))
        return null;
    return Math.max(min, Math.min(max, n));
}
export async function GET(req: NextRequest) {
    try {
        const ctx = await resolveLeitung(req);
        if (!ctx)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        const facility = ctx.facilityName;
        const admin = createAdminClient();
        const { data, error } = await admin
            .from("facility_staff")
            .select("*")
            .eq("facility_name", facility)
            .order("full_name");
        if (error)
            throw error;
        const staff = (data ?? []) as {
            id: string;
            full_name: string;
        }[];
        const { data: memberRows } = await admin
            .from("bereich_members")
            .select("user_id, staff_name, bereich_id")
            .eq("facility_name", facility);
        const { data: bereichRows } = await admin
            .from("bereiche")
            .select("id, name, color")
            .eq("facility_name", facility);
        const bereichById = new Map((bereichRows ?? []).map((b: {
            id: string;
            name: string;
            color: string | null;
        }) => [b.id, b]));
        const byUser = new Map<string, {
            name: string;
            color: string | null;
        }[]>();
        const byName = new Map<string, {
            name: string;
            color: string | null;
        }[]>();
        for (const m of (memberRows ?? []) as {
            user_id: string;
            staff_name: string;
            bereich_id: string;
        }[]) {
            const b = bereichById.get(m.bereich_id);
            if (!b)
                continue;
            const entry = { name: b.name, color: b.color };
            if (m.user_id)
                byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), entry]);
            if (m.staff_name)
                byName.set(m.staff_name, [...(byName.get(m.staff_name) ?? []), entry]);
        }
        const withBereiche = staff.map(p => ({
            ...p,
            bereiche: byUser.get(p.id) ?? byName.get(p.full_name) ?? [],
        }));
        return NextResponse.json({ staff: withBereiche });
    }
    catch (err) {
        return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
}
export async function POST(req: NextRequest) {
    try {
        const ctx = await resolveLeitung(req);
        if (!ctx)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        const body = await req.json();
        const { full_name, role, job_type, max_hours_per_week } = body;
        if (!full_name?.trim())
            return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });
        const facility = ctx.facilityName;
        if (!facility)
            return NextResponse.json({ error: "Einrichtung nicht gefunden" }, { status: 400 });
        const admin = createAdminClient();
        const newId = randomUUID();
        const { data, error } = await admin.from("facility_staff").insert({
            id: newId,
            facility_name: facility,
            full_name: full_name.trim(),
            role: role || "Pflegekraft",
            job_type: job_type || "Vollzeit",
            max_hours_per_week: parseInt(max_hours_per_week) || 40,
        }).select().single();
        if (error)
            throw error;
        await admin.from("user_profiles").insert({
            id: newId,
            full_name: full_name.trim(),
            role: "mitarbeiter",
            facility: facility,
            station: "",
        }).select();
        return NextResponse.json({ member: data });
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
        const { id, role, job_type, max_hours_per_week, active, hourly_rate, minijob_buffer_pct, tax_class, church_tax, children_count, overtime_compensation, overtime_hours_per_day, max_shifts_per_week, max_consecutive_days, max_consecutive_nights, max_hours_per_shift, min_rest_hours, break_after_minutes, break_min, max_holiday_shifts_per_month, min_days_off_per_week, no_sunday_work, dienstplanung, } = body;
        if (!id)
            return NextResponse.json({ error: "ID erforderlich" }, { status: 400 });
        const updates: Record<string, unknown> = {};
        if (role !== undefined)
            updates.role = role;
        if (job_type !== undefined)
            updates.job_type = job_type;
        if (max_hours_per_week !== undefined)
            updates.max_hours_per_week = parseInt(max_hours_per_week) || 0;
        if (active !== undefined)
            updates.active = active;
        if (hourly_rate !== undefined)
            updates.hourly_rate = hourly_rate === null ? null : parseFloat(hourly_rate) || null;
        if (minijob_buffer_pct !== undefined)
            updates.minijob_buffer_pct = Math.max(0, Math.min(50, parseInt(minijob_buffer_pct) || 15));
        if (tax_class !== undefined)
            updates.tax_class = Math.max(1, Math.min(6, parseInt(tax_class) || 1));
        if (church_tax !== undefined)
            updates.church_tax = Boolean(church_tax);
        if (children_count !== undefined)
            updates.children_count = Math.max(0, parseInt(children_count) || 0);
        if (overtime_compensation !== undefined) {
            updates.overtime_compensation = overtime_compensation === null ? null
                : (overtime_compensation === "vacation" ? "vacation" : "payout");
        }
        if (overtime_hours_per_day !== undefined) {
            updates.overtime_hours_per_day = overtime_hours_per_day === null || overtime_hours_per_day === ""
                ? null : Math.max(1, Math.min(24, parseFloat(overtime_hours_per_day) || 8));
        }
        if (max_shifts_per_week !== undefined)
            updates.max_shifts_per_week = clampNullableInt(max_shifts_per_week, 0, 7);
        if (max_consecutive_days !== undefined)
            updates.max_consecutive_days = clampNullableInt(max_consecutive_days, 1, 7);
        if (max_consecutive_nights !== undefined)
            updates.max_consecutive_nights = clampNullableInt(max_consecutive_nights, 1, 7);
        if (max_hours_per_shift !== undefined)
            updates.max_hours_per_shift = clampNullableNum(max_hours_per_shift, 1, 24);
        if (min_rest_hours !== undefined)
            updates.min_rest_hours = clampNullableNum(min_rest_hours, 0, 24);
        if (break_after_minutes !== undefined)
            updates.break_after_minutes = clampNullableInt(break_after_minutes, 0, 1440);
        if (break_min !== undefined)
            updates.break_min = clampNullableInt(break_min, 0, 240);
        if (max_holiday_shifts_per_month !== undefined)
            updates.max_holiday_shifts_per_month = clampNullableInt(max_holiday_shifts_per_month, 0, 31);
        if (min_days_off_per_week !== undefined)
            updates.min_days_off_per_week = clampNullableInt(min_days_off_per_week, 0, 7);
        if (no_sunday_work !== undefined)
            updates.no_sunday_work = Boolean(no_sunday_work);
        if (dienstplanung !== undefined) {
            updates.dienstplanung = (DIENSTPLANUNGEN as unknown[]).includes(dienstplanung) ? dienstplanung : null;
        }
        const admin = createAdminClient();
        const EXTENDED_COLS = ["hourly_rate", "minijob_buffer_pct", "tax_class", "church_tax", "children_count", "overtime_compensation", "overtime_hours_per_day",
            "max_shifts_per_week", "max_consecutive_days", "max_consecutive_nights", "max_hours_per_shift", "min_rest_hours", "break_after_minutes", "break_min", "max_holiday_shifts_per_month", "min_days_off_per_week", "no_sunday_work", "dienstplanung"];
        let result = await admin.from("facility_staff").update(updates).eq("id", id).eq("facility_name", ctx.facilityName).select().single();
        if (result.error && spalteFehlt(result.error) && "dienstplanung" in updates && /dienstplanung/.test(result.error.message ?? "")) {
            delete updates.dienstplanung;
            const hinweis = "Gespeichert, nur die Dienstplanung nicht: Die Migration supabase/migrations/20261010_dienstplanung.sql muss im Supabase SQL-Editor ausgeführt werden.";
            if (Object.keys(updates).length === 0)
                return NextResponse.json({ warning: hinweis });
            result = await admin.from("facility_staff").update(updates).eq("id", id).eq("facility_name", ctx.facilityName).select().single();
            if (!result.error)
                return NextResponse.json({ member: result.data, warning: hinweis });
        }
        if (result.error && spalteFehlt(result.error)) {
            const core: Record<string, unknown> = {};
            for (const k of Object.keys(updates))
                if (!EXTENDED_COLS.includes(k))
                    core[k] = updates[k];
            if (Object.keys(core).length > 0) {
                result = await admin.from("facility_staff").update(core).eq("id", id).eq("facility_name", ctx.facilityName).select().single();
            }
            if (!result.error) {
                return NextResponse.json({
                    member: result.data,
                    warning: "Lohn-/Steuer- bzw. Vertragsgrenzen-Felder konnten nicht gespeichert werden — DB-Migration erforderlich (facility_staff: hourly_rate, tax_class, …, max_shifts_per_week, max_consecutive_days, max_consecutive_nights, max_hours_per_shift, min_rest_hours, break_after_minutes, break_min, max_holiday_shifts_per_month, min_days_off_per_week).",
                });
            }
        }
        if (result.error)
            throw result.error;
        return NextResponse.json({ member: result.data });
    }
    catch (err) {
        return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
}
export async function DELETE(req: NextRequest) {
    try {
        const ctx = await resolveLeitung(req);
        if (!ctx)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        const { id } = await req.json();
        const admin = createAdminClient();
        const { error } = await admin.from("facility_staff").delete().eq("id", id).eq("facility_name", ctx.facilityName);
        if (error)
            throw error;
        await admin.from("user_profiles").delete().eq("id", id).eq("role", "mitarbeiter").eq("facility", ctx.facilityName);
        return NextResponse.json({ ok: true });
    }
    catch (err) {
        return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
}
