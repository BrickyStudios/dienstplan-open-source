import { NextRequest, NextResponse } from "next/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { checkRateLimit } from "@/lib/rate-limit";
import { tabelleFehlt, spalteFehlt } from "@/lib/db-fehler";
import { addDaysISO, berlinTodayISO } from "@/lib/date";
import { meineSchichten, zuordnungenFuer } from "@/lib/meine-schichten";
import { createNotification, notifyLeitung } from "@/lib/notify";
import { FALLBACK_TIME, SHIFT_LABEL } from "@/lib/ai-guard-daten";
import { meldungenErlaubt } from "@/lib/meldungen-erlaubt";
const MIGRATION = "Migration fehlt: supabase/migrations/20261010_verspaetung_und_rueckmeldung.sql";
async function wer(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return null;
    const admin = createAdminClient();
    const { data: p } = await admin.from("user_profiles")
        .select("full_name, facility, role, station").eq("id", user.id).maybeSingle();
    if (!p?.facility)
        return null;
    return { userId: user.id, name: p.full_name || user.email || "Unbekannt", facility: p.facility as string, station: (p.station as string | null) ?? null };
}
export async function GET(req: NextRequest) {
    const w = await wer(req);
    if (!w)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    return NextResponse.json({ erlaubt: (await meldungenErlaubt(w.facility)).verspaetung });
}
export async function POST(req: NextRequest) {
    const limit = await checkRateLimit(req, "verspaetung", { limit: 5, windowMs: 60 * 60000 });
    if (limit)
        return limit;
    const w = await wer(req);
    if (!w)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    if (!(await meldungenErlaubt(w.facility)).verspaetung) {
        return NextResponse.json({
            error: "Verspätungen nimmt deine Einrichtung nicht über die App an. Bitte ruf die Leitung oder deine Stationsleitung an.",
            gesperrt: true,
        }, { status: 403 });
    }
    const body = (await req.json().catch(() => null)) as {
        minuten?: unknown;
        notiz?: unknown;
    } | null;
    const m = Number(body?.minuten);
    const minuten = Number.isFinite(m) && m >= 1 ? Math.min(600, Math.round(m)) : null;
    const notiz = typeof body?.notiz === "string" ? body.notiz.trim().slice(0, 300) : "";
    const admin = createAdminClient();
    const heute = berlinTodayISO();
    const { data: schichtRows } = await admin.from("shifts")
        .select("id, station, date, shift_type, start_time, end_time")
        .eq("facility_name", w.facility).gte("date", heute).lte("date", addDaysISO(heute, 1))
        .order("date").order("start_time");
    const schichten = (schichtRows ?? []) as {
        id: string;
        station: string;
        date: string;
        shift_type: string;
        start_time: string | null;
        end_time: string | null;
    }[];
    const zuordnungen = await zuordnungenFuer(admin, w.facility, schichten.map(s => s.id));
    const meine = meineSchichten(schichten, zuordnungen, w.name, w.userId);
    const naechste = meine[0] ?? null;
    const station = naechste?.station ?? w.station;
    const tag = naechste ? (naechste.date === heute ? "heute" : "morgen") : null;
    const ab = naechste ? (naechste.start_time ?? FALLBACK_TIME[naechste.shift_type]?.start ?? "").slice(0, 5) : "";
    const schicht = naechste
        ? `${SHIFT_LABEL[naechste.shift_type] ?? naechste.shift_type} ${tag} ab ${ab}${naechste.station ? `, ${naechste.station}` : ""}`
        : null;
    const { error } = await admin.from("verspaetungen").insert({
        facility_name: w.facility, user_id: w.userId, staff_name: w.name,
        datum: naechste?.date ?? heute, schicht, minuten, notiz: notiz || null,
    });
    if (tabelleFehlt(error) || spalteFehlt(error))
        return NextResponse.json({ error: MIGRATION }, { status: 500 });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    const titel = `Verspätung: ${w.name}`;
    const text = `${w.name} kommt ${minuten ? `etwa ${minuten} Minuten ` : ""}später` +
        `${schicht ? ` zum ${schicht}` : ""}.` +
        `${notiz ? ` Notiz: „${notiz}"` : ""}`;
    await notifyLeitung(admin, w.facility, titel, text);
    let stationsleitungen = 0;
    if (station) {
        const { data: leiter } = await admin.from("station_leaders").select("user_id")
            .eq("facility_name", w.facility).eq("station_name", station);
        for (const l of (leiter ?? []) as {
            user_id: string;
        }[]) {
            if (l.user_id === w.userId)
                continue;
            await createNotification(admin, { userId: l.user_id, facility: w.facility, title: titel, message: text });
            stationsleitungen++;
        }
    }
    return NextResponse.json({ ok: true, schicht, stationsleitungen });
}
