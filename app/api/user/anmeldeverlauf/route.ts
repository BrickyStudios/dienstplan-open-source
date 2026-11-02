import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/admin-client";
import { tabelleFehlt } from "@/lib/db-fehler";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
export type Anmeldezeile = {
    zeit: string;
    geraet: string;
    ort: string | null;
    ip: string | null;
    neu: boolean;
};
export type Fehlversuchzeile = {
    zeit: string;
    ort: string | null;
    ip: string;
    stufe: string;
    gesperrt: boolean;
};
const TAGE = 30;
export async function GET(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const db = admin();
    const seit = new Date(Date.now() - TAGE * 86400000).toISOString();
    const email = (user.email ?? "").toLowerCase();
    const [anm, fehl] = await Promise.all([
        db.from("konto_anmeldungen")
            .select("erstellt_am, geraet, stadt, land, ip, neu")
            .eq("user_id", user.id)
            .order("erstellt_am", { ascending: false })
            .limit(20),
        email
            ? db.from("sicherheits_ereignisse")
                .select("erstellt_am, stadt, land, ip, details, hat_gesperrt")
                .eq("art", "login_fehlgeschlagen")
                .eq("details->>konto", email)
                .gte("erstellt_am", seit)
                .order("erstellt_am", { ascending: false })
                .limit(50)
            : Promise.resolve({ data: [], error: null }),
    ]);
    if (anm.error && tabelleFehlt(anm.error)) {
        return NextResponse.json({ migrationFehlt: true, anmeldungen: [], fehlversuche: [] });
    }
    if (anm.error)
        return NextResponse.json({ error: anm.error.message }, { status: 500 });
    const ort = (z: {
        stadt: string | null;
        land: string | null;
    }) => [z.stadt, z.land].filter(Boolean).join(", ") || null;
    const anmeldungen: Anmeldezeile[] = (anm.data ?? []).map(z => ({
        zeit: z.erstellt_am, geraet: z.geraet, ort: ort(z), ip: z.ip, neu: z.neu,
    }));
    const fehlversuche: Fehlversuchzeile[] = (fehl.data ?? []).map(z => ({
        zeit: z.erstellt_am,
        ort: ort(z),
        ip: z.ip,
        stufe: (z.details as {
            stufe?: string;
        } | null)?.stufe === "zweiter_faktor" ? "zweiter Faktor" : "Passwort",
        gesperrt: z.hat_gesperrt,
    }));
    return NextResponse.json({ anmeldungen, fehlversuche, tage: TAGE });
}
