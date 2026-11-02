import { admin as createAdminClient } from "@/lib/admin-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { NextRequest, NextResponse } from "next/server";
import { berlinTodayISO, isISODate } from "@/lib/date";
import { tabelleFehlt } from "@/lib/db-fehler";
type Admin = SupabaseClient<any>;
async function resolveUser(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return null;
    const admin = createAdminClient();
    const { data: profile } = await admin.from("user_profiles")
        .select("facility, full_name").eq("id", user.id).single();
    if (!profile)
        return null;
    return { userId: user.id, facilityName: profile.facility ?? "", name: profile.full_name ?? "" };
}
async function availabilityEnabled(admin: Admin, facilityName: string): Promise<boolean> {
    const { data } = await admin.from("facility_settings")
        .select("employee_availability_enabled").eq("facility_name", facilityName).maybeSingle();
    return data?.employee_availability_enabled ?? true;
}
export async function GET(req: NextRequest) {
    const ctx = await resolveUser(req);
    if (!ctx)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminClient();
    const today = berlinTodayISO();
    const { data, error } = await admin.from("availability_entries")
        .select("*")
        .eq("user_id", ctx.userId)
        .gte("available_date", today)
        .order("available_date");
    if (tabelleFehlt(error))
        return NextResponse.json({ entries: [], tableMissing: true, availabilityEnabled: true });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data ?? [], availabilityEnabled: await availabilityEnabled(admin, ctx.facilityName) });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveUser(req);
    if (!ctx)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const { availableDate, shiftType, note } = await req.json().catch(() => ({}));
    if (!availableDate)
        return NextResponse.json({ error: "availableDate erforderlich" }, { status: 400 });
    if (!isISODate(availableDate))
        return NextResponse.json({ error: "Ungültiges Datum" }, { status: 400 });
    if (availableDate < berlinTodayISO()) {
        return NextResponse.json({ error: "Verfügbarkeit kann nicht für vergangene Tage eingetragen werden" }, { status: 400 });
    }
    const admin = createAdminClient();
    if (!(await availabilityEnabled(admin, ctx.facilityName))) {
        return NextResponse.json({ error: "Verfügbarkeits-Meldung ist deaktiviert — bitte Leitung kontaktieren", availabilityDisabled: true }, { status: 403 });
    }
    const { data, error } = await admin.from("availability_entries").upsert({
        user_id: ctx.userId,
        staff_name: ctx.name,
        facility_name: ctx.facilityName,
        available_date: availableDate,
        shift_type: shiftType ?? null,
        note: note ?? null,
    }, { onConflict: "user_id,available_date,coalesce(shift_type, '')" }).select().single();
    if (tabelleFehlt(error))
        return NextResponse.json({ error: "Tabelle fehlt", tableMissing: true }, { status: 500 });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data });
}
export async function DELETE(req: NextRequest) {
    const ctx = await resolveUser(req);
    if (!ctx)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const { id } = await req.json().catch(() => ({}));
    if (!id)
        return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    await admin.from("availability_entries").delete().eq("id", id).eq("user_id", ctx.userId);
    return NextResponse.json({ ok: true });
}
