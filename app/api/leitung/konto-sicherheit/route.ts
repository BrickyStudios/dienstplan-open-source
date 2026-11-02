import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/admin-client";
import { tabelleFehlt } from "@/lib/db-fehler";
import { resolveLeitung } from "@/lib/leitung-auth";
const TAGE = 30;
export type KontoBefund = {
    name: string;
    fehlversuche: number;
    letzterFehlversuch: string | null;
    laender: string[];
    gesperrt: boolean;
    neueAnmeldungen: {
        zeit: string;
        geraet: string;
        ort: string | null;
    }[];
};
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const db = admin();
    const { data: leute, error: pErr } = await db
        .from("user_profiles")
        .select("id, full_name, email")
        .eq("facility", ctx.facilityName);
    if (pErr)
        return NextResponse.json({ error: pErr.message }, { status: 500 });
    const personen = (leute ?? []).filter(p => p.id);
    const seit = new Date(Date.now() - TAGE * 86400000).toISOString();
    const adressen = personen.map(p => (p.email ?? "").toLowerCase()).filter(Boolean);
    const ids = personen.map(p => p.id as string);
    const [fehl, neu] = await Promise.all([
        adressen.length
            ? db.from("sicherheits_ereignisse")
                .select("erstellt_am, land, details, hat_gesperrt")
                .eq("art", "login_fehlgeschlagen")
                .in("details->>konto", adressen)
                .gte("erstellt_am", seit)
                .order("erstellt_am", { ascending: false })
                .limit(1000)
            : Promise.resolve({ data: [], error: null }),
        ids.length
            ? db.from("konto_anmeldungen")
                .select("user_id, erstellt_am, geraet, stadt, land")
                .in("user_id", ids)
                .eq("neu", true)
                .gte("erstellt_am", seit)
                .order("erstellt_am", { ascending: false })
                .limit(500)
            : Promise.resolve({ data: [], error: null }),
    ]);
    if (neu.error && tabelleFehlt(neu.error)) {
        return NextResponse.json({ migrationFehlt: true, konten: [], tage: TAGE });
    }
    if (fehl.error || neu.error) {
        return NextResponse.json({ error: (fehl.error ?? neu.error)!.message }, { status: 500 });
    }
    const befunde = new Map<string, KontoBefund>();
    const nachAdresse = new Map(personen.map(p => [(p.email ?? "").toLowerCase(), p]));
    const nachId = new Map(personen.map(p => [p.id as string, p]));
    const holen = (p: {
        id: string;
        full_name: string | null;
        email: string | null;
    }) => {
        let b = befunde.get(p.id);
        if (!b) {
            b = { name: p.full_name || p.email || "Unbekannt", fehlversuche: 0, letzterFehlversuch: null, laender: [], gesperrt: false, neueAnmeldungen: [] };
            befunde.set(p.id, b);
        }
        return b;
    };
    for (const z of fehl.data ?? []) {
        const p = nachAdresse.get(String((z.details as {
            konto?: string;
        } | null)?.konto ?? ""));
        if (!p)
            continue;
        const b = holen(p);
        b.fehlversuche += 1;
        b.letzterFehlversuch ??= z.erstellt_am;
        if (z.land && !b.laender.includes(z.land))
            b.laender.push(z.land);
        if (z.hat_gesperrt)
            b.gesperrt = true;
    }
    for (const z of neu.data ?? []) {
        const p = nachId.get(z.user_id);
        if (!p)
            continue;
        holen(p).neueAnmeldungen.push({
            zeit: z.erstellt_am,
            geraet: z.geraet,
            ort: [z.stadt, z.land].filter(Boolean).join(", ") || null,
        });
    }
    const konten = [...befunde.values()].sort((a, b) => (b.fehlversuche + b.neueAnmeldungen.length) - (a.fehlversuche + a.neueAnmeldungen.length));
    return NextResponse.json({ konten, personen: personen.length, tage: TAGE });
}
