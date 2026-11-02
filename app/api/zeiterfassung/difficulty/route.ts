import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { NextRequest, NextResponse } from "next/server";
import { istNurvoAdmin } from "@/lib/admin-auth";
import { tabelleFehlt } from "@/lib/db-fehler";
import { berlinTodayISO, berlinTagISO } from "@/lib/date";
async function resolveUser(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return null;
    const admin = createAdminClient();
    const { data: profile } = await admin.from("user_profiles").select("facility").eq("id", user.id).single();
    const facility = await istNurvoAdmin(user.email)
        ? req.cookies.get("nurvo_access_facility")?.value ?? ""
        : profile?.facility ?? "";
    return { userId: user.id, facility };
}
export async function POST(req: NextRequest) {
    const ctx = await resolveUser(req);
    if (!ctx)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const { rating, note, station, shiftDate, shiftType, timeEntryId } = await req.json().catch(() => ({}));
    if (!rating || rating < 1 || rating > 5) {
        return NextResponse.json({ error: "rating muss 1–5 sein" }, { status: 400 });
    }
    const admin = createAdminClient();
    const { error } = await admin.from("shift_difficulty_ratings").insert({
        user_id: ctx.userId,
        facility: ctx.facility,
        station: station ?? null,
        shift_date: shiftDate ?? berlinTodayISO(),
        shift_type: shiftType ?? null,
        rating,
        note: note ?? null,
        time_entry_id: timeEntryId ?? null,
    });
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: "Tabelle fehlt — SQL ausführen", tableMissing: true }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
export async function GET(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from("user_profiles").select("role, facility").eq("id", user.id).single();
    if (profile?.role !== "leitung")
        return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") ?? berlinTagISO(-90);
    const to = searchParams.get("to") ?? berlinTodayISO();
    const { data, error } = await admin.from("shift_difficulty_ratings")
        .select("shift_date, station, shift_type, rating")
        .eq("facility", profile.facility)
        .gte("shift_date", from)
        .lte("shift_date", to)
        .order("shift_date", { ascending: false });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ratings: data ?? [] });
}
