import { NextRequest, NextResponse } from "next/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { checkRateLimit } from "@/lib/rate-limit";
import { tokenHash } from "@/lib/anbindungen/geheimnis";
import { addDaysISO, berlinTodayISO } from "@/lib/date";
import { icsBauen } from "@/lib/anbindungen/ics";
import { persoenlicheTermine, TAGE_VORAUS, TAGE_ZURUECK, type EigeneBereitschaft, type EigeneSchicht, } from "@/lib/mitarbeiter-kalender";
type Ctx = {
    params: Promise<{
        token: string;
    }>;
};
const UNBEKANNT = () => new NextResponse("Unbekannter Kalender.", { status: 404 });
export async function GET(req: NextRequest, { params }: Ctx) {
    const gesperrt = await checkRateLimit(req, "mitarbeiter-kalender", {
        limit: 60, windowMs: 60 * 60 * 1000,
        message: "Zu viele Abrufe. Der Kalender aktualisiert sich von selbst.",
    });
    if (gesperrt)
        return gesperrt;
    const { token } = await params;
    const sauber = token.replace(/\.ics$/i, "");
    if (sauber.length < 20)
        return UNBEKANNT();
    const admin = createAdminClient();
    const { data: abo, error } = await admin
        .from("mitarbeiter_kalender").select("user_id, facility_name")
        .eq("token_hash", tokenHash(sauber)).maybeSingle();
    if (error || !abo)
        return UNBEKANNT();
    const von = addDaysISO(berlinTodayISO(), -TAGE_ZURUECK);
    const bis = addDaysISO(berlinTodayISO(), TAGE_VORAUS);
    const { data: zuordnungen } = await admin
        .from("shift_assignments").select("shift_id")
        .eq("facility_name", abo.facility_name).eq("staff_id", abo.user_id);
    const ids = [...new Set((zuordnungen ?? []).map((z: {
            shift_id: string;
        }) => z.shift_id))];
    let schichten: EigeneSchicht[] = [];
    for (let i = 0; i < ids.length; i += 300) {
        const { data } = await admin
            .from("shifts").select("id, date, shift_type, start_time, end_time, station")
            .eq("facility_name", abo.facility_name).in("id", ids.slice(i, i + 300))
            .gte("date", von).lte("date", bis);
        schichten = schichten.concat((data ?? []) as EigeneSchicht[]);
    }
    const { data: bereitschaften } = await admin
        .from("on_call_entries").select("on_call_date, shift_type")
        .eq("facility_name", abo.facility_name).eq("user_id", abo.user_id)
        .gte("on_call_date", von).lte("on_call_date", bis)
        .then((r: {
        data: unknown;
    }) => r, () => ({ data: [] }));
    await admin.from("mitarbeiter_kalender").update({ letzter_abruf: new Date().toISOString() })
        .eq("user_id", abo.user_id).then(() => { }, () => { });
    const kalender = icsBauen(persoenlicheTermine(schichten, (bereitschaften ?? []) as EigeneBereitschaft[]), {
        name: "Meine Dienste (Nurvo)",
    });
    return new NextResponse(kalender, {
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": 'inline; filename="meine-dienste.ics"',
            "Cache-Control": "no-store, max-age=0",
            "X-Robots-Tag": "noindex, nofollow",
        },
    });
}
