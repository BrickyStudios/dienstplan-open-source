import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse, after } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { recalcBurnoutAfterShift } from "@/lib/burnout";
import { recordShiftReportAfterCheckout } from "@/lib/shift-report";
import { resolveZeiterfassungUser as resolve, istLeitung as isLeitung } from "@/lib/zeiterfassung-auth";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
export async function GET(req: NextRequest) {
    const ctx = await resolve(req);
    if (!ctx)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (isLeitung(ctx.role)) {
        const [{ data: active, error: ae }, { data: today }, { data: myEntry }] = await Promise.all([
            admin.from("time_entries").select("*").eq("facility", ctx.facility).is("check_out", null)
                .gte("check_in", todayStart.toISOString()).order("check_in", { ascending: false }),
            admin.from("time_entries").select("*").eq("facility", ctx.facility)
                .gte("check_in", todayStart.toISOString()).order("check_in", { ascending: false }).limit(200),
            admin.from("time_entries").select("*").eq("user_id", ctx.user.id).is("check_out", null)
                .order("check_in", { ascending: false }).limit(1).single(),
        ]);
        if (tabelleFehlt(ae) || spalteFehlt(ae))
            return NextResponse.json({ role: "leitung", active: [], today: [], myEntry: null, tableMissing: true });
        return NextResponse.json({ role: "leitung", active: active ?? [], today: today ?? [], myEntry: myEntry ?? null });
    }
    const { data: activeRow, error: ae } = await admin.from("time_entries")
        .select("*").eq("user_id", ctx.user.id).is("check_out", null)
        .order("check_in", { ascending: false }).limit(1).single();
    if (tabelleFehlt(ae) || spalteFehlt(ae))
        return NextResponse.json({ role: "mitarbeiter", active: null, tableMissing: true });
    return NextResponse.json({
        role: "mitarbeiter",
        active: ae?.code === "PGRST116" ? null : (activeRow ?? null),
    });
}
export async function POST(req: NextRequest) {
    const rateLimitResponse = await checkRateLimit(req, "zeiterfassung-post", { limit: 20, windowMs: 60000 });
    if (rateLimitResponse)
        return rateLimitResponse;
    const ctx = await resolve(req);
    if (!ctx)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const { station, latitude, longitude, location_verified, check_in: checkInOverride, offline_token } = await req.json().catch(() => ({}));
    const admin = createAdminClient();
    if (checkInOverride) {
        if (!offline_token) {
            return NextResponse.json({ error: "Offline-Check-ins erfordern ein gültiges Token" }, { status: 400 });
        }
        const { data: tokenRow, error: te } = await admin.from("checkin_tokens")
            .select("id, user_id, facility, issued_at, used_at, expires_at")
            .eq("token", offline_token).single();
        if (te || !tokenRow)
            return NextResponse.json({ error: "Ungültiges Token" }, { status: 403 });
        if (tokenRow.used_at)
            return NextResponse.json({ error: "Token bereits verwendet" }, { status: 403 });
        if (new Date(tokenRow.expires_at) < new Date())
            return NextResponse.json({ error: "Token abgelaufen" }, { status: 403 });
        if (tokenRow.user_id !== ctx.user.id)
            return NextResponse.json({ error: "Token gehört nicht zu diesem Nutzer" }, { status: 403 });
        const claimedIn = new Date(checkInOverride);
        const tokenIssued = new Date(tokenRow.issued_at);
        if (claimedIn < tokenIssued) {
            return NextResponse.json({ error: "Ungültiger Zeitstempel — vor Token-Ausstellung" }, { status: 400 });
        }
        if (claimedIn > new Date(Date.now() + 2 * 60000)) {
            return NextResponse.json({ error: "Ungültiger Zeitstempel — liegt in der Zukunft" }, { status: 400 });
        }
        await admin.from("checkin_tokens").update({ used_at: new Date().toISOString() }).eq("id", tokenRow.id);
    }
    const { data: existing } = await admin.from("time_entries").select("id").eq("user_id", ctx.user.id).is("check_out", null).limit(1).single();
    if (existing)
        return NextResponse.json({ error: "Du bist bereits angemeldet" }, { status: 409 });
    const insertPayload: Record<string, unknown> = {
        user_id: ctx.user.id,
        user_name: ctx.name,
        facility: ctx.facility,
        station: station || null,
        location_verified: location_verified ?? false,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
    };
    if (checkInOverride)
        insertPayload.check_in = checkInOverride;
    const { data, error } = await admin.from("time_entries").insert(insertPayload).select().single();
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: "Tabelle fehlt — SQL ausführen", tableMissing: true }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ entry: data });
}
export async function PATCH(req: NextRequest) {
    const rateLimitResponse = await checkRateLimit(req, "zeiterfassung-patch", { limit: 20, windowMs: 60000 });
    if (rateLimitResponse)
        return rateLimitResponse;
    const ctx = await resolve(req);
    if (!ctx)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const { id, latitude, longitude, location_verified, check_out: checkOutOverride, pause_action } = await req.json().catch(() => ({}));
    if (!id)
        return NextResponse.json({ error: "ID erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    type EntryRow = {
        check_in: string;
        paused_at: string | null;
        total_pause_minutes: number | null;
    };
    const first = await admin.from("time_entries")
        .select("check_in, paused_at, total_pause_minutes")
        .eq("id", id).eq("user_id", ctx.user.id).maybeSingle();
    let entry: EntryRow | null = (first.data as EntryRow) ?? null;
    if (spalteFehlt(first.error)) {
        const retry = await admin.from("time_entries")
            .select("check_in").eq("id", id).eq("user_id", ctx.user.id).maybeSingle();
        entry = retry.data ? { check_in: retry.data.check_in as string, paused_at: null, total_pause_minutes: 0 } : null;
    }
    if (!entry)
        return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });
    if (pause_action === "pause") {
        const { data, error } = await admin.from("time_entries")
            .update({ paused_at: new Date().toISOString() })
            .eq("id", id).eq("user_id", ctx.user.id).select().single();
        if (spalteFehlt(error))
            return NextResponse.json({ entry: { ...entry, paused_at: new Date().toISOString() } });
        if (error)
            return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ entry: data });
    }
    if (pause_action === "resume") {
        const pausedAt = entry.paused_at as string | null;
        if (!pausedAt)
            return NextResponse.json({ error: "Nicht pausiert" }, { status: 400 });
        const addedMins = Math.round((Date.now() - new Date(pausedAt).getTime()) / 60000);
        const newTotal = ((entry.total_pause_minutes as number) ?? 0) + addedMins;
        const { data, error } = await admin.from("time_entries")
            .update({ paused_at: null, total_pause_minutes: newTotal })
            .eq("id", id).eq("user_id", ctx.user.id).select().single();
        if (spalteFehlt(error))
            return NextResponse.json({ entry: { ...entry, paused_at: null, total_pause_minutes: newTotal } });
        if (error)
            return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ entry: data });
    }
    const checkOut = checkOutOverride || new Date().toISOString();
    let totalPauseMins = ((entry.total_pause_minutes as number) ?? 0);
    if (entry.paused_at) {
        totalPauseMins += Math.round((new Date(checkOut).getTime() - new Date(entry.paused_at as string).getTime()) / 60000);
    }
    const rawDuration = Math.round((new Date(checkOut).getTime() - new Date(entry.check_in as string).getTime()) / 60000);
    const durationMinutes = Math.max(0, rawDuration - totalPauseMins);
    const requiredBreakMinutes = durationMinutes > 9 * 60 ? 45 : durationMinutes > 6 * 60 ? 30 : 0;
    const breakCompliant = totalPauseMins >= requiredBreakMinutes;
    const updatePayload: Record<string, unknown> = {
        check_out: checkOut,
        duration_minutes: durationMinutes,
        paused_at: null,
        total_pause_minutes: totalPauseMins,
        required_break_minutes: requiredBreakMinutes,
        break_compliant: breakCompliant,
    };
    if (latitude != null)
        updatePayload.checkout_latitude = latitude;
    if (longitude != null)
        updatePayload.checkout_longitude = longitude;
    if (location_verified != null)
        updatePayload.checkout_location_verified = location_verified;
    let { data, error } = await admin.from("time_entries").update(updatePayload)
        .eq("id", id).eq("user_id", ctx.user.id).select().single();
    if (spalteFehlt(error)) {
        const fallback: Record<string, unknown> = { check_out: checkOut, duration_minutes: durationMinutes };
        const retry = await admin.from("time_entries").update(fallback)
            .eq("id", id).eq("user_id", ctx.user.id).select().single();
        data = retry.data;
        error = retry.error;
    }
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    after(() => recalcBurnoutAfterShift(admin, ctx.facility));
    after(() => recordShiftReportAfterCheckout(admin, ctx.facility, ctx.user.id));
    return NextResponse.json({ entry: data });
}
