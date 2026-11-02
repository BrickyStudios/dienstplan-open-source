import { NextRequest, NextResponse } from "next/server";
import { admin as createAdmin } from "@/lib/admin-client";
import { resolveLeitung } from "@/lib/leitung-auth";
import { addDaysISO, berlinTodayISO, isISODate } from "@/lib/date";
import { spalteFehlt } from "@/lib/db-fehler";
import { buildStaffDirectory, resolveStaffId } from "@/lib/staff-identity";
import { ladeGenehmigteAbwesenheiten } from "@/lib/scheduling/plan-context";
import { einsatzStationenVon } from "@/lib/scheduling/generate-plan-core";
import { planeBereitschaftNach, type NachplanPerson } from "@/lib/scheduling/bereitschaft-nachplanen";
import { ladeNichtPflegeStationen } from "@/lib/nicht-pflege-stationen";
import { stationsdienst } from "@/lib/berufe";
import { dienstplanungVon } from "@/lib/scheduling/dienstplanung";
type Admin = ReturnType<typeof createAdmin>;
const MAX_TAGE = 400;
async function berechne(db: Admin, facility: string, vonWunsch: string | null, bisWunsch: string | null) {
    const heute = berlinTodayISO();
    const von = vonWunsch && isISODate(vonWunsch) && vonWunsch > heute ? vonWunsch : heute;
    let bis = bisWunsch && isISODate(bisWunsch) ? bisWunsch : null;
    if (!bis) {
        const { data: letzte } = await db.from("shifts").select("date")
            .eq("facility_name", facility).gte("date", von).order("date", { ascending: false }).limit(1).maybeSingle();
        bis = (letzte?.date as string | undefined) ?? null;
    }
    if (!bis || bis < von)
        return { von, bis: bis ?? von, ergebnis: null, schonBelegt: 0, tage: 0 };
    if (bis > addDaysISO(von, MAX_TAGE))
        bis = addDaysISO(von, MAX_TAGE);
    const [shiftsRes, staffRes, profilesRes, verfRes, wunschRes, bereitRes, bisherRes] = await Promise.all([
        db.from("shifts").select("id, date, station").eq("facility_name", facility).gte("date", von).lte("date", bis),
        db.from("facility_staff").select("*").eq("facility_name", facility).or("active.neq.false,active.is.null"),
        db.from("user_profiles").select("id, full_name, station").eq("facility", facility).eq("role", "mitarbeiter"),
        db.from("staff_availability").select("staff_id, day_of_week, available").eq("facility_name", facility),
        db.from("staff_wishes").select("user_id, full_name, wish_type, status, date_from, date_to")
            .eq("facility_name", facility).eq("wish_type", "unavailable").lte("date_from", bis),
        db.from("on_call_entries").select("on_call_date").eq("facility_name", facility).gte("on_call_date", von).lte("on_call_date", bis),
        db.from("on_call_entries").select("user_id, staff_name").eq("facility_name", facility)
            .gte("on_call_date", addDaysISO(von, -90)).lt("on_call_date", von),
    ]);
    const shifts = (shiftsRes.data ?? []) as {
        id: string;
        date: string;
        station: string;
    }[];
    const tage = [...new Set(shifts.map(s => s.date))];
    const stamm = (staffRes.data ?? []) as {
        id: string;
        full_name: string | null;
        station?: string | null;
        no_sunday_work?: boolean | null;
        einsatz_stationen?: unknown;
        role?: string | null;
        dienstplanung?: string | null;
    }[];
    const profile = (profilesRes.data ?? []) as {
        id: string;
        full_name: string | null;
        station: string | null;
    }[];
    const dir = buildStaffDirectory(stamm, profile);
    const stammNachName = new Map(stamm.map(s => [s.full_name ?? "", s]));
    const stationNachName = new Map(profile.map(p => [p.full_name ?? "", p.station]));
    const personen: NachplanPerson[] = [...dir.idByName].map(([name, id]) => {
        const s = stammNachName.get(name);
        return {
            id, name, noSundayWork: !!s?.no_sunday_work,
            station: (stationNachName.get(name) ?? s?.station) || null,
            einsatzStationen: einsatzStationenVon(s),
            stationsdienst: stationsdienst(s?.role),
            dienstplanung: dienstplanungVon(s),
        };
    });
    const dienstTage = new Map<string, Set<string>>();
    const datumVon = new Map(shifts.map(s => [s.id, s.date]));
    for (let i = 0; i < shifts.length; i += 300) {
        const { data } = await db.from("shift_assignments").select("shift_id, staff_id, staff_name, status")
            .eq("facility_name", facility).in("shift_id", shifts.slice(i, i + 300).map(s => s.id));
        for (const a of (data ?? []) as {
            shift_id: string;
            staff_id: string | null;
            staff_name: string;
            status: string | null;
        }[]) {
            if (a.status === "cancelled")
                continue;
            const id = resolveStaffId(dir, a.staff_id, a.staff_name);
            const tag = datumVon.get(a.shift_id);
            if (id && tag)
                (dienstTage.get(id) ?? dienstTage.set(id, new Set()).get(id)!).add(tag);
        }
    }
    const alleIds = [...new Set([...personen.map(p => p.id), ...stamm.map(s => s.id)])];
    const abwesenheiten = await ladeGenehmigteAbwesenheiten(db, { facilityName: facility, staffIds: alleIds, von, bis });
    const bisher: Record<string, number> = {};
    for (const b of (bisherRes.data ?? []) as {
        user_id: string | null;
        staff_name: string | null;
    }[]) {
        const id = resolveStaffId(dir, b.user_id, b.staff_name);
        if (id)
            bisher[id] = (bisher[id] ?? 0) + 1;
    }
    const belegt = new Set(((bereitRes.data ?? []) as {
        on_call_date: string;
    }[]).map(b => b.on_call_date));
    const ergebnis = planeBereitschaftNach({
        tage, personen, dienstTage, abwesenheiten,
        stationen: new Set(shifts.map(s => s.station).filter(Boolean)),
        nichtPflege: new Set(await ladeNichtPflegeStationen(db, facility)),
        verfuegbarkeit: (verfRes.data ?? []) as {
            staff_id: string;
            day_of_week: number;
            available: boolean;
        }[],
        wuensche: wunschRes.data ?? [],
        schonBelegt: belegt,
        bisher,
    });
    return { von, bis, ergebnis, schonBelegt: tage.filter(t => belegt.has(t)).length, tage: tage.length };
}
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx || !ctx.facilityName)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const p = req.nextUrl.searchParams;
    const r = await berechne(createAdmin(), ctx.facilityName, p.get("von"), p.get("bis"));
    return NextResponse.json({
        von: r.von, bis: r.bis, tage: r.tage, schonBelegt: r.schonBelegt,
        vorschlag: r.ergebnis?.bereitschaften ?? [], ohneKandidat: r.ergebnis?.ohneKandidat ?? [],
    });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx || !ctx.facilityName)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = (await req.json().catch(() => ({}))) as {
        von?: string;
        bis?: string;
    };
    const db = createAdmin();
    const r = await berechne(db, ctx.facilityName, body.von ?? null, body.bis ?? null);
    const neu = r.ergebnis?.bereitschaften ?? [];
    if (neu.length > 0) {
        const zeilen = neu.map(b => ({
            facility_name: ctx.facilityName, user_id: b.staff_id, staff_name: b.staff_name,
            on_call_date: b.date, shift_type: null, source: "plan",
        }));
        let { error } = await db.from("on_call_entries").insert(zeilen);
        if (error && spalteFehlt(error)) {
            ({ error } = await db.from("on_call_entries").insert(zeilen.map(({ source, ...z }) => { void source; return z; })));
        }
        if (error?.code === "23503") {
            ({ error } = await db.from("on_call_entries").insert(zeilen.map(z => ({ ...z, user_id: null }))));
        }
        if (error)
            return NextResponse.json({ error: error.message }, { status: 500 });
        const tageJeName: Record<string, number> = {};
        for (const b of neu)
            tageJeName[b.staff_name] = (tageJeName[b.staff_name] ?? 0) + 1;
        const { data: konten } = await db.from("user_profiles").select("id, full_name")
            .eq("facility", ctx.facilityName).in("full_name", Object.keys(tageJeName));
        const nachrichten = ((konten ?? []) as {
            id: string;
            full_name: string;
        }[]).map(k => ({
            user_id: k.id, facility_name: ctx.facilityName, read: false,
            title: "Du bist als Bereitschaft eingeplant",
            message: `Die Leitung hat Bereitschaften nachgeplant: Du bist an ${tageJeName[k.full_name]} Tag(en) als Bereitschaft/Springer eingeplant. Die Tage stehen unter „Mein Plan". Bei einem Ausfall wirst du kontaktiert.`,
        }));
        if (nachrichten.length)
            await db.from("notifications").insert(nachrichten).then(() => { }, () => { });
    }
    return NextResponse.json({
        von: r.von, bis: r.bis, tage: r.tage, schonBelegt: r.schonBelegt,
        eingeplant: neu.length, ohneKandidat: r.ergebnis?.ohneKandidat ?? [],
    });
}
