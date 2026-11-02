import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { tabelleFehlt } from "@/lib/db-fehler";
import { berlinTodayISO } from "@/lib/date";
const SHIFT_LABEL: Record<string, string> = {
    frueh: "Früh", spaet: "Spät", nacht: "Nacht",
    Frühschicht: "Früh", Spätschicht: "Spät", Nachtschicht: "Nacht",
};
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const station = typeof body.station === "string" && body.station.trim() ? body.station.trim() : null;
    const date = typeof body.date === "string" && body.date ? body.date : berlinTodayISO();
    const shiftType = typeof body.shift_type === "string" && body.shift_type ? body.shift_type : null;
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    const admin = createAdminClient();
    const shiftMatches = (candidateShift: string | null) => !shiftType || !candidateShift || candidateShift === shiftType;
    const [onCallRes, availRes, leitungRes] = await Promise.all([
        admin.from("on_call_entries").select("user_id, shift_type").eq("facility_name", ctx.facilityName).eq("on_call_date", date),
        admin.from("availability_entries").select("user_id, shift_type").eq("facility_name", ctx.facilityName).eq("available_date", date),
        admin.from("user_profiles").select("id").eq("facility", ctx.facilityName).eq("role", "leitung"),
    ]);
    const springerIds = new Set<string>();
    for (const r of [...(onCallRes.data ?? []), ...(availRes.data ?? [])]) {
        const uid = r.user_id as string | null;
        if (uid && uid !== ctx.userId && shiftMatches((r.shift_type as string | null) ?? null))
            springerIds.add(uid);
    }
    const leitungIds = (leitungRes.data ?? []).map((l: {
        id: string;
    }) => l.id as string).filter(id => id !== ctx.userId);
    const dateStr = new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    const shiftStr = shiftType ? ` (${SHIFT_LABEL[shiftType] ?? shiftType})` : "";
    const stationStr = station ? `${station} ` : "Die Einrichtung ";
    const rows: {
        user_id: string;
        facility_name: string;
        title: string;
        message: string;
        read: boolean;
    }[] = [];
    for (const uid of springerIds) {
        rows.push({
            user_id: uid,
            facility_name: ctx.facilityName,
            title: "Springer gesucht",
            message: `${stationStr}braucht dich am ${dateStr}${shiftStr} als Springer.${note ? ` Hinweis: ${note}.` : ""} Bitte bei der Leitung melden.`,
            read: false,
        });
    }
    for (const uid of leitungIds) {
        rows.push({
            user_id: uid,
            facility_name: ctx.facilityName,
            title: "Verstärkung angefordert",
            message: `${stationStr}braucht zusätzliches Personal am ${dateStr}${shiftStr}.${note ? ` Hinweis: ${note}.` : ""} Bitte Springer einplanen.`,
            read: false,
        });
    }
    if (rows.length === 0) {
        return NextResponse.json({ ok: true, springerNotified: 0, leitungNotified: 0, note: "Niemand zum Benachrichtigen gefunden" });
    }
    const { error } = await admin.from("notifications").insert(rows);
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ ok: true, springerNotified: 0, leitungNotified: 0 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, springerNotified: springerIds.size, leitungNotified: leitungIds.length });
}
